import assert from 'node:assert/strict';
import { inspectHtml } from './beehiiv-content.mjs';
export const button = (p,name) => p.getByRole('button',{name,exact:true}).filter({visible:true});
export async function step(page,name) {
  await button(page,name).first().click();
  if(name==='Compose') await page.locator('textarea[name="post-title"]').waitFor();
  if(name==='Audience') await button(page,'Web only').waitFor();
  if(name==='Web') await page.getByText('Web post settings',{exact:true}).waitFor();
  if(name==='Review') await page.getByText('Review and publish',{exact:true}).waitFor();
}
export async function checkWebRoot(page,root) {
  await step(page,'Web');
  await page.getByText(`${new URL(root).origin}/p/`,{exact:true}).waitFor();
}
export async function createDraft(page,root) {
  await page.goto('https://app.beehiiv.com/posts/template-library',{waitUntil:'domcontentloaded'});
  await button(page,'New').click();
  await page.getByText('Blank draft post',{exact:true}).click();
  await page.waitForURL(/\/posts\/[\w-]+\/edit/);
  await page.locator('textarea[name="post-title"]').waitFor();
  // Confirm the active publication before putting any supplied content into it.
  await checkWebRoot(page,root);
  await step(page,'Compose');
}
export async function assertBody(locator,expected) {
  const actual=await locator.evaluate(el=>({text:el.textContent.replace(/\s+/g,'').trim(),links:[...el.querySelectorAll('a')].map(a=>({href:a.href,label:a.textContent.trim()})),structure:[...el.querySelectorAll('h1,h2,h3,h4,h5,h6,li,strong,b,em,i,pre,code,blockquote,table')].map(e=>({tag:({B:'STRONG',I:'EM'})[e.tagName]||e.tagName,text:e.textContent.replace(/\s+/g,'')}))}));
  assert.deepEqual(actual,{text:expected.text,links:expected.links,structure:expected.structure},'富文本正文、链接或格式回读不一致');
}
export async function fillEditor(page,post) {
  const expected=await page.evaluate(inspectHtml,post.html);
  const title=page.locator('textarea[name="post-title"]'),body=page.locator('[contenteditable=true]').filter({visible:true});
  await body.waitFor();
  if(!['','New post'].includes((await title.inputValue()).trim()) || (await body.innerText()).trim()) throw Error('新草稿已有内容，停止以避免覆盖');
  await title.fill(post.title);
  await body.focus();
  await body.evaluate((el,html)=>{const dt=new DataTransfer();dt.setData('text/html',html);dt.setData('text/plain',new DOMParser().parseFromString(html,'text/html').body.innerText);el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));},expected.html);
  await title.blur();
  assert.equal(await title.inputValue(),post.title);
  await assertBody(body,expected);
  return expected;
}
export async function verifySavedDraft(page,title,expected) {
  await page.waitForTimeout(3500);
  await page.reload({waitUntil:'domcontentloaded'});
  await step(page,'Compose');
  assert.equal(await page.locator('textarea[name="post-title"]').inputValue(),title);
  await assertBody(page.locator('[contenteditable=true]').filter({visible:true}),expected);
}
export async function openPublishConfirmation(page,root,title) {
  await step(page,'Audience');
  await button(page,'Web only').click();
  // Do not use Next here: its destination can reflect stale email mode state.
  await page.waitForFunction(()=>![...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='Email' && e.getBoundingClientRect().width));
  await checkWebRoot(page,root);
  await step(page,'Review');
  await page.getByText('Publish to Web Only',{exact:true}).waitFor();
  await page.getByText(`Post Title: ${title}`,{exact:true}).waitFor();
  const tip=button(page,'Got It!');if(await tip.isVisible())await tip.click();
  await button(page,'Schedule').first().click();
  // beehiiv's dialog wrapper has zero height; its fixed-position panel is visible.
  // Filtering the wrapper by visible would discard the live modal.
  const dialog=page.getByRole('dialog');
  await dialog.getByText('Publish now',{exact:true}).filter({visible:true}).click();
  await dialog.getByText('Publishes immediately',{exact:true}).waitFor();
  return dialog;
}
export async function verifyPublic(browser,permalink,title,expected) {
  const anonymous=await browser.newContext();
  try {
    const page=await anonymous.newPage();page.setDefaultTimeout(30000);
    const response=await page.goto(permalink,{waitUntil:'domcontentloaded',timeout:45000});
    if(!response?.ok() || new URL(page.url()).origin!==new URL(permalink).origin)throw Error('匿名文章请求失败');
    await page.getByRole('heading',{name:title,exact:true}).first().waitFor();
    // Locate the smallest rendered container containing the entire expected body.
    // Compare its body and all links exactly; surrounding site navigation is excluded.
    const body=page.locator('body *').filter({visible:true});
    const index=await body.evaluateAll((els,text)=>els.findIndex(el=>el.textContent.replace(/\s+/g,'').trim()===text),expected.text);
    if(index<0)throw Error('公开页面缺少完整正文');
    await assertBody(body.nth(index),expected);
  } finally {await anonymous.close();}
}
