import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseOptions, prepareArticle } from './beehiiv-content.mjs';
import { main, safeError } from './beehiiv-post.mjs';
const provided = ['--blog','sample-newsletter','--content','-','--prepare-only'];
test('Publication and input modes are explicit; unsupported modes fail',()=>{
  assert.equal(parseOptions(provided).content,'-');
  assert.throws(()=>parseOptions(['--blog','bad/slug','--content','-','--prepare-only']),/域名/);
  assert.throws(()=>parseOptions([...provided,'--markdown','article.md']),/Unknown option/);
  assert.throws(()=>parseOptions([...provided,'--html','article.html','--title','x']),/提供一个文章输入/);
  assert.throws(()=>parseOptions([...provided,'--dry-run']),/不能同时/);
  assert.throws(()=>parseOptions(['--blog','123','--content','-','--cdp','bad']),/CDP/);
  assert.equal(parseOptions(provided)['blog-url'],'https://sample-newsletter.beehiiv.com/');
  for(const root of ['http://example.com/','https://user:pass@example.com/','https://example.com/?token=x','https://example.com/#fragment','https://example.com/sub/']) {
    assert.throws(()=>parseOptions([...provided,'--blog-url',root]),/根地址/);
  }
  assert.equal(parseOptions([...provided,'--blog-url','https://newsletter.example.com'])['blog-url'],'https://newsletter.example.com/');
});
test('HTML is retained, plain text escaped, no Markdown link text is synthesized',()=>{
  const html='<h2>Heading</h2><p>A <strong>bold</strong> point with <a href="https://example.com/">resource</a>.</p><ul><li>Item</li></ul>';
  assert.equal(prepareArticle({title:'Title',html},{source:'provided'}).html,html);
  const p=prepareArticle({title:'Title',body:'A < B & C\nNext\n\nParagraph'},{source:'provided'});
  assert.equal(p.html,'<p>A &lt; B &amp; C<br>Next</p><p>Paragraph</p>');
  assert.throws(()=>prepareArticle({title:'Title',html,body:'mixed'},{source:'provided'}),/不能混用/);
});
test('prepare-only and uncertain receipts never connect or publish',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'beehiiv-unit-'));
  try{
    const content=join(dir,'article.md');
    await writeFile(content,'# Title\n\n## Heading\n\n[Body](https://example.org/guide)');
    const base=['--blog','123','--input',content,'--artifacts-dir',dir];
    let connections=0;const connectBrowser=async()=>{connections++;throw new Error('Must not connect');};
    await main([...base,'--prepare-only'],{connectBrowser});
    assert.equal(connections,0);
    const file=(await readdir(dir)).find(f=>f.endsWith('-content.json'));
    const prepared = JSON.parse(await readFile(join(dir,file),'utf8'));
    assert.equal(prepared.title, 'Title');
    assert.match(prepared.html, /<h2>Heading<\/h2>/);
    assert.match(prepared.html, /<a href="https:\/\/example.org\/guide">Body<\/a>/);
    await writeFile(join(dir,'post-uncertain.json'),JSON.stringify({blog:'123',status:'unknown'}));
    await assert.rejects(main([...base,'--cdp','https://example.test'],{connectBrowser}),/尚未确认/);
    assert.equal(connections,0);
    assert.equal((await readdir(dir)).some(f=>f.endsWith('.lock')),false);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('CDP errors redact credentials',()=>assert.doesNotMatch(safeError(new Error('wss://host/path?apiKey=example-secret123')),/example-secret123|apiKey/));
