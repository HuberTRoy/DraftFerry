import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { readArticle } from './article.mjs';

export async function socialSource() {
  const { values } = parseArgs({ options: {
    input: { type: 'string' },
    title: { type: 'string' },
    'canonical-url': { type: 'string' },
    text: { type: 'string' },
    account: { type: 'string' },
    origin: { type: 'string' },
    preview: { type: 'boolean' },
    publish: { type: 'boolean' },
  } });
  if ((values.preview && values.publish) || (!values.input && !values.text)) {
    throw new Error('Provide --input article.md or --text and use at most one of --preview and --publish.');
  }
  if ((values.preview || values.publish) && !values.account?.trim()) {
    throw new Error('Specify the posting account with --account.');
  }
  const source = values.input && await readArticle(values.input, {
    title: values.title, canonicalUrl: values['canonical-url'],
  });
  const text = values.text?.trim() || (source?.canonicalUrl && `${source.title}\n\n${source.canonicalUrl}`);
  if (!text) throw new Error('Provide explicit --text for articles without a public source URL.');
  return { ...values, text };
}

export function normalizePostText(text) {
  return text.replace(/\r\n/g, '\n').trim();
}

export async function capturePreview(page, platform) {
  const dir = join('artifacts', platform);
  await mkdir(dir, { recursive: true });
  const path = join(dir, 'preview.png');
  await page.screenshot({ path });
  return path;
}
