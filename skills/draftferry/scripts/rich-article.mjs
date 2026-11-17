import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { articleHtml, escapeHtml, readArticle } from './article.mjs';

export function richOptions(args, platform) {
  const { values } = parseArgs({ args, options: {
    cdp: { type: 'string' },
    blog: { type: 'string' },
    'blog-url': { type: 'string' },
    input: { type: 'string' },
    title: { type: 'string' },
    'canonical-url': { type: 'string' },
    content: { type: 'string' },
    html: { type: 'string' },
    'dry-run': { type: 'boolean' },
    'prepare-only': { type: 'boolean' },
    'artifacts-dir': { type: 'string', default: 'artifacts/' + platform },
  } });
  if (values['dry-run'] && values['prepare-only']) throw new Error('--dry-run 与 --prepare-only 不能同时使用');
  if (!values.blog?.trim() || !values['artifacts-dir']?.trim()) throw new Error('缺少目标 --blog 或 --artifacts-dir');
  if ([values.input, values.content, values.html].filter(Boolean).length !== 1) {
    throw new Error('提供一个文章输入，使用 --input、--content 或 --html。');
  }
  if (values.html && !values.title?.trim()) throw new Error('--html 需要 --title');
  if (!values.input && values['canonical-url']) throw new Error('--canonical-url 需要 Markdown --input');
  if (values['blog-url']) {
    const root = new URL(values['blog-url']);
    if (root.protocol !== 'https:' || root.pathname !== '/' || root.search || root.hash || root.username || root.password) {
      throw new Error('--blog-url 必须是 HTTPS 博客根地址');
    }
    values['blog-url'] = root.href;
  }
  values.cdp ||= process.env['DRAFTFERRY_' + platform.toUpperCase() + '_CDP_URL'] || process.env.CDP_URL;
  if (!values['prepare-only']) {
    if (!values.cdp || !/^(?:wss?|https?):\/\//i.test(values.cdp) || !URL.canParse(values.cdp)) {
      throw new Error('缺少有效的 CDP 连接地址');
    }
  }
  return values;
}

export function prepareArticle(data) {
  const title = data?.title?.trim();
  if (!title || /[\r\n]/.test(title) || title.length > 200) throw new Error('标题无效');
  if (data.html !== undefined && data.body !== undefined) throw new Error('html 与 body 不能混用');
  const html = data.html ?? (typeof data.body === 'string' && data.body.trim().split(/\n\s*\n/)
    .map(paragraph => '<p>' + escapeHtml(paragraph).replace(/\n/g, '<br>') + '</p>').join(''));
  if (typeof html !== 'string' || !html.trim() || html.length > 200000) throw new Error('HTML 正文无效');
  return { title, html: html.trim(), canonicalUrl: data.canonicalUrl };
}

export async function readRichArticle(options) {
  if (options.input) {
    const article = await readArticle(options.input, {
      title: options.title, canonicalUrl: options['canonical-url'],
    });
    return prepareArticle({ ...article, html: articleHtml(article) });
  }
  if (options.html) return prepareArticle({ title: options.title, html: await readFile(options.html, 'utf8') });
  let input;
  if (options.content === '-') {
    process.stdin.setEncoding('utf8');
    input = '';
    for await (const chunk of process.stdin) input += chunk;
  } else {
    input = await readFile(options.content, 'utf8');
  }
  return prepareArticle(JSON.parse(input));
}

// Run inside a browser only. DOMParser keeps supplied markup inert while checking.
export function inspectHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tags = new Set('P DIV SPAN BR H1 H2 H3 H4 H5 H6 UL OL LI STRONG B EM I U S STRIKE BLOCKQUOTE PRE CODE A HR TABLE THEAD TBODY TR TH TD'.split(' '));
  for (const el of doc.querySelectorAll('*')) {
    if (['HTML','HEAD','BODY'].includes(el.tagName)) continue;
    if (!tags.has(el.tagName)) throw new Error(`HTML 不支持标签 ${el.tagName}`);
    for (const a of el.attributes) {
      if (!(['title','dir','lang'].includes(a.name) || (el.tagName === 'OL' && a.name === 'start') || (el.tagName === 'A' && ['href','target','rel'].includes(a.name)) || (['TD','TH'].includes(el.tagName) && ['colspan','rowspan'].includes(a.name)))) throw new Error(`HTML 不支持属性 ${a.name}`);
    }
    if (el.tagName === 'A') {
      const url = new URL(el.getAttribute('href'));
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('HTML 超链接必须使用 HTTP(S)');
    }
  }
  const text = doc.body.textContent.replace(/\s+/g, '').trim();
  if (!text) throw new Error('HTML 没有正文');
  return { html: doc.body.innerHTML, text, links: [...doc.body.querySelectorAll('a')].map(a => ({ href: a.href, label: a.textContent.trim() })),
    structure: [...doc.body.querySelectorAll('h1,h2,h3,h4,h5,h6,li,strong,b,em,i,pre,code,blockquote,table')].map(e => ({ tag: ({B:'STRONG',I:'EM'})[e.tagName] || e.tagName, text: e.textContent.replace(/\s+/g, '') })) };
}
