import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { readRichArticle, inspectHtml } from '../../../../scripts/rich-article.mjs';
import { parseOptions } from './options.mjs';
import { confirmPostWithoutTags } from './publish.mjs';

let cdpUrl;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const plain = s => s.replace(/[\s\uFEFF\u200B]/g, '');
function safeError(error) {
  let message = String(error.message || error);
  for (const secret of [cdpUrl, process.env.CDP_URL]) {
    if (secret) message = message.split(secret).join('[REDACTED]');
  }
  return message.replace(/wss?:\/\/\S+/g, '[CDP REDACTED]');
}

async function connect(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await chromium.connectOverCDP(url, { timeout: 60000, noDefaults: true }); }
    catch (error) {
      if (attempt || !/502|503|ECONNRESET|ETIMEDOUT|timeout/i.test(error.message)) throw error;
      console.log('CDP is temporarily unavailable. Retrying once in 10 seconds.');
      await sleep(10000);
    }
  }
}

async function main() {
  const values = parseOptions();
  cdpUrl = values.cdp;
  const article = await readRichArticle(values);
  const dir = values['artifacts-dir'];
  await mkdir(dir, { recursive: true });
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
  const artifact = join(dir, `${runId}-content.json`);
  await writeFile(artifact, JSON.stringify(article, null, 2), { mode: 0o600 });
  if (values['prepare-only']) {
    console.log(`Article prepared: ${artifact}`);
    return;
  }

  const hash = createHash('sha256')
    .update(JSON.stringify({ blog: values.blog, title: article.title, html: article.html })).digest('hex');
  const receipt = join(dir, `post-${hash}.json`);
  const browser = await connect(cdpUrl);
  let page;
  let submitted = false;
  let preview = false;
  try {
    const context = browser.contexts()[0];
    if (!context) throw new Error('CDP did not return an existing browser context.');
    page = await context.newPage();
    page.setDefaultTimeout(30000);
    await page.goto('https://www.tumblr.com/new/text', { waitUntil: 'domcontentloaded' });
    if (new URL(page.url()).origin !== 'https://www.tumblr.com') throw new Error('Could not open the Tumblr editor.');
    const expected = await page.evaluate(inspectHtml, article.html);
    const modal = page.getByRole('dialog').filter({ has: page.locator('h1[contenteditable="true"]') });
    await modal.waitFor({ state: 'visible' });
    const blogButton = modal.getByRole('button', { name: /^Select a blog\. Current selection is / });
    const selectedBlog = (await blogButton.getAttribute('aria-label')).replace('Select a blog. Current selection is ', '').trim();
    if (selectedBlog !== values.blog) throw new Error(`The selected blog (${selectedBlog}) differs from --blog. Switch to the intended blog.`);
    console.log(`Target blog: ${selectedBlog}`);
    const titleField = modal.locator('h1[contenteditable="true"]');
    const bodyField = modal.locator('p[contenteditable="true"]').first();
    await bodyField.waitFor({ state: 'visible' });
    const initialText = await modal.locator('[contenteditable="true"]').allTextContents();
    if (initialText.some(s => plain(s))) throw new Error('The editor already contains content. Open a blank draft.');

    await titleField.fill(article.title);
    await bodyField.click();
    await bodyField.evaluate((element, { html }) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/html', html);
      clipboardData.setData('text/plain', new DOMParser().parseFromString(html, 'text/html').body.textContent);
      element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
    }, article);
    await page.waitForFunction(({ text }) => {
      const fields = [...document.querySelectorAll('[role="dialog"] [contenteditable="true"]')];
      const title = fields.find(field => field.tagName === 'H1');
      const body = fields.filter(field => field !== title && !field.querySelector('[contenteditable="true"]'));
      return body.map(field => field.textContent).join('').replace(/[\s\uFEFF\u200B]/g, '') === text;
    }, expected, { timeout: 10000 });
    if ((await titleField.innerText()).trim() !== article.title) throw new Error('The editor title differs from the source.');
    const expectedLinks = expected.links;
    const actualLinks = await modal.locator('[contenteditable="true"] a').evaluateAll(anchors =>
      anchors.map(a => ({ href: a.href, label: a.textContent.trim() })));
    if (JSON.stringify(actualLinks) !== JSON.stringify(expectedLinks)) throw new Error('The editor links differ from the source.');
    const postButton = modal.getByRole('button', { name: /^(Post|Post now)$/ });
    await postButton.waitFor({ state: 'visible' });
    if (!await postButton.isEnabled()) throw new Error('The Post button is still disabled.');
    const previewPath = join(dir, `${runId}-preview.png`);
    await page.screenshot({ path: previewPath });
    if (values['dry-run']) {
      preview = true;
      console.log(`Editor preview: ${previewPath}`);
      return;
    }
    await writeFile(receipt, JSON.stringify({ status: 'submitting', blog: selectedBlog, title: article.title, runId }, null, 2), { flag: 'wx', mode: 0o600 });
    // Wait for the create-post response to confirm submission.
    const responsePromise = page.waitForResponse(response => {
      const request = response.request();
      const url = new URL(response.url());
      return url.hostname === 'www.tumblr.com' && request.method() === 'POST'
        && /^\/api\/v2\/blog\/[^/]+\/posts\/?$/.test(url.pathname);
    }, { timeout: 45000 }).then(response => ({ response }), error => ({ error }));
    submitted = true;
    await postButton.click(); // Submit once. Reconcile a timeout before retrying.
    if (await confirmPostWithoutTags(page)) console.log('Confirmed submission without tags.');
    const observed = await responsePromise;
    if (observed.error) throw new Error('No publish response was received. Check the blog before retrying.');
    const response = observed.response;
    if (!response.ok()) throw new Error(`The publish request returned HTTP ${response.status()}. Check the blog and editor.`);
    const payload = await response.json().catch(() => null);
    const postId = payload?.response?.id_string || payload?.response?.id || payload?.response?.post?.id;
    if (!postId) throw new Error('The publish response did not include a post ID. Check the blog before retrying.');
    await writeFile(receipt, JSON.stringify({ status: 'submitted', blog: selectedBlog, title: article.title, postId: String(postId), runId }, null, 2), { mode: 0o600 });
    console.log(`Tumblr returned post ID ${postId}. Verify the article and public URL on the target blog.`);
  } catch (error) {
    if (submitted && receipt) await writeFile(receipt, JSON.stringify({ status: 'unknown', blog: values.blog, title: article.title, runId, error: safeError(error) }, null, 2), { mode: 0o600 }).catch(() => {});
    if (page) await page.screenshot({ path: join(dir, `${runId}-error.png`) }).catch(() => {});
    throw error;
  } finally {
    if (!preview) await page?.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch(error => { console.error(safeError(error)); process.exitCode = 1; });
