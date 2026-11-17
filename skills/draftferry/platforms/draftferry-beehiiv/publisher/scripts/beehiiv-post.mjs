import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readRichArticle } from '../../../../scripts/rich-article.mjs';
import { parseOptions, inspectHtml } from './beehiiv-content.mjs';
import { fillEditor, verifySavedDraft, openPublishConfirmation, createDraft, verifyPublic } from './beehiiv-browser.mjs';
export { verifyPublic } from './beehiiv-browser.mjs';
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
export async function main(args = process.argv.slice(2), { connectBrowser = connect } = {}) {
  const v = parseOptions(args); endpoint = v.cdp;
  const dir = resolve(v['artifacts-dir']); await mkdir(dir, { recursive: true });
  const lock = join(dir, `${createHash('sha256').update(v['blog-url']).digest('hex').slice(0,16)}.lock`);
  try { await mkdir(lock); } catch (e) { if (e.code === 'EEXIST') throw new Error(`运行锁已存在 ${lock}，请检查之前进程及提交记录`); throw e; }
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
  let browser, page, receipt, submitted = false, verified = false;
  try {
    const files = await readdir(dir), live = !v['dry-run'] && !v['prepare-only'];
    if (live) for (const file of files.filter(f => /^post-.*\.json$/.test(f))) {
      const previous = JSON.parse(await readFile(join(dir, file), 'utf8'));
      if ((previous.blogUrl || `https://${previous.blog}.beehiiv.com/`) === v['blog-url'] && ['submitting','unknown'].includes(previous.status)) throw new Error(`尚未确认的提交 ${file}，请先核实博客，不会再次提交`);
    }
    const post = await readRichArticle(v), artifact = join(dir, `${runId}-content.json`);
    await save(artifact, { ...post, blog:v.blog, runId });
    const hash = createHash('sha256').update(JSON.stringify({ blogUrl:v['blog-url'], html:post.html.replace(/\s+/g,'') })).digest('hex');
    receipt = join(dir, `post-${hash}.json`);
    if (live && files.includes(`post-${hash}.json`)) throw new Error('文章已有提交记录，请检查，避免重复发布');
    if (v['prepare-only']) { console.log(`文章准备完成：${artifact}（HTML 将在连接浏览器后校验）`); return { artifact }; }
    browser = await connectBrowser();
    const context = browser.contexts()[0]; if (!context) throw new Error('CDP 未返回登录会话');
    page = await context.newPage(); page.setDefaultTimeout(30000);
    // Validate inert supplied HTML before creating the remote draft.
    await page.goto('https://app.beehiiv.com/posts',{waitUntil:'domcontentloaded'});
    await page.evaluate(inspectHtml,post.html);
    await createDraft(page,v['blog-url']);
    const editorUrl=page.url(),postId=new URL(editorUrl).pathname.split('/')[2];
    const expected = await fillEditor(page, post);
    await verifySavedDraft(page, post.title, expected);
    await page.screenshot({ path:join(dir,`${runId}-preview.png`), fullPage:true });
    const base = { blog:v.blog, blogUrl:v['blog-url'], mode:'web-only', title:post.title, postId, editorUrl, runId, artifact };
    if (v['dry-run']) { await save(join(dir,`${runId}-draft.json`),{...base,status:'draft'}); console.log(`dry-run 完成：富文本草稿已自动保存，未发布。${editorUrl}`); return base; }
    const dialog = await openPublishConfirmation(page,v['blog-url'],post.title);
    await save(receipt,{...base,status:'submitting'},{flag:'wx'});
    submitted = true;
    await dialog.getByRole('button',{name:'Publish now',exact:true}).filter({visible:true}).click();
    await page.waitForURL(url=>url.pathname===`/posts/${postId}`,{timeout:45000});
    const urlField=page.locator('input[name="post_url"]').filter({visible:true});
    await urlField.waitFor();
    const permalink=new URL(await urlField.inputValue());
    if(permalink.origin!==new URL(v['blog-url']).origin || !permalink.pathname.startsWith('/p/'))throw Error('发布链接不属于目标 publication');
    // Success toast alone is insufficient: verify the public body anonymously.
    await verifyPublic(browser,permalink.href,post.title,expected);
    await save(receipt,{...base,status:'published',permalink:permalink.href,verifiedAt:new Date().toISOString()});
    verified = true; console.log(`发布成功：${permalink.href}`); return { ...base,permalink:permalink.href };
  } catch (error) {
    if (submitted && !verified && receipt) { const old = JSON.parse(await readFile(receipt,'utf8')); await save(receipt,{...old,status:'unknown',error:safeError(error)}); }
    if (page) await page.screenshot({path:join(dir,`${runId}-error.png`),fullPage:true}).catch(()=>{});
    throw error;
  } finally { await browser?.close().catch(()=>{}); await rm(lock,{recursive:true,force:true}); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error=>{console.error(safeError(error));process.exitCode=1;});
