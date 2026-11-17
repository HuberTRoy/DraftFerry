const collection = 'app.bsky.feed.post';

export function postWrite(request) {
  if (request.method() !== 'POST') return;
  const path = new URL(request.url()).pathname;
  if (path !== '/xrpc/com.atproto.repo.createRecord' && path !== '/xrpc/com.atproto.repo.applyWrites') return;
  let data;
  try { data = request.postDataJSON(); } catch { return; }
  if (path.endsWith('/com.atproto.repo.createRecord')) {
    if (data?.collection === collection && data.record && !data.record.reply) return { record: data.record };
    return;
  }
  if (!Array.isArray(data?.writes)) return;
  const matches = data.writes.flatMap((write, index) =>
    write.$type === 'com.atproto.repo.applyWrites#create' && write.collection === collection && write.value && !write.value.reply
      ? [{ index, record: write.value }]
      : []);
  if (matches.length === 1) return matches[0];
}

export function restorePostLinks(record) {
  if (typeof record?.text !== 'string') return '';
  const raw = Buffer.from(record.text);
  const parts = [];
  let offset = 0;
  for (const facet of [...(record.facets || [])].sort((a, b) => a.index?.byteStart - b.index?.byteStart)) {
    const link = facet.features?.find(feature => feature.$type === 'app.bsky.richtext.facet#link');
    const { byteStart, byteEnd } = facet.index || {};
    if (!link?.uri || !Number.isInteger(byteStart) || !Number.isInteger(byteEnd) ||
        byteStart < offset || byteStart >= byteEnd || byteEnd > raw.length) continue;
    parts.push(raw.subarray(offset, byteStart), Buffer.from(link.uri));
    offset = byteEnd;
  }
  parts.push(raw.subarray(offset));
  return Buffer.concat(parts).toString('utf8');
}
