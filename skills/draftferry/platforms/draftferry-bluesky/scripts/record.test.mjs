import assert from 'node:assert/strict';
import test from 'node:test';
import { postWrite, restorePostLinks } from './record.mjs';

test('identify a Bluesky batch post and compare its complete URL despite the shortened display', () => {
  const prefix = '原文\n\n';
  const abbreviated = 'example.org/articles/sam...';
  const uri = 'https://example.org/articles/sample';
  const request = {
    method: () => 'POST',
    url: () => 'https://example.bsky.network/xrpc/com.atproto.repo.applyWrites',
    postDataJSON: () => ({
      writes: [
        { $type: 'com.atproto.repo.applyWrites#create', collection: 'app.bsky.feed.threadgate' },
        {
          $type: 'com.atproto.repo.applyWrites#create', collection: 'app.bsky.feed.post',
          value: {
            text: prefix + abbreviated,
            facets: [{
              index: { byteStart: Buffer.byteLength(prefix), byteEnd: Buffer.byteLength(prefix + abbreviated) },
              features: [{ $type: 'app.bsky.richtext.facet#link', uri }],
            }],
          },
        },
      ],
    }),
  };
  const write = postWrite(request);
  assert.equal(write.index, 1);
  assert.equal(restorePostLinks(write.record), prefix + uri);
});
