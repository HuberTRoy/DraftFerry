import { expectSaved, isPublishedLocation, openArticle, prepareWebPublication, submitWebPublication } from './workflow.mjs';
import { assertRichEditor, httpsOrigin, inCdpPage, pasteArticle, submitOnce } from '../../../scripts/cdp-publish.mjs';
import { sourceForPublisher } from '../../../scripts/article-source.mjs';

async function main() {
  const options = await sourceForPublisher();
  const { article } = options;
  if (!options.draft && !options.publish) return article;
  const origin = httpsOrigin(options.origin || process.env.DRAFTFERRY_SUBSTACK_ORIGIN);
  return inCdpPage('substack', async page => {
    await openArticle(page, origin);
    const title = page.getByTestId('post-title');
    const editor = page.getByTestId('editor');
    const expected = await pasteArticle(page, title, editor, article);
    const draftUrl = await expectSaved(page, origin);
    await page.reload({ waitUntil: 'domcontentloaded' });
    if ((await title.inputValue()).trim() !== article.title) throw new Error('Substack did not retain the draft title.');
    await assertRichEditor(editor, expected);
    if (options.draft) return { status: 'draft', draftUrl };

    const confirm = await prepareWebPublication(page);
    return submitOnce('substack', origin, article.html + '\n' + article.title, async () => {
      await submitWebPublication(page, confirm, origin, draftUrl);
      await page.waitForURL(url => isPublishedLocation(url, origin, draftUrl), {
        timeout: 20000, waitUntil: 'domcontentloaded',
      });
      const current = new URL(page.url());
      let permalink;
      if (current.pathname.startsWith('/p/')) {
        permalink = current.origin + current.pathname;
      } else if (current.pathname.endsWith('/share-center')) {
        const share = page.locator(`a[href^="${origin}/p/"], input[value^="${origin}/p/"]`).filter({ visible: true });
        await share.first().waitFor();
        const candidates = await share.evaluateAll(nodes => nodes.map(node => node.href || node.value));
        const publicLinks = [...new Set(candidates.map(href => {
          const url = new URL(href);
          return url.origin + url.pathname;
        }))];
        if (publicLinks.length === 1) permalink = publicLinks[0];
      } else {
        const matching = page.getByRole('link', { name: article.title, exact: true })
          .and(page.locator('a[href*="/p/"]')).filter({ visible: true });
        const href = await matching.getAttribute('href', { timeout: 5000 }).catch(() => null);
        if (href) {
          const candidate = new URL(href, origin);
          if (candidate.origin === origin && candidate.pathname.startsWith('/p/')) {
            permalink = candidate.origin + candidate.pathname;
          }
        }
      }
      if (!permalink) throw new Error('Substack did not return a matching public permalink. Inspect the existing draft and post list.');
      return { status: 'submitted', draftUrl, permalink };
    });
  });
}

main().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
