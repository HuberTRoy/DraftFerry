import { parseArgs } from 'node:util';
import { setTimeout as wait } from 'node:timers/promises';
import { articleHtml, readArticle } from '../../../scripts/article.mjs';
import { inCdpPage, submitOnce } from '../../../scripts/cdp-publish.mjs';
import { medium, prepareEditor, verifyAccount } from './editor.mjs';
import { setCanonical, openPublishReview } from './settings.mjs';

async function verifyPublicStory(page, postId, article, expected) {
  const guest = await page.context().browser().newContext();
  try {
    const reader = await guest.newPage();
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await reader.goto(medium + '/p/' + postId, {
          waitUntil: 'domcontentloaded', timeout: 10000,
        });
        if (!response?.ok()) throw new Error('Medium has not returned the public story.');
        await reader.getByRole('heading', { level: 1, name: article.title, exact: true })
          .first().waitFor({ timeout: 4500 });
        const text = (await reader.locator('body').innerText()).replace(/[\s\ufeff\u200b]/g, '');
        if (!text.includes(expected.text)) throw new Error('Medium public story differs from the Markdown source.');
        const url = new URL(reader.url());
        if (url.origin !== medium || !url.pathname.endsWith(postId)) throw new Error('Medium opened a different story.');
        if (article.canonicalUrl &&
            await reader.locator('link[rel="canonical"]').getAttribute('href') !== article.canonicalUrl) {
          throw new Error('Medium public story does not have the requested canonical URL.');
        }
        return url.origin + url.pathname;
      } catch {
        await wait(1000);
      }
    }
    throw new Error('Medium submission was attempted. Inspect Stories for post ' + postId + ' before retrying.');
  } finally {
    await guest.close();
  }
}

async function main() {
  const { values } = parseArgs({ options: {
    input: { type: 'string' },
    title: { type: 'string' },
    'canonical-url': { type: 'string' },
    'draft-url': { type: 'string' },
    account: { type: 'string' },
    draft: { type: 'boolean' },
    publish: { type: 'boolean' },
  } });
  if (!values.input || (values.draft && values.publish)) {
    throw new Error('Provide --input article.md and use at most one of --draft and --publish.');
  }
  const input = await readArticle(values.input, { title: values.title, canonicalUrl: values['canonical-url'] });
  const article = { ...input, html: articleHtml(input).trim() };
  if (!values.draft && !values.publish) return article;

  const account = (values.account || process.env.DRAFTFERRY_MEDIUM_ACCOUNT || '').trim().replace(/^@/, '');
  if (!/^[a-z\d_.-]+$/i.test(account)) throw new Error('Provide the intended Medium handle with --account.');
  return inCdpPage('medium', async page => {
    await verifyAccount(page, account);
    const { expected, postId, draftUrl } = await prepareEditor(page, article, values['draft-url']);
    if (article.canonicalUrl) await setCanonical(page, draftUrl, article.canonicalUrl);
    if (values.draft) return { status: 'draft', account, draftUrl, canonicalUrl: article.canonicalUrl };

    const confirm = await openPublishReview(page, postId);
    return submitOnce('medium', medium + '/@' + account.toLowerCase(), article.title + '\n' + article.html, async () => {
      await confirm.click();
      const permalink = await verifyPublicStory(page, postId, article, expected);
      return { status: 'published', draftUrl, permalink };
    });
  });
}

main().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
