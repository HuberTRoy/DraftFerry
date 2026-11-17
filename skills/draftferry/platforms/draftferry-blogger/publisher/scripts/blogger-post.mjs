import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readRichArticle } from '../../../../scripts/rich-article.mjs';
import { parseOptions, inspectHtml } from './blogger-content.mjs';
import { fillEditor, verifySavedDraft, openPublishConfirmation, assertRichBody, visibleButton } from './blogger-browser.mjs';
let endpoint;
export function safeError(error) {
  let message = String(error.message || error);
  for (const secret of [endpoint, process.env.CDP_URL]) if (secret) message = message.split(secret).join('[REDACTED]');
  return message.replace(/wss?:\/\/[^\s"']+/g, '[CDP REDACTED]');
}
const save = (file, data, flags = {}) => writeFile(file, JSON.stringify(data, null, 2), { mode: 0o600, ...flags });
async function connect() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await chromium.connectOverCDP(endpoint, { timeout: 60000, noDefaults: true }); }
    catch (error) {
      if (attempt || !/502|503|ECONNRESET|ETIMEDOUT|timeout/i.test(error.message)) throw error;
      console.log('CDP 暂时不可用，10 秒后重连一次'); await new Promise(r => setTimeout(r, 10000));
    }
  }
}
export async function verifyPublic(browser, permalink, title, expected) {
  const anonymous = await browser.newContext();
  try {
    const page = await anonymous.newPage(); page.setDefaultTimeout(30000);
    const response = await page.goto(permalink, { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (!response?.ok() || new URL(page.url()).origin !== new URL(permalink).origin) throw new Error('匿名公开文章请求失败');
    const heading = page.locator('.post-title, .entry-title').filter({ visible: true });
    if ((await heading.innerText()).trim() !== title) throw new Error('公开文章标题不一致');
    await assertRichBody(page.locator('.post-body, .entry-content').filter({ visible: true }), expected);
  } finally { await anonymous.close(); }
}
export async function main(args = process.argv.slice(2), { connectBrowser = connect } = {}) {
  const v = parseOptions(args); endpoint = v.cdp;
  const dir = resolve(v['artifacts-dir']); await mkdir(dir, { recursive: true });
  const lock = join(dir, `${v.blog}.lock`);
  try { await mkdir(lock); } catch (e) { if (e.code === 'EEXIST') throw new Error(`运行锁已存在 ${lock}，请检查之前进程及提交记录`); throw e; }
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
  let browser, page, receipt, submitted = false, verified = false;
  try {
    const files = await readdir(dir), live = !v['dry-run'] && !v['prepare-only'];
    if (live) for (const file of files.filter(f => /^post-.*\.json$/.test(f))) {
      const previous = JSON.parse(await readFile(join(dir, file), 'utf8'));
      if (previous.blog === v.blog && ['submitting','unknown'].includes(previous.status)) throw new Error(`尚未确认的提交 ${file}，请先核实博客，不会再次提交`);
    }
    const post = await readRichArticle(v), artifact = join(dir, `${runId}-content.json`);
    await save(artifact, { ...post, blog:v.blog, runId });
    const hash = createHash('sha256').update(JSON.stringify({ blog:v.blog, html:post.html })).digest('hex');
    receipt = join(dir, `post-${hash}.json`);
    if (live && files.includes(`post-${hash}.json`)) throw new Error('文章已有提交记录，请检查，避免重复发布');
    if (v['prepare-only']) { console.log(`文章准备完成：${artifact}（HTML 将在连接浏览器后校验）`); return { artifact }; }
    browser = await connectBrowser();
    const context = browser.contexts()[0]; if (!context) throw new Error('CDP 未返回登录会话');
    page = await context.newPage(); page.setDefaultTimeout(30000);
    const postsUrl = `https://www.blogger.com/blog/posts/${v.blog}`;
    await page.goto(postsUrl + '?hl=en', { waitUntil:'domcontentloaded' });
    const viewBlog = page.getByRole('link', { name:/View blog/i }).filter({ visible:true });
    await viewBlog.waitFor();
    if (new URL(page.url()).pathname !== `/blog/posts/${v.blog}`) throw new Error('未进入目标 Blogger 博客，请检查登录状态');
    const blogUrl = new URL(await viewBlog.getAttribute('href'));
    if (blogUrl.protocol !== 'https:' || (v['blog-url'] && blogUrl.origin !== new URL(v['blog-url']).origin)) throw new Error('View blog 地址与 --blog-url 不一致');
    // Validate inert HTML before creating any remote draft.
    await page.evaluate(inspectHtml, post.html);
    await visibleButton(page, /^Create new post$/i).first().click();
    await page.waitForURL(new RegExp(`/blog/post/edit/${v.blog}/\\d+`));
    const editorUrl = page.url(), postId = new URL(editorUrl).pathname.split('/').at(-1);
    const expected = await fillEditor(page, post);
    await verifySavedDraft(page, post.title, expected);
    await page.screenshot({ path:join(dir,`${runId}-preview.png`), fullPage:true });
    const base = { blog:v.blog, title:post.title, postId, editorUrl, runId, artifact };
    if (v['dry-run']) { await save(join(dir,`${runId}-draft.json`),{...base,status:'draft'}); console.log(`dry-run 完成：富文本草稿已自动保存，未发布。${editorUrl}`); return base; }
    const dialog = await openPublishConfirmation(page);
    await save(receipt,{...base,status:'submitting'},{flag:'wx'});
    submitted = true;
    await dialog.getByRole('button',{name:'Confirm',exact:true}).filter({visible:true}).click();
    // Confirm a single known post ID in the published list, then its anonymous page.
    await page.waitForURL(url => url.pathname === `/blog/posts/${v.blog}`, {timeout:45000});
    const edit = page.locator(`a[href$="/blog/post/edit/${v.blog}/${postId}"]`);
    await edit.waitFor({state:'attached'});
    const row = edit.locator('xpath=..');
    if (!/Published/.test(await row.innerText())) throw new Error('目标文章未显示 Published 状态');
    const view = row.getByRole('link',{name:'View',exact:true,includeHidden:true});
    const permalink = new URL(await view.getAttribute('href'));
    if (permalink.origin !== blogUrl.origin || permalink.pathname === '/') throw new Error('文章链接不是目标博客');
    await verifyPublic(browser, permalink.href, post.title, expected);
    await save(receipt,{...base,status:'published',permalink:permalink.href,verifiedAt:new Date().toISOString()});
    verified = true; console.log(`发布成功：${permalink.href}`); return { ...base,permalink:permalink.href };
  } catch (error) {
    if (submitted && !verified && receipt) { const old = JSON.parse(await readFile(receipt,'utf8')); await save(receipt,{...old,status:'unknown',error:safeError(error)}); }
    if (page) await page.screenshot({path:join(dir,`${runId}-error.png`),fullPage:true}).catch(()=>{});
    throw error;
  } finally { await browser?.close().catch(()=>{}); await rm(lock,{recursive:true,force:true}); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error=>{console.error(safeError(error));process.exitCode=1;});
