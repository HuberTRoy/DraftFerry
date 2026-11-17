import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { readArticle } from '../../../scripts/article.mjs';
import { devToRequest, devToStatus } from './api.mjs';

async function main() {
  const { values } = parseArgs({ options: {
    input: { type: 'string' },
    title: { type: 'string' },
    'canonical-url': { type: 'string' },
    account: { type: 'string' },
    tag: { type: 'string', multiple: true },
    publish: { type: 'boolean' },
  } });
  if (!values.input) {
    throw new Error('Usage: node publish.mjs --input article.md [--title TITLE] [--canonical-url URL] [--tag TAG] [--account USERNAME] [--publish]');
  }
  const source = await readArticle(values.input, { title: values.title, canonicalUrl: values['canonical-url'] });
  const article = { title: source.title, body_markdown: source.markdown, published: !!values.publish };
  if (source.canonicalUrl) article.canonical_url = source.canonicalUrl;
  if (values.tag?.length) article.tags = values.tag;
  // Forem parses leading front matter in the body and can use it to override payload fields.
  if (/^\s*---\s*\n/.test(article.body_markdown)) throw new Error('DEV.to body cannot begin with a second front matter block.');
  if (!values.publish) {
    console.log(JSON.stringify({ article }, null, 2));
    return;
  }
  const identity = await devToStatus();
  if (identity.status !== 'logged_in') throw new Error('DEV.to API Key check failed: ' + identity.reason);
  if (values.account && values.account.replace(/^@/, '').toLowerCase() !== identity.account.toLowerCase()) {
    throw new Error('DEV.to API Key belongs to a different account.');
  }
  const apiKey = process.env.DEV_TO_API_KEY.trim();
  const directory = 'artifacts/devto';
  await mkdir(directory, { recursive: true });
  const hash = createHash('sha256').update(JSON.stringify(article)).digest('hex');
  const receipt = join(directory, `post-${hash}.json`);
  const initial = { title: source.title, account: identity.account };
  try {
    await writeFile(receipt, JSON.stringify({ ...initial, status: 'submitting' }), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const previous = JSON.parse(await readFile(receipt, 'utf8'));
    throw new Error(`Existing DEV.to receipt (${previous.status}). Check ${receipt} before submitting again.`);
  }
  let entry = initial;
  try {
    const response = await devToRequest('/articles', { apiKey, method: 'POST', body: JSON.stringify({ article }) });
    if (!response.ok) throw new Error(`DEV.to returned HTTP ${response.status}`);
    const result = await response.json();
    if (!Number.isSafeInteger(result.id) || result.id < 1) throw new Error('DEV.to did not return an article ID.');
    entry = { ...initial, status: 'submitted', id: result.id, url: result.url };
    await writeFile(receipt, JSON.stringify(entry, null, 2));
    const publicResponse = await devToRequest('/articles/' + result.id);
    if (!publicResponse.ok) throw new Error('DEV.to submitted the article but the public API did not return it.');
    const published = await publicResponse.json();
    const permalink = new URL(published.url);
    if (permalink.origin !== 'https://dev.to' || published.id !== result.id || published.title !== source.title ||
        published.user?.username !== identity.account || published.body_markdown?.trim() !== article.body_markdown.trim()) {
      throw new Error('DEV.to submitted the article but its public record differs from the source.');
    }
    entry = { ...entry, status: 'published', permalink: permalink.href };
    await writeFile(receipt, JSON.stringify(entry, null, 2));
    console.log(JSON.stringify(entry, null, 2));
  } catch (error) {
    await writeFile(receipt, JSON.stringify({ ...entry, status: 'unknown' }, null, 2));
    throw error;
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
