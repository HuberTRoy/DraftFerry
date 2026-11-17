import { httpsOrigin, inCdpPage, submitOnce } from '../../../scripts/cdp-publish.mjs';
import { capturePreview, normalizePostText, socialSource } from '../../../scripts/social-source.mjs';

async function main() {
  const options = await socialSource();
  if (!options.preview && !options.publish) return { text: options.text };
  const origin = httpsOrigin(options.origin || process.env.DRAFTFERRY_MASTODON_ORIGIN);
  const hostname = new URL(origin).hostname;
  const account = options.account.trim().replace(/^@/, '').toLowerCase();
  const [username, instance] = account.split('@');
  if (!/^[a-z0-9_]+$/.test(username) || (instance && (instance !== hostname || account !== username + '@' + instance))) {
    throw new Error('Provide the Mastodon username on the configured instance.');
  }
  return inCdpPage('mastodon', async page => {
    await page.goto(origin + '/home', { waitUntil: 'domcontentloaded' });
    await page.locator('nav a[href="/@' + username + '"]').filter({ visible: true }).first().waitFor();
    await page.getByRole('button', { name: 'New Post', exact: true }).filter({ visible: true }).first().click();
    const composer = page.getByRole('dialog').filter({ has: page.getByRole('textbox', { name: 'What would you like to say?' }) });
    const editor = composer.getByRole('textbox', { name: 'What would you like to say?' });
    if (normalizePostText(await editor.inputValue())) throw new Error('The Mastodon composer already has content.');
    await editor.fill(options.text);
    if (normalizePostText(await editor.inputValue()) !== normalizePostText(options.text)) {
      throw new Error('The Mastodon composer changed the supplied text.');
    }
    if (options.preview) {
      const screenshot = await capturePreview(page, 'mastodon');
      await editor.clear();
      return { status: 'preview', screenshot };
    }
    await composer.getByRole('button', { name: 'Public', exact: true }).waitFor();
    const publish = composer.getByRole('button', { name: 'Publish', exact: true });
    if (!await publish.isEnabled()) throw new Error('Mastodon rejected the post length or content.');
    return submitOnce('mastodon', username + '@' + hostname, options.text, async () => {
      const [response] = await Promise.all([
        page.waitForResponse(response => {
          const url = new URL(response.url());
          return response.request().method() === 'POST' && url.origin === origin && url.pathname === '/api/v1/statuses';
        }, { timeout: 20000 }),
        publish.click(),
      ]);
      if (!response.ok()) throw new Error('Mastodon returned HTTP ' + response.status());
      const result = await response.json();
      const permalink = new URL(result.url);
      if (result.account?.username?.toLowerCase() !== username || result.visibility !== 'public' ||
          permalink.origin !== origin || !permalink.pathname.startsWith('/@' + username + '/')) {
        throw new Error('Mastodon did not confirm the intended public post.');
      }
      return { status: 'submitted', permalink: permalink.href };
    });
  });
}

main().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
