import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { readArticle, webUrl } from '../../../scripts/article.mjs';

let endpoint;

async function clickButtonText(page, text, useLast = false, timeout = 30000) {
  const locator = page.locator("button").filter({ hasText: new RegExp(`^${text}$`, "i") });
  const target = useLast ? locator.last() : locator.first();
  try {
    await target.waitFor({ state: "visible", timeout });
    await target.scrollIntoViewIfNeeded().catch(() => {});
    await target.click({ timeout: 10000 });
    return true;
  } catch (_) {
    if (useLast) throw new Error("Medium final confirmation could not be completed.");
    return page.evaluate(
      ({ label, useLast: shouldUseLast }) => {
        const regex = new RegExp(`^${label}$`, "i");
        const buttons = Array.from(document.querySelectorAll("button, [role='button']"));
        const matches = buttons.filter((button) =>
          regex.test((button.innerText || button.textContent || "").trim()),
        );
        const target = shouldUseLast ? matches[matches.length - 1] : matches[0];
        if (!target) return false;
        target.scrollIntoView({ block: "center", inline: "center" });
        target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
        target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
        target.click();
        return true;
      },
      { label: text, useLast },
    );
  }
}

async function importSourceUrl(page, sourceUrl) {
  await page.goto("https://medium.com/p/import", {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(2500);

  const editor = page.locator('[contenteditable="true"].js-importUrl, [role="textbox"].js-importUrl').first();
  await editor.waitFor({ state: "visible", timeout: 30000 });
  await editor.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.type(sourceUrl, { delay: 5 });

  if (!(await clickButtonText(page, "Import", false, 15000))) {
    throw new Error("Could not click Medium Import");
  }

  await page.waitForLoadState("domcontentloaded", { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(12000);
  const importedUrl = new URL(page.url());
  if (importedUrl.origin !== "https://medium.com" || importedUrl.pathname === "/p/import") {
    throw new Error("Medium did not open an imported story.");
  }
  return importedUrl.href;
}

async function publishImported(page, beforeSubmit) {
  await page.waitForTimeout(5000);
  if (!(await clickButtonText(page, "Publish", false, 60000))) {
    const text = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
    throw new Error(`Could not click editor Publish: ${text.slice(0, 400)}`);
  }

  await page.waitForLoadState("domcontentloaded", { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(5000);

  const confirmationText = await page.locator("body").innerText({ timeout: 15000 }).catch(() => "");
  if (!/Story preview|Schedule for later|Add (?:up to five )?topics/i.test(confirmationText)) {
    throw new Error(`Unexpected Medium publish page: ${confirmationText.slice(0, 400)}`);
  }

  await beforeSubmit();
  if (!(await clickButtonText(page, "Publish", true, 60000))) {
    throw new Error("Could not click final Medium Publish");
  }

  await page.waitForLoadState("domcontentloaded", { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(10000);

  const finalText = await page.locator("body").innerText({ timeout: 15000 }).catch(() => "");
  if (/maximum of two stories in the past 24 hours/i.test(finalText)) {
    throw new Error("Medium rate limit: maximum of two stories can be published or scheduled in the past 24 hours.");
  }

  return page.url();
}

async function main() {
  const { values } = parseArgs({ options: {
    input: { type: 'string' },
    'source-url': { type: 'string' },
    publish: { type: 'boolean' },
  } });
  const article = values.input ? await readArticle(values.input) : undefined;
  const source = values['source-url'] || article?.canonicalUrl;
  if (!source) throw new Error('Provide --source-url or a Markdown --input with canonical_url.');
  const sourceUrl = webUrl(source);
  if (!values.publish) {
    console.log(JSON.stringify({ sourceUrl, title: article?.title }, null, 2));
    return;
  }

  endpoint = process.env.DRAFTFERRY_MEDIUM_CDP_URL || process.env.CDP_URL;
  if (!endpoint) throw new Error('Set the CDP endpoint for Medium.');
  const directory = 'artifacts/medium';
  await mkdir(directory, { recursive: true });
  const hash = createHash('sha256').update(sourceUrl).digest('hex');
  const receipt = join(directory, `post-${hash}.json`);
  const save = (data, options) => writeFile(receipt, JSON.stringify({ sourceUrl, ...data }, null, 2), {
    mode: 0o600, ...options,
  });

  // Claim the source before opening the importer so concurrent runs cannot create two drafts.
  try {
    await save({ status: 'importing' }, { flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Existing Medium receipt. Inspect ${receipt} before repeating the import.`);
    throw error;
  }
  let browser, page, importedUrl, submitting = false;
  try {
    browser = await chromium.connectOverCDP(endpoint, { noDefaults: true, timeout: 30000 });
    const context = browser.contexts()[0];
    if (!context) throw new Error('No CDP browser context.');
    page = await context.newPage();
    importedUrl = await importSourceUrl(page, sourceUrl);
    await save({ status: 'imported', importedUrl });
    const mediumUrl = await publishImported(page, async () => {
      await save({ status: 'submitting', importedUrl });
      submitting = true;
    });
    await save({ status: 'submitted', importedUrl, mediumUrl });
    console.log(JSON.stringify({ status: 'submitted', mediumUrl, receipt }, null, 2));
  } catch (error) {
    await save({ status: submitting ? 'unknown' : 'import_incomplete', importedUrl }).catch(() => {});
    throw error;
  } finally {
    await page?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}

main().catch(error => {
  const message = String(error.message || error);
  console.error(endpoint ? message.split(endpoint).join('[CDP REDACTED]') : message);
  process.exitCode = 1;
});
