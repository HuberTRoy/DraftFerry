const { chromium } = require("playwright");
const CDP_URL = process.env.DRAFTFERRY_X_CDP_URL || process.env.X_CDP_URL || process.env.CDP_URL;
const POST_TEXT = process.env.X_POST_TEXT || "";

if (!CDP_URL) {
  console.error("Missing CDP endpoint for X");
  process.exit(1);
}
if (!POST_TEXT.trim()) {
  console.error("Missing X_POST_TEXT");
  process.exit(1);
}

async function openComposer(page) {
  await page.goto("https://x.com/compose/post", {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(2500);

  const blocked = await page.evaluate(() => {
    const txt = (document.body && document.body.innerText) || "";
    return /log in|sign in|\u767B\u5F55|\u6CE8\u518C/i.test(txt);
  });

  if (blocked) {
    throw new Error("Login required on X");
  }
}

async function fillPostText(page, text) {
  const editor = page.locator('[data-testid="tweetTextarea_0"][contenteditable="true"], [aria-label="Post text"][contenteditable="true"]')
    .filter({ visible: true }).first();
  await editor.fill(text);
  const normalize = value => value.replace(/\r\n/g, "\n").trim();
  if (normalize(await editor.innerText()) !== normalize(text)) {
    throw new Error("X composer content differs from the supplied text.");
  }
}

async function submitPost(page) {
  const button = page.locator('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]')
    .filter({ visible: true }).first();
  await button.click({ timeout: 10000 });

  const toast = page.locator('[data-testid="toast"]');
  const statusLink = toast.locator('a[href*="/status/"]').first();
  try {
    await statusLink.waitFor({ state: "visible", timeout: 8000 });
    const href = await statusLink.getAttribute("href");
    const url = new URL(href, "https://x.com");
    if (url.origin === "https://x.com" && /\/status\/\d+/.test(url.pathname)) return url.href;
  } catch (_) {
    // A submitted post may need to be verified from the account timeline.
  }
}
async function main() {
  const browser = await chromium.connectOverCDP(CDP_URL, { noDefaults: true });
  let page;
  try {
    const context = browser.contexts()[0];
    if (!context) throw new Error("No CDP browser context");
    page = await context.newPage();

    await openComposer(page);
    await fillPostText(page, POST_TEXT);
    const permalink = await submitPost(page);
    console.log(JSON.stringify({ status: permalink ? "submitted" : "unknown", permalink }, null, 2));
  } finally {
    await page?.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error("X post did not complete:", String(err?.message || err).split(CDP_URL).join("[CDP REDACTED]"));
  process.exit(1);
});
