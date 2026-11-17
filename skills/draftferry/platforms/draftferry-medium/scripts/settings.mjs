import { draftPath, medium } from './editor.mjs';
import { setTimeout as wait } from 'node:timers/promises';

async function openCanonicalSettings(page, settingsUrl) {
  await page.goto(settingsUrl, { waitUntil: 'domcontentloaded' });
  if (new URL(page.url()).origin !== medium) throw new Error('Medium opened a different settings site.');
  await page.getByRole('button', { name: /Advanced Settings/i }).click();
  const label = page.getByText('This story was originally published elsewhere', { exact: true });
  const checkbox = page.locator('label').filter({ has: label }).locator('input[type="checkbox"]');
  return { label, checkbox, input: page.getByPlaceholder('Type the canonical URL...', { exact: true }) };
}

export async function setCanonical(page, draftUrl, canonicalUrl) {
  const postId = draftPath.exec(new URL(draftUrl).pathname)?.[1];
  if (!postId) throw new Error('Medium settings require a saved draft.');
  const settingsUrl = medium + '/p/' + postId + '/settings';
  const { label, checkbox, input } = await openCanonicalSettings(page, settingsUrl);
  if (!await checkbox.isChecked()) await label.click();
  await input.waitFor();
  if (await input.inputValue() !== canonicalUrl) {
    if (!await input.isEnabled()) await page.getByRole('button', { name: 'Edit canonical link', exact: true }).click();
    await input.fill(canonicalUrl);
    await page.getByRole('button', { name: 'Save canonical link', exact: true }).filter({ visible: true }).click();
    await input.and(page.locator(':disabled')).waitFor();
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    await wait(600);
    const persisted = await openCanonicalSettings(page, settingsUrl);
    if (await persisted.checkbox.isChecked() && await persisted.input.inputValue() === canonicalUrl) {
      await page.goto(draftUrl, { waitUntil: 'domcontentloaded' });
      return;
    }
  }
  throw new Error('Medium did not save the supplied canonical URL.');
}

export async function openPublishReview(page, postId) {
  await page.locator('button[data-action="show-prepublish"]').filter({ visible: true }).click();
  await page.waitForURL(url => url.origin === medium && url.pathname === '/p/' + postId + '/submission', {
    waitUntil: 'domcontentloaded',
  });
  const notification = page.getByText('Notify your subscribers', { exact: true });
  const checkbox = page.locator('label').filter({ has: notification }).locator('input[type="checkbox"]');
  if (await checkbox.isChecked()) await notification.click();
  if (await checkbox.isChecked()) throw new Error('Medium subscriber notification is still enabled.');
  return page.getByRole('button', { name: 'Publish', exact: true }).filter({ visible: true });
}
