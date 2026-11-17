import { inspectHtml } from '../../../scripts/rich-article.mjs';
import { setTimeout as wait } from 'node:timers/promises';

export const medium = 'https://medium.com';
export const draftPath = /^\/p\/([a-f0-9]+)\/edit\/?$/i;
export const normalizeTitle = text => text.replace(/\s+/g, ' ').trim();

export async function verifyAccount(page, account) {
  await page.goto(medium + '/me/stories', { waitUntil: 'domcontentloaded' });
  const profile = page.getByRole('link', { name: 'Profile', exact: true }).filter({ visible: true });
  const href = await profile.getAttribute('href');
  const current = new URL(href, medium);
  if (current.origin !== medium || current.pathname.toLowerCase() !== '/@' + account.toLowerCase()) {
    throw new Error('The active Medium profile does not match --account.');
  }
}

export function editorFields(page) {
  const editor = page.locator('.js-postField[contenteditable="true"]');
  return { editor, title: editor.getByTestId('editorTitleParagraph') };
}

export async function assertDraft(page, title, expected) {
  const { editor, title: field } = editorFields(page);
  if (normalizeTitle(await field.innerText()) !== normalizeTitle(title)) {
    throw new Error('Medium did not retain the expected title.');
  }
  const observed = await editor.evaluate(element => {
    const body = element.cloneNode(true);
    for (const node of body.querySelectorAll('[data-testid="editorTitleParagraph"], .section-divider, .defaultValue')) node.remove();
    const normalized = value => value.replace(/[\s\ufeff\u200b]/g, '');
    const links = [...body.querySelectorAll('a[href]')].map(anchor => {
      let url = new URL(anchor.getAttribute('href'), location.origin);
      if (url.origin === 'https://medium.com' && /^\/r\/?$/.test(url.pathname) && url.searchParams.has('url')) {
        url = new URL(url.searchParams.get('url'));
      }
      return { href: url.href, label: anchor.textContent.trim() };
    });
    const structure = [...body.querySelectorAll('h1,h2,h3,h4,h5,h6,li,strong,b,em,i,pre,code,blockquote,table')].map(node => ({
      tag: /^H[1-6]$/.test(node.tagName) ? 'HEADING' : ({ B: 'STRONG', I: 'EM' })[node.tagName] || node.tagName,
      text: normalized(node.textContent),
    }));
    return { text: normalized(body.textContent), links, structure };
  });
  const structure = expected.structure.map(node => ({
    ...node, tag: /^H[1-6]$/.test(node.tag) ? 'HEADING' : node.tag,
  }));
  if (observed.text !== expected.text || JSON.stringify(observed.links) !== JSON.stringify(expected.links) ||
      JSON.stringify(observed.structure) !== JSON.stringify(structure)) {
    throw new Error('Medium changed the article body, links, or formatting.');
  }
}

export async function prepareEditor(page, article, existingDraft) {
  if (existingDraft) {
    const url = new URL(existingDraft);
    if (url.origin !== medium || url.username || url.password || !draftPath.test(url.pathname)) {
      throw new Error('Use the Medium editor URL of the intended draft.');
    }
    await page.goto(url.origin + url.pathname, { waitUntil: 'domcontentloaded' });
  } else {
    await page.goto(medium + '/new-story', { waitUntil: 'domcontentloaded' });
  }
  const { editor, title } = editorFields(page);
  await editor.waitFor();
  const expected = await page.evaluate(inspectHtml, article.html);
  if (!existingDraft) {
    const empty = await editor.evaluate(element => [...element.querySelectorAll('.graf')].every(graf =>
      graf.querySelector('.defaultValue') || !graf.textContent.trim()));
    if (!empty) throw new Error('The Medium editor already contains a draft.');
    await title.click();
    await page.keyboard.type(article.title, { delay: 10 });
    const firstParagraph = editor.getByTestId('editorParagraphText').first();
    await firstParagraph.click();
    const saved = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.origin === medium && /^\/p\/[a-f0-9]+\/deltas$/i.test(url.pathname) && response.ok();
    }, { timeout: 20000 }).catch(() => null);
    await firstParagraph.evaluate((element, html) => {
      const data = new DataTransfer();
      data.setData('text/html', html);
      data.setData('text/plain', new DOMParser().parseFromString(html, 'text/html').body.textContent);
      element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
    }, expected.html);
    await assertDraft(page, article.title, expected);
    await page.waitForURL(url => url.origin === medium && draftPath.test(url.pathname), {
      timeout: 20000, waitUntil: 'domcontentloaded',
    });
    if (!await saved) throw new Error('Medium did not confirm saving the article body.');
    await wait(650);
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  await assertDraft(page, article.title, expected);
  const url = new URL(page.url());
  const postId = draftPath.exec(url.pathname)?.[1];
  if (url.origin !== medium || !postId) throw new Error('Medium did not return a stable draft URL.');
  return { expected, postId, draftUrl: medium + '/p/' + postId + '/edit' };
}
