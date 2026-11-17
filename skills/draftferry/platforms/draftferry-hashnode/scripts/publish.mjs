import { setTimeout as wait } from 'node:timers/promises';
import { sourceForPublisher } from '../../../scripts/article-source.mjs';
import { assertRichEditor, httpsOrigin, inCdpPage, pasteArticle, submitOnce } from '../../../scripts/cdp-publish.mjs';
import { inspectHtml } from '../../../scripts/rich-article.mjs';

const app = 'https://hashnode.com';
const draftPath = /^\/draft\/([a-f\d]+)\/?$/i;
const dashboardPath = /^\/dashboards?\/([^/]+)(?:\/|$)/;

async function resolvePublication(page, origin, dashboard) {
  await page.goto(app + '/', { waitUntil: 'domcontentloaded' });
  const link = page.locator(`a[href="${origin}"], a[href="${origin}/"]`).filter({ visible: true }).first();
  await link.waitFor().catch(() => {
    throw new Error('The requested Hashnode publication is not visible in this account.');
  });
  const active = await link.evaluate(anchor => {
    for (let parent = anchor.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      const manage = parent.querySelector('a[href^="/dashboards/"][aria-label^="Manage "], a[href^="/dashboard/"][aria-label^="Manage "]');
      if (manage) return { name: manage.getAttribute('aria-label').slice(7), dashboard: manage.href };
    }
  });
  if (!active) throw new Error('Could not identify the dashboard for the requested publication.');
  const dashboardId = new URL(active.dashboard).pathname.match(dashboardPath)?.[1];
  if (dashboard) {
    const url = new URL(dashboard);
    if (url.origin !== app || url.pathname.match(dashboardPath)?.[1] !== dashboardId) {
      throw new Error('The supplied dashboard does not belong to the requested publication.');
    }
  }
  return active;
}

async function openDraft(page, original, active) {
  if (original) {
    const url = new URL(original);
    if (url.origin !== app || !draftPath.test(url.pathname)) throw new Error('Supply the Hashnode URL of the intended draft.');
    await page.goto(url.origin + url.pathname, { waitUntil: 'domcontentloaded' });
  } else {
    const write = page.locator('button').filter({ hasText: /^\s*Write\s*$/i }).filter({ visible: true });
    await write.first().click();
  }
  await page.waitForURL(url => url.origin === app && draftPath.test(url.pathname), {
    waitUntil: 'domcontentloaded',
  });
  const title = page.getByPlaceholder('Article title...', { exact: true });
  const editor = page.locator('.tiptap[contenteditable="true"]').filter({ visible: true }).first();
  await title.waitFor();
  const activeLabel = page.locator('button').filter({ has: page.getByText(active.name, { exact: true }) }).filter({ visible: true });
  if (!await activeLabel.count() && !await page.getByText(active.name, { exact: true }).filter({ visible: true }).count()) {
    throw new Error('The Hashnode editor does not show the requested publication.');
  }
  return { title, editor };
}

async function findPublicPage(page, origin, article, expected, candidate) {
  const connection = page.context().browser();
  if (!connection) throw new Error('Hashnode submitted. Open the publication to verify the URL.');
  const guest = await connection.newContext();
  try {
    const check = await guest.newPage();
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        if (!candidate) {
          await check.goto(origin, { waitUntil: 'domcontentloaded', timeout: 8000 });
          const headline = check.getByRole('heading', { name: article.title, exact: true });
          const href = await check.locator('a[href]').filter({ has: headline }).first()
            .getAttribute('href', { timeout: 2000 });
          candidate = new URL(href, origin).href;
        }
        const url = new URL(candidate);
        if (url.origin !== origin || url.pathname === '/') throw new Error('Not an article on the requested publication.');
        const response = await check.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 8000 });
        if (!response?.ok() || new URL(check.url()).origin !== origin) throw new Error('Article is not publicly accessible yet.');
        await check.getByRole('heading', { name: article.title, exact: true }).first().waitFor({ timeout: 3500 });
        const text = (await check.locator('body').innerText()).replace(/\s/g, '');
        if (text.includes(expected.text)) return new URL(check.url()).origin + new URL(check.url()).pathname;
      } catch {
        candidate = undefined;
      }
      await wait(700);
    }
    throw new Error('Hashnode submitted. The public article could not be verified. Inspect the existing draft before retrying.');
  } finally {
    await guest.close();
  }
}

async function main() {
  const options = await sourceForPublisher();
  const { article } = options;
  if (!options.draft && !options.publish) return article;
  const origin = httpsOrigin(options.origin || process.env.DRAFTFERRY_HASHNODE_ORIGIN);
  return inCdpPage('hashnode', async page => {
    const active = await resolvePublication(page, origin, options.dashboard || process.env.DRAFTFERRY_HASHNODE_DASHBOARD_URL);
    const { title, editor } = await openDraft(page, options['draft-url'], active);
    const draftUrl = new URL(page.url()).origin + new URL(page.url()).pathname;
    const expected = await page.evaluate(inspectHtml, article.html);
    if (!(await title.inputValue()).trim()) {
      await pasteArticle(page, title, editor, article);
      await wait(1600);
      await page.reload({ waitUntil: 'domcontentloaded' });
    }
    if ((await title.inputValue()).trim() !== article.title) throw new Error('Hashnode draft title does not match the source.');
    await assertRichEditor(editor, expected);
    if (options.draft) return { status: 'draft', draftUrl };

    await page.getByRole('button', { name: 'Publish', exact: true }).filter({ visible: true }).click();
    const settings = page.getByRole('dialog', { name: 'Draft settings' });
    const confirm = settings.getByRole('button', { name: 'Publish', exact: true });
    await confirm.waitFor();
    if (!await settings.getByText(active.name, { exact: true }).isVisible()) {
      throw new Error('The Hashnode publish dialog does not confirm the requested publication.');
    }
    return submitOnce('hashnode', origin, article.html + '\n' + article.title, async () => {
      await confirm.click();
      // A successful submission can navigate to the public page or update the editor in place.
      await page.waitForURL(url => url.origin === origin, { timeout: 6500, waitUntil: 'domcontentloaded' }).catch(() => {});
      const current = new URL(page.url());
      const permalink = await findPublicPage(page, origin, article, expected, current.origin === origin && current.pathname !== '/' ? current.href : undefined);
      return { status: 'published', draftUrl, permalink };
    });
  });
}

main().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
