import { readFile } from 'node:fs/promises';
import { Marked, Parser, TextRenderer } from 'marked';
import { parseDocument } from 'yaml';

export const escapeHtml = value => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

export function webUrl(value, base) {
  let url;
  try { url = new URL(value, base); }
  catch { throw new Error('Use an absolute HTTP(S) URL or provide a canonical URL for relative links.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Article URLs must use HTTP(S) without embedded credentials.');
  }
  return url.href;
}

const parser = new Marked();

export async function readArticle(file, options = {}) {
  return parseArticle(await readFile(file, 'utf8'), options);
}

export function parseArticle(source, { title, canonicalUrl } = {}) {
  let markdown = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  let metadata = {};
  if (markdown.startsWith('---\n')) {
    const frontMatter = /^---\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/.exec(markdown);
    if (!frontMatter) throw new Error('Unclosed YAML front matter.');
    const document = parseDocument(frontMatter[1]);
    if (document.errors.length) throw new Error('Invalid YAML front matter.');
    metadata = document.toJS({ maxAliasCount: 0 }) ?? {};
    if (typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('Front matter must be a mapping.');
    markdown = markdown.slice(frontMatter[0].length);
  }

  const first = parser.lexer(markdown).find(token => token.type !== 'space');
  const leadingTitle = first?.type === 'heading' && first.depth === 1 ? first : undefined;
  const headingText = leadingTitle && new Parser().parseInline(leadingTitle.tokens, new TextRenderer());
  const articleTitle = title ?? metadata.title ?? headingText;
  if (typeof articleTitle !== 'string' || !articleTitle.trim() || /[\r\n]/.test(articleTitle)) {
    throw new Error('Provide a title with --title, YAML title, or a leading H1.');
  }
  // An explicitly named article may use a different opening heading as body content.
  if (leadingTitle && headingText.trim() === articleTitle.trim()) {
    const start = markdown.indexOf(leadingTitle.raw);
    if (start >= 0) markdown = markdown.slice(start + leadingTitle.raw.length);
  }
  if (!markdown.trim()) throw new Error('The Markdown article body is empty.');
  const canonical = canonicalUrl ?? metadata.canonical_url;
  if (canonical !== undefined && (typeof canonical !== 'string' || !canonical.trim())) {
    throw new Error('Provide a valid canonical URL.');
  }
  return { title: articleTitle.trim(), markdown: markdown.trimEnd(), canonicalUrl: canonical && webUrl(canonical) };
}

export function articleHtml({ markdown, canonicalUrl }) {
  const richText = new Marked({
    renderer: {
      html: token => escapeHtml(token.text),
      link(token) {
        const url = webUrl(token.href, canonicalUrl);
        const title = token.title ? ' title="' + escapeHtml(token.title) + '"' : '';
        return '<a href="' + escapeHtml(url) + '"' + title + '>' + this.parser.parseInline(token.tokens) + '</a>';
      },
      image(token) {
        const url = webUrl(token.href, canonicalUrl);
        return '<img src="' + escapeHtml(url) + '" alt="' + escapeHtml(token.text) + '">';
      },
      code: token => '<pre><code>' + escapeHtml(token.text) + '\n</code></pre>\n',
      tablecell(token) {
        const tag = token.header ? 'th' : 'td';
        return '<' + tag + '>' + this.parser.parseInline(token.tokens) + '</' + tag + '>\n';
      },
      checkbox: token => token.checked ? '[x] ' : '[ ] ',
    },
  });
  return richText.parse(markdown);
}
