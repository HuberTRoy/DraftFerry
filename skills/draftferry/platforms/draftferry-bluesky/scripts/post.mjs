import { inCdpPage, submitOnce } from '../../../scripts/cdp-publish.mjs';
import { capturePreview, normalizePostText, socialSource } from '../../../scripts/social-source.mjs';
import { postWrite, restorePostLinks } from './record.mjs';

async function main() {
  const options = await socialSource();
  if (!options.preview && !options.publish) return { text: options.text };
  const handle = options.account.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(handle)) throw new Error('Provide the full Bluesky handle.');
  return inCdpPage('bluesky', async page => {
    await page.goto('https://bsky.app/', { waitUntil: 'domcontentloaded' });
    const profile = page.getByRole('link', { name: 'Profile', exact: true }).filter({ visible: true }).first();
    if (await profile.getAttribute('href') !== '/profile/' + handle) {
      throw new Error('The active Bluesky account does not match --account.');
    }
    await page.getByRole('button', { name: 'Compose new post', exact: true }).click();
    const dialog = page.getByRole('dialog').filter({ has: page.getByTestId('composerPublishBtn') });
    const editor = dialog.locator('.tiptap[contenteditable="true"]');
    if (normalizePostText(await editor.innerText())) throw new Error('The Bluesky composer already has content.');
    await editor.fill(options.text);
    // Chromium's innerText introduces visual line spacing around Tiptap paragraphs.
    const rendered = await editor.evaluate(element => [...element.children].map(paragraph => paragraph.textContent).join('\n'));
    if (normalizePostText(rendered) !== normalizePostText(options.text)) {
      throw new Error('The Bluesky composer changed the supplied text.');
    }
    if (options.preview) {
      const screenshot = await capturePreview(page, 'bluesky');
      await editor.clear();
      return { status: 'preview', screenshot };
    }
    const publish = dialog.getByTestId('composerPublishBtn');
    if (!await publish.isEnabled()) throw new Error('Bluesky rejected the post length or content.');
    return submitOnce('bluesky', handle, options.text, async () => {
      const [response] = await Promise.all([
        page.waitForResponse(response => Boolean(postWrite(response.request())), { timeout: 20000 }),
        publish.click(),
      ]);
      if (!response.ok()) throw new Error('Bluesky returned HTTP ' + response.status());
      const write = postWrite(response.request());
      const payload = await response.json();
      const uri = write.index === undefined ? payload?.uri : payload?.results?.[write.index]?.uri;
      const key = /^at:\/\/[^/]+\/app\.bsky\.feed\.post\/([a-zA-Z0-9._~-]+)$/.exec(uri)?.[1];
      if (!key) throw new Error('Bluesky did not confirm a post record.');
      return {
        status: 'submitted',
        permalink: 'https://bsky.app/profile/' + handle + '/post/' + key,
        textVerified: normalizePostText(restorePostLinks(write.record)) === normalizePostText(options.text),
      };
    });
  });
}

main().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
