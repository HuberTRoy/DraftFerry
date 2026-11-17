// Opt-in integration check in an isolated remote context. All requests are
// intercepted with fixtures: no account, draft or publication reaches Blogger.
import { chromium } from 'playwright';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { main, safeError } from './blogger-post.mjs';
import { inspectHtml } from './blogger-content.mjs';
const endpoint = process.env.CDP_URL;
if (!endpoint) throw new Error('CDP_URL is required');
const directory = await mkdtemp(join(tmpdir(),'blogger-browser-check-'));
const article = {title:'Fixture rich text article',html:'<h2>Heading</h2><p>A <strong>bold</strong> and <em>italic</em> paragraph with <a href="https://example.org/guide">reading guide</a> access.</p><ul><li>One</li><li>Two</li></ul><pre><code>const a = 1 &lt; 2;</code></pre>'};
const file=join(directory,'article.json');await writeFile(file,JSON.stringify(article));
const blog='123',postId='456',postsUrl=`https://www.blogger.com/blog/posts/${blog}`,editorUrl=`https://www.blogger.com/blog/post/edit/${blog}/${postId}`,permalink='https://fixture.blogspot.com/2026/10/fixture.html';
const esc=v=>v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
let browser, context, saved={title:'',html:''}, published=false, confirms=0, corruptPublic=false;
async function routeAll(ctx) {
  await ctx.route('**/*',async route=>{
    const req=route.request(),url=req.url();
    const fulfill=body=>route.fulfill({contentType:'text/html',body});
    if(url===postsUrl) return fulfill(`<a href="https://fixture.blogspot.com/">View blog</a><button aria-label="Create new post" onclick="location.href='${editorUrl}'">New post</button>${published?`<div>Published<a href="${permalink}" aria-label="View" style="visibility:hidden">View</a><a href="/blog/post/edit/${blog}/${postId}">edit</a></div>`:''}`);
    if(url===editorUrl) return fulfill(`<input aria-label="Title" value="${esc(saved.title)}"><iframe class="editable" src="/fixture/body"></iframe><button aria-label="Publish" onclick="document.querySelector('[role=alertdialog]').hidden=false">Publish</button><div role="alertdialog" hidden>Publish post?<button onclick="fetch('/fixture/publish',{method:'POST'}).then(()=>location.href='${postsUrl}')">Confirm</button><button onclick="this.parentElement.hidden=true">Cancel</button></div><script>window.store=()=>fetch('/fixture/save',{method:'POST',body:JSON.stringify({title:document.querySelector('input').value,html:document.querySelector('iframe').contentDocument.body.innerHTML})});document.querySelector('input').addEventListener('input',()=>window.store());</script>`);
    if(url==='https://www.blogger.com/fixture/body') {
      // Model Blogger's reload-time link masking using its observed attribute.
      const masked=saved.html.replace(/href="([^"]+)"/g,(_,href)=>`href="#" data-original-attrs="${esc(JSON.stringify({'data-original-href':href}))}"`);
      return fulfill(`<html><head><script>addEventListener('DOMContentLoaded',()=>document.body.addEventListener('input',()=>parent.store()));</script></head><body contenteditable>${masked}</body></html>`);
    }
    if(url==='https://www.blogger.com/fixture/save') {saved=JSON.parse(req.postData());return route.fulfill({body:'ok'});}
    if(url==='https://www.blogger.com/fixture/publish') {published=true;confirms++;return route.fulfill({body:'ok'});}
    if(url===permalink) return fulfill(`<h3 class="post-title">${article.title}</h3><div class="post-body">${corruptPublic?'<p>Wrong body</p>':article.html}</div>`);
    return route.fulfill({status:404,body:'Fixture blocks every unlisted request'});
  });
}
try{
  browser=await chromium.connectOverCDP(endpoint);context=await browser.newContext();await routeAll(context);
  const wrapper={contexts:()=>[context],close:async()=>{},newContext:async()=>{const c=await browser.newContext();await routeAll(c);return c;}};
  const args=['--blog',blog,'--cdp',endpoint,'--blog-url','https://fixture.blogspot.com/','--content',file,'--artifacts-dir',directory];
  await main([...args,'--dry-run'],{connectBrowser:async()=>wrapper});assert.equal(confirms,0);saved={title:'',html:''};
  await main(args,{connectBrowser:async()=>wrapper});assert.equal(confirms,1);
  const receipt=(await readdir(directory)).find(f=>/^post-.*\.json$/.test(f));
  assert.equal(JSON.parse(await readFile(join(directory,receipt),'utf8')).status,'published');
  await assert.rejects(main(args,{connectBrowser:async()=>wrapper}),/已有提交记录/);assert.equal(confirms,1);
  // A different article whose post is public but wrong must leave unknown and block reruns.
  const changed={...article,title:'Changed fixture',html:article.html+'<p>Changed</p>'};await writeFile(file,JSON.stringify(changed));
  saved={title:'',html:''};published=false;corruptPublic=true;
  await assert.rejects(main(args,{connectBrowser:async()=>wrapper}));assert.equal(confirms,2);
  const receipts=await Promise.all((await readdir(directory)).filter(f=>/^post-.*\.json$/.test(f)).map(async f=>JSON.parse(await readFile(join(directory,f),'utf8'))));
  assert.ok(receipts.some(r=>r.status==='unknown'));
  await assert.rejects(main(args,{connectBrowser:async()=>wrapper}),/尚未确认/);assert.equal(confirms,2);
  const page=await context.newPage();await page.goto(postsUrl);
  for(const invalid of ['<script>alert(1)</script><p>Text</p>','<p onclick="alert(1)">Text</p>','<p><a href="javascript:alert(1)">Text</a></p>']) await assert.rejects(page.evaluate(inspectHtml,invalid));
  console.log('Browser fixture checks passed: rich text, saved reload, link masking, draft, single confirmation, public verification, duplicate and unknown guards, unsafe HTML rejection. No live publication.');
}catch(error){console.error(safeError(error).split(endpoint).join('[CDP REDACTED]'));process.exitCode=1;}
finally{await context?.close();await browser?.close();await rm(directory,{recursive:true,force:true});}
