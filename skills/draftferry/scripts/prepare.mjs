import { parseArgs } from 'node:util';
import { readArticle, articleHtml } from './article.mjs';

try {
  const { values } = parseArgs({ options: {
    input: { type: 'string' },
    title: { type: 'string' },
    'canonical-url': { type: 'string' },
    format: { type: 'string', default: 'json' },
  } });
  if (!values.input || !['json', 'markdown', 'html'].includes(values.format)) {
    throw new Error('Usage: node scripts/prepare.mjs --input article.md [--title TITLE] [--canonical-url URL] [--format json|markdown|html]');
  }
  const article = await readArticle(values.input, { title: values.title, canonicalUrl: values['canonical-url'] });
  if (values.format === 'markdown') console.log(article.markdown);
  else {
    const html = articleHtml(article);
    console.log(values.format === 'html' ? html.trimEnd() : JSON.stringify({ ...article, html }, null, 2));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
