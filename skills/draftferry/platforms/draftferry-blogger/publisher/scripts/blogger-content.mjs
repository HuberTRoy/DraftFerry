import { richOptions } from '../../../../scripts/rich-article.mjs';
export { inspectHtml, prepareArticle } from '../../../../scripts/rich-article.mjs';

export function parseOptions(args = process.argv.slice(2)) {
  const values = richOptions(args, 'blogger');
  if (!/^\d+$/.test(values.blog)) throw new Error('--blog must be a numeric Blogger blog ID.');
  return values;
}
