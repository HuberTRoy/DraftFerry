import assert from 'node:assert/strict';
import { inspectHtml } from './blogger-content.mjs';

const visibleButton = (page, name) => page.getByRole('button', { name, exact: true }).filter({ visible: true });
export async function bodyEditor(page) {
  const iframe = page.locator('iframe.editable');
  await page.getByRole('textbox', { name: 'Title', exact: true }).waitFor();
  if (!await iframe.isVisible()) {
    await page.getByRole('listbox', { name: 'Toggle view', exact: true }).filter({visible:true}).click();
    await page.getByRole('option', {name:'Compose view',exact:true}).filter({visible:true}).click();
  }
  await iframe.waitFor({ state: 'visible', timeout: 45000 });
  const body = iframe.contentFrame().locator('body[contenteditable]');
  await body.waitFor(); return body;
}
// Compare semantic text and formatting, allowing browser wrappers and B/STRONG aliases.
export async function assertRichBody(locator, expected, editor = false) {
  const actual = await locator.evaluate((el, editor) => ({
    text: el.textContent.replace(/\s+/g, '').trim(),
    links: [...el.querySelectorAll('a')].map(a => {
      const original = editor && a.getAttribute('data-original-attrs');
      const href = original ? JSON.parse(original)['data-original-href'] : null;
      return { href: href || a.href, label: a.textContent.trim() };
    }),
    structure: [...el.querySelectorAll('h1,h2,h3,h4,h5,h6,li,strong,b,em,i,pre,code,blockquote,table')].map(e => ({ tag: ({B:'STRONG',I:'EM'})[e.tagName] || e.tagName, text: e.textContent.replace(/\s+/g, '') })),
  }), editor);
  assert.deepEqual(actual, { text: expected.text, links: expected.links, structure: expected.structure }, 'The rich-text body, links, or formatting differ from the source.');
}
export async function fillEditor(page, post) {
  const expected = await page.evaluate(inspectHtml, post.html);
  const title = page.getByRole('textbox', { name: 'Title', exact: true });
  await title.waitFor();
  const body = await bodyEditor(page);
  if ((await title.inputValue()).trim() || (await body.innerText()).trim()) throw new Error('The new article already contains content. Open a blank draft.');
  await title.fill(post.title);
  await body.evaluate((el, html) => {
    el.focus();
    const selection = el.ownerDocument.getSelection();
    const range = el.ownerDocument.createRange(); range.selectNodeContents(el);
    selection.removeAllRanges(); selection.addRange(range);
    if (!el.ownerDocument.execCommand('insertHTML', false, html)) throw new Error('Could not insert the rich-text HTML.');
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
    el.dispatchEvent(new Event('change', { bubbles: true })); el.blur();
  }, expected.html);
  if (await title.inputValue() !== post.title) throw new Error('The editor title differs from the source.');
  await assertRichBody(body, expected, true);
  return expected;
}
export async function verifySavedDraft(page, title, expected) {
  // Blogger auto-saves asynchronously. Poll its actual reload, never insert again.
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.waitForTimeout(3000);
    await page.reload({ waitUntil: 'domcontentloaded' });
    try {
      const body = await bodyEditor(page);
      assert.equal(await page.getByRole('textbox', { name: 'Title', exact: true }).inputValue(), title);
      await assertRichBody(body, expected, true); return;
    } catch (error) { if (attempt === 3) throw error; }
  }
}
export async function openPublishConfirmation(page) {
  await visibleButton(page, 'Publish').click();
  const dialog = page.getByRole('alertdialog').filter({ visible: true });
  await dialog.waitFor();
  if (!/Publish post/i.test(await dialog.innerText())) throw new Error('The publish confirmation dialog did not match the expected dialog.');
  return dialog;
}
export { visibleButton };
