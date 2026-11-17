import { parseArgs } from 'node:util';
import { articleHtml, readArticle } from './article.mjs';

export async function sourceForPublisher() {
  const { values } = parseArgs({ options: {
    input: { type: 'string' },
    title: { type: 'string' },
    'canonical-url': { type: 'string' },
    origin: { type: 'string' },
    dashboard: { type: 'string' },
    'draft-url': { type: 'string' },
    draft: { type: 'boolean' },
    publish: { type: 'boolean' },
  } });
  if (!values.input || (values.draft && values.publish)) {
    throw new Error('Provide --input article.md and use at most one of --draft and --publish.');
  }
  const article = await readArticle(values.input, {
    title: values.title, canonicalUrl: values['canonical-url'],
  });
  return { ...values, article: { ...article, html: articleHtml(article).trim() } };
}
