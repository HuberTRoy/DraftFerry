import assert from 'node:assert/strict';
import test from 'node:test';
import { articleHtml, parseArticle } from './article.mjs';

test('shared source keeps Markdown and resolves relative links for rich text', () => {
  const source = '\uFEFF---\r\ntitle: Garden checklist\r\ncanonical_url: https://example.org/posts/garden\r\n---\r\n\r\n# Garden checklist\r\n\r\n## Materials\r\n\r\n- **Seeds** and [soil](../soil)\r\n';
  const article = parseArticle(source);
  assert.equal(article.title, 'Garden checklist');
  assert.equal(article.markdown, '## Materials\n\n- **Seeds** and [soil](../soil)');
  assert.match(articleHtml(article), /<li><strong>Seeds<\/strong> and <a href="https:\/\/example.org\/soil">soil<\/a><\/li>/);
});

test('HTML rendering treats raw HTML as text and rejects unsafe destinations', () => {
  const article = parseArticle('# Example\n\n<script>alert(1)</script>\n\nA paragraph.');
  assert.match(articleHtml(article), /&lt;script&gt;/);
  assert.doesNotMatch(articleHtml(article), /<script>/);
  assert.throws(() => articleHtml(parseArticle('# Example\n\n[x](javascript:alert%281%29)')), /HTTP\(S\)/);
});
