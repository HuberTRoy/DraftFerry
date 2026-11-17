// All requests in isolated contexts are fulfilled locally; never posts to beehiiv.
import { chromium } from 'playwright';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { main,safeError } from './beehiiv-post.mjs';
const endpoint=process.env.CDP_URL;
if(!endpoint)throw Error('CDP_URL is required');
const dir=await mkdtemp(join(tmpdir(),'beehiiv-check-'));
const file=join(dir,'article.json'),root='https://fixture.beehiiv.com/',id='fixture-post',edit=`https://app.beehiiv.com/posts/${id}/edit`,publicUrl=root+'p/fixture';
const article={title:'Fixture rich text article',html:'<h2>Heading</h2><p>A <strong>bold</strong> and <em>italic</em> point with <a href="https://example.org/guide">reading guide</a>.</p><ul><li>One</li><li>Two</li></ul>'};
let browser,context,saved={title:'New post',html:''},confirms=0,corrupt=false,mode='Email and web',wrongRoot=false;
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
async function routes(ctx){await ctx.route('**/*',async route=>{
 const req=route.request(),u=new URL(req.url()),fulfill=body=>route.fulfill({contentType:'text/html',body});
 if(req.url()===publicUrl)return fulfill(`<h1>${saved.title}</h1><article>${corrupt?'<p>Incorrect</p>':saved.html}</article>`);
 if(u.origin!=='https://app.beehiiv.com')return route.fulfill({status:404,body:'Blocked'});
 if(u.pathname==='/fixture/save'){saved=JSON.parse(req.postData());return route.fulfill({body:'ok'});}
 if(u.pathname==='/fixture/mode'){mode=req.postData();return route.fulfill({body:'ok'});}
 if(u.pathname==='/fixture/publish'){assert.equal(mode,'Web only');confirms++;return route.fulfill({body:'ok'});}
 if(u.pathname==='/posts/template-library')return fulfill(`<nav><button>New</button></nav><button aria-haspopup="menu" onclick="document.querySelector('a').hidden=false">New</button><a hidden href="${edit}">Blank draft post</a>`);
 if(u.pathname==='/posts')return fulfill('<h1>Posts</h1>');
 if(u.pathname===`/posts/${id}`)return fulfill(`<p>Published</p><input name="post_url" value="${publicUrl}">`);
 if(u.pathname===`/posts/${id}/edit`)return fulfill(`
 <nav><button onclick="step('Compose')">Compose</button><button onclick="step('Audience')">Audience</button><button id="email" ${mode==='Web only'?'hidden':''}>Email</button><button onclick="step('Web')">Web</button><button onclick="step('Review')">Review</button></nav>
 <section id="Compose"><textarea name="post-title">${saved.title}</textarea><div contenteditable="true">${saved.html}</div></section>
 <section id="Audience" hidden><button onclick="fetch('/fixture/mode',{method:'POST',body:'Web only'});document.querySelector('#email').hidden=true">Web only</button></section>
 <section id="Web" hidden><h2>Web post settings</h2><span>${wrongRoot?'https://wrong.beehiiv.com/p/':root+'p/'}</span></section>
 <section id="Review" hidden><h1>Review and publish</h1><p>Publish to Web Only</p><p>Post Title: ${saved.title}</p><button onclick="document.querySelector('[role=dialog]').hidden=false">Schedule</button></section>
 <div role="dialog" hidden style="height:0"><div style="position:fixed;inset:100px;background:white;z-index:99"><div id="choice" onclick="this.hidden=true;document.querySelector('#now').hidden=false;document.querySelector('#immediate').hidden=false">Publish now</div><p id="immediate" hidden>Publishes immediately</p><button id="now" hidden onclick="fetch('/fixture/publish',{method:'POST'}).then(()=>location.href='/posts/${id}?launch=true')">Publish now</button></div></div>
 <script>function step(s){document.querySelectorAll('section').forEach(e=>e.hidden=e.id!==s)}
 const title=document.querySelector('textarea'),body=document.querySelector('[contenteditable]');
 function store(){fetch('/fixture/save',{method:'POST',body:JSON.stringify({title:title.value,html:body.innerHTML})})}
 title.addEventListener('input',store);body.addEventListener('paste',e=>{e.preventDefault();body.innerHTML=e.clipboardData.getData('text/html');store()});</script>`);
 return route.fulfill({status:404,body:'Unlisted request blocked'});
});}
try{
 browser=await chromium.connectOverCDP(endpoint);context=await browser.newContext({serviceWorkers:'block'});await routes(context);
 const wrapper={contexts:()=>[context],close:async()=>{},newContext:async()=>{const c=await browser.newContext({serviceWorkers:'block'});await routes(c);return c;}};
 await writeFile(file,JSON.stringify(article));
 const args=['--blog','fixture','--content',file,'--cdp',endpoint,'--artifacts-dir',dir];
 await main([...args,'--dry-run'],{connectBrowser:async()=>wrapper});assert.equal(confirms,0);
 saved={title:'New post',html:''};await main(args,{connectBrowser:async()=>wrapper});assert.equal(confirms,1);
 await assert.rejects(main(args,{connectBrowser:async()=>wrapper}),/A submission receipt already exists/);assert.equal(confirms,1);
 await writeFile(file,JSON.stringify({...article,title:'Changed title',html:article.html+'<p>Changed</p>'}));
 saved={title:'New post',html:''};corrupt=true;
 await assert.rejects(main(args,{connectBrowser:async()=>wrapper}),/The public page does not contain the full article body./);assert.equal(confirms,2);
 const receipts=await Promise.all((await readdir(dir)).filter(f=>/^post-.*\.json$/.test(f)).map(async f=>JSON.parse(await readFile(join(dir,f),'utf8'))));
 assert.ok(receipts.some(r=>r.status==='published'));assert.ok(receipts.some(r=>r.status==='unknown'));
 await assert.rejects(main(args,{connectBrowser:async()=>wrapper}),/Unconfirmed submission/);assert.equal(confirms,2);
 console.log('Fixture passed: saved rich text, web-only mode, one final confirmation, anonymous verification, duplicate and unknown guards. No live publication.');
}catch(e){console.error(safeError(e).split(endpoint).join('[CDP REDACTED]'));process.exitCode=1;}
finally{await context?.close();await browser?.close();await rm(dir,{recursive:true,force:true});}
