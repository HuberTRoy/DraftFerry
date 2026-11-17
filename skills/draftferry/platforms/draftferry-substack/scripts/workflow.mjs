export async function openArticle(page, origin) {
  await page.goto(origin + '/publish/posts', { waitUntil: 'domcontentloaded' });
  if (new URL(page.url()).origin !== origin) throw new Error('Substack opened a different publication.');
  await page.getByRole('button', { name: 'Create', exact: true }).filter({ visible: true }).first().click();
  await page.getByRole('menuitem', { name: 'Article', exact: true }).click();
  await page.getByTestId('post-title').waitFor();
  if (new URL(page.url()).origin !== origin) throw new Error('Substack opened a different publication editor.');
}

export async function expectSaved(page, origin) {
  await page.waitForURL(url => url.origin === origin && /^\/publish\/post\/\d+\/?$/.test(url.pathname));
  await page.getByRole('button', { name: 'Saved', exact: true }).waitFor();
  const url = new URL(page.url());
  return url.origin + url.pathname;
}

export async function prepareWebPublication(page) {
  await page.getByTestId('publish-button').filter({ visible: true }).click();
  const modal = page.getByTestId('publish-modal');
  const send = modal.getByRole('checkbox', { name: /^send via email and (?:the )?substack app(?: inbox)?$/i }).filter({ visible: true });
  await send.waitFor();
  if (await send.getAttribute('aria-checked') === 'true') await send.click();
  await send.and(modal.locator('[aria-checked="false"]')).waitFor();
  const scheduled = modal.getByRole('checkbox', { name: /schedule time/i }).filter({ visible: true });
  if (await scheduled.count() && (await scheduled.getAttribute('aria-checked')) !== 'false') {
    throw new Error('Substack is configured for a scheduled post.');
  }
  const confirm = modal.getByRole('button', { name: /^(Publish|Publish now|Publish to everyone now)$/i }).filter({ visible: true });
  await confirm.waitFor();
  return confirm;
}

export function isPublishedLocation(url, origin, draftUrl) {
  const id = new URL(draftUrl).pathname.match(/\/publish\/post\/(\d+)/)?.[1];
  return url.origin === origin && (url.pathname.startsWith('/p/') ||
    url.pathname.startsWith('/publish/posts/published') ||
    Boolean(id && url.pathname === `/publish/posts/detail/${id}/share-center`));
}

export async function submitWebPublication(page, confirm, origin, draftUrl = page.url()) {
  const webOnly = page.getByRole('dialog').filter({ hasText: 'Do you want to send this post via email?' })
    .getByRole('button', { name: 'Publish on web only', exact: true });
  const publishedPage = url => isPublishedLocation(url, origin, draftUrl);
  const next = Promise.any([
    webOnly.waitFor({ timeout: 15000 }).then(() => 'confirm-web-only'),
    page.waitForURL(publishedPage, { timeout: 15000, waitUntil: 'domcontentloaded' }).then(() => 'published-page'),
  ]).catch(() => { throw new Error('Substack did not show a web-only confirmation or a published page.'); });
  // Attach a handler immediately in case both waits reject while the click is pending.
  void next.catch(() => {});
  await confirm.click();
  if (await next === 'confirm-web-only') await webOnly.click();
}
