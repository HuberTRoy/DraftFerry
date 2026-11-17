import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { readRichArticle, inspectHtml } from '../../../../scripts/rich-article.mjs';
import { parseOptions } from './options.mjs';
import { confirmPostWithoutTags } from './publish.mjs';

let cdpUrl;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const plain = s => s.replace(/[\s\uFEFF\u200B]/g, '');
function safeError(error) {
  let message = String(error.message || error);
  for (const secret of [cdpUrl, process.env.CDP_URL]) {
    if (secret) message = message.split(secret).join('[REDACTED]');
  }
  return message.replace(/wss?:\/\/\S+/g, '[CDP REDACTED]');
}

async function connect(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await chromium.connectOverCDP(url, { timeout: 60000, noDefaults: true }); }
    catch (error) {
      if (attempt || !/502|503|ECONNRESET|ETIMEDOUT|timeout/i.test(error.message)) throw error;
      console.log('CDP 暂时不可用，10 秒后重试一次');
      await sleep(10000);
    }
  }
}

async function main() {
  const values = parseOptions();
  cdpUrl = values.cdp;
  const article = await readRichArticle(values);
  const dir = values['artifacts-dir'];
  await mkdir(dir, { recursive: true });
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
  const artifact = join(dir, `${runId}-content.json`);
  await writeFile(artifact, JSON.stringify(article, null, 2), { mode: 0o600 });
  if (values['prepare-only']) {
    console.log(`文章准备完成：${artifact}`);
    return;
  }

  const hash = createHash('sha256')
    .update(JSON.stringify({ blog: values.blog, title: article.title, html: article.html })).digest('hex');
  const receipt = join(dir, `post-${hash}.json`);
  const browser = await connect(cdpUrl);
  let page;
  let submitted = false;
  let preview = false;
  try {
    const context = browser.contexts()[0];
    if (!context) throw new Error('CDP 未返回已登录的浏览器 context');
    page = await context.newPage();
    page.setDefaultTimeout(30000);
    await page.goto('https://www.tumblr.com/new/text', { waitUntil: 'domcontentloaded' });
    if (new URL(page.url()).origin !== 'https://www.tumblr.com') throw new Error('未进入 Tumblr 编辑器');
    const expected = await page.evaluate(inspectHtml, article.html);
    const modal = page.getByRole('dialog').filter({ has: page.locator('h1[contenteditable="true"]') });
    await modal.waitFor({ state: 'visible' });
    const blogButton = modal.getByRole('button', { name: /^Select a blog\. Current selection is / });
    const selectedBlog = (await blogButton.getAttribute('aria-label')).replace('Select a blog. Current selection is ', '').trim();
    if (selectedBlog !== values.blog) throw new Error(`当前博客 ${selectedBlog} 与 --blog 不一致，请切换博客`);
    console.log(`目标博客：${selectedBlog}`);
    const titleField = modal.locator('h1[contenteditable="true"]');
    const bodyField = modal.locator('p[contenteditable="true"]').first();
    await bodyField.waitFor({ state: 'visible' });
    const initialText = await modal.locator('[contenteditable="true"]').allTextContents();
    if (initialText.some(s => plain(s))) throw new Error('编辑器已有内容，已停止以避免覆盖');

    await titleField.fill(article.title);
    await bodyField.click();
    await bodyField.evaluate((element, { html }) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/html', html);
      clipboardData.setData('text/plain', new DOMParser().parseFromString(html, 'text/html').body.textContent);
      element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
    }, article);
    await page.waitForFunction(({ text }) => {
      const fields = [...document.querySelectorAll('[role="dialog"] [contenteditable="true"]')];
      const title = fields.find(field => field.tagName === 'H1');
      const body = fields.filter(field => field !== title && !field.querySelector('[contenteditable="true"]'));
      return body.map(field => field.textContent).join('').replace(/[\s\uFEFF\u200B]/g, '') === text;
    }, expected, { timeout: 10000 });
    if ((await titleField.innerText()).trim() !== article.title) throw new Error('标题回读不一致');
    const expectedLinks = expected.links;
    const actualLinks = await modal.locator('[contenteditable="true"] a').evaluateAll(anchors =>
      anchors.map(a => ({ href: a.href, label: a.textContent.trim() })));
    if (JSON.stringify(actualLinks) !== JSON.stringify(expectedLinks)) throw new Error('链接回读不一致');
    const postButton = modal.getByRole('button', { name: /^(Post|Post now)$/ });
    await postButton.waitFor({ state: 'visible' });
    if (!await postButton.isEnabled()) throw new Error('Post 按钮仍不可点击');
    const previewPath = join(dir, `${runId}-preview.png`);
    await page.screenshot({ path: previewPath });
    if (values['dry-run']) {
      preview = true;
      console.log(`编辑器预览：${previewPath}`);
      return;
    }
    await writeFile(receipt, JSON.stringify({ status: 'submitting', blog: selectedBlog, title: article.title, runId }, null, 2), { flag: 'wx', mode: 0o600 });
    // 等待对应创建帖子请求；不以 modal 消失作为唯一成功依据。
    const responsePromise = page.waitForResponse(response => {
      const request = response.request();
      const url = new URL(response.url());
      return url.hostname === 'www.tumblr.com' && request.method() === 'POST'
        && /^\/api\/v2\/blog\/[^/]+\/posts\/?$/.test(url.pathname);
    }, { timeout: 45000 }).then(response => ({ response }), error => ({ error }));
    submitted = true;
    await postButton.click(); // 只提交一次，超时也不会自动重发。
    if (await confirmPostWithoutTags(page)) console.log('已确认不添加标签继续发布');
    const observed = await responsePromise;
    if (observed.error) throw new Error('提交后未捕获发布响应，结果未知，请检查博客；不要直接重试');
    const response = observed.response;
    if (!response.ok()) throw new Error(`发布返回 HTTP ${response.status()}，请检查博客和编辑器`);
    const payload = await response.json().catch(() => null);
    const postId = payload?.response?.id_string || payload?.response?.id || payload?.response?.post?.id;
    if (!postId) throw new Error('发布响应没有帖子 ID，结果未知，请检查博客');
    await writeFile(receipt, JSON.stringify({ status: 'submitted', blog: selectedBlog, title: article.title, postId: String(postId), runId }, null, 2), { mode: 0o600 });
    console.log(`Tumblr 返回帖子 ID ${postId}。请在目标博客核实内容与公开链接。`);
  } catch (error) {
    if (submitted && receipt) await writeFile(receipt, JSON.stringify({ status: 'unknown', blog: values.blog, title: article.title, runId, error: safeError(error) }, null, 2), { mode: 0o600 }).catch(() => {});
    if (page) await page.screenshot({ path: join(dir, `${runId}-error.png`) }).catch(() => {});
    throw error;
  } finally {
    if (!preview) await page?.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch(error => { console.error(safeError(error)); process.exitCode = 1; });
