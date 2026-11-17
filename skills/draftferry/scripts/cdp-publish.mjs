import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { inspectHtml } from './rich-article.mjs';

export function endpointFor(platform) {
  const endpoint = process.env['DRAFTFERRY_' + platform.toUpperCase() + '_CDP_URL'] || process.env.CDP_URL;
  if (!endpoint) throw new Error(`Set the CDP endpoint for ${platform}.`);
  return endpoint;
}

export async function inCdpPage(platform, task) {
  const endpoint = endpointFor(platform);
  let browser, page;
  try {
    browser = await chromium.connectOverCDP(endpoint, { noDefaults: true, timeout: 12000 });
    const context = browser.contexts()[0];
    if (!context) throw new Error('No existing CDP browser context.');
    page = await context.newPage();
    page.setDefaultTimeout(12000);
    return await task(page);
  } catch (error) {
    throw new Error(String(error.message).replaceAll(endpoint, '[CDP REDACTED]'));
  } finally {
    await page?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}

export function httpsOrigin(value) {
  if (!value) throw new Error('Provide the HTTPS origin for this destination.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.href !== url.origin + '/') {
    throw new Error('Provide an HTTPS origin without a path, query, or credentials.');
  }
  return url.origin;
}

export async function submitOnce(platform, destination, content, submit) {
  const dir = join('artifacts', platform);
  const key = createHash('sha256').update(JSON.stringify({ destination, content })).digest('hex');
  const receipt = join(dir, `post-${key}.json`);
  await mkdir(dir, { recursive: true });
  const save = (state, options) => writeFile(receipt, JSON.stringify({ destination, ...state }, null, 2), {
    mode: 0o600, ...options,
  });
  try {
    await save({ status: 'submitting' }, { flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Existing submission receipt. Check ${receipt} before posting again.`);
    throw error;
  }
  try {
    const result = await submit();
    await save(result);
    return { ...result, receipt };
  } catch (error) {
    await save({ status: 'unknown' }).catch(() => {});
    throw error;
  }
}

const normalize = text => text.replace(/[\s\u200b\ufeff]/g, '');

async function richEditorMatches(editor, expected) {
  const observed = await editor.evaluate(outer => ({
    text: outer.textContent.replace(/[\s\u200b\ufeff]/g, ''),
    links: [...outer.querySelectorAll('a')].map(a => ({ href: a.href, label: a.textContent.trim() })),
    structure: [...outer.querySelectorAll('h1,h2,h3,h4,h5,h6,li,strong,b,em,i,pre,code,blockquote,table')].map(e => ({
      tag: ({ B:'STRONG', I:'EM' })[e.tagName] || e.tagName,
      text: e.textContent.replace(/[\s\u200b\ufeff]/g, ''),
    })),
  }));
  return observed.text === normalize(expected.text) &&
    JSON.stringify(observed.links) === JSON.stringify(expected.links) &&
    JSON.stringify(observed.structure) === JSON.stringify(expected.structure);
}

export async function assertRichEditor(editor, expected) {
  const deadline = Date.now() + 6000;
  do {
    if (await richEditorMatches(editor, expected)) return;
    await wait(200);
  } while (Date.now() < deadline);
  throw new Error('The editor changed the article text, links, or structure.');
}

export async function pasteArticle(page, title, editor, article) {
  await title.waitFor();
  await editor.waitFor();
  if ((await fieldValue(title)).trim() || normalize(await editor.innerText())) {
    throw new Error('The editor already has content. Choose a new blank draft.');
  }
  const expected = await page.evaluate(inspectHtml, article.html);
  await title.fill(article.title);
  await editor.click();
  await editor.evaluate((element, html) => {
    const data = new DataTransfer();
    data.setData('text/html', html);
    data.setData('text/plain', new DOMParser().parseFromString(html, 'text/html').body.textContent);
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
  }, expected.html);
  if ((await fieldValue(title)).trim() !== article.title) throw new Error('The editor changed the title.');
  await assertRichEditor(editor, expected);
  return expected;
}

export function fieldValue(field) {
  return field.evaluate(element => 'value' in element ? element.value : element.innerText);
}
