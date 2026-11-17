import { richOptions } from '../../../../scripts/rich-article.mjs';
export { inspectHtml, prepareArticle } from '../../../../scripts/rich-article.mjs';

export function parseOptions(args = process.argv.slice(2)) {
  const values = richOptions(args, 'tumblr');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(values.blog)) throw new Error('--blog 应为 Tumblr 博客名');
  return values;
}
