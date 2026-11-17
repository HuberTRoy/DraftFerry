import assert from 'node:assert/strict';
import test from 'node:test';
import { checkStatus } from './status.mjs';
import { configuration, inspect } from './platforms.mjs';
import { checkSummary } from '../draftferry-check/scripts/check.mjs';

const env = { CDP_URL: 'wss://browser.example/test-secret', DRAFTFERRY_BLOGGER_BLOG_ID: '42' };

test('DEV.to requires its API Key even when a CDP session is available', async () => {
  let connected = false;
  const rows = await checkStatus(['devto'], env, async () => {
    connected = true;
    throw new Error('DEV.to must not connect to CDP');
  });
  assert.equal(connected, false);
  assert.deepEqual(rows, [{ platform: 'devto', status: 'not_configured', reason: 'missing_api_key' }]);
});

function fakePage({ url, shown = [], status = 200, headers = {} }) {
  const matching = new Set(shown);
  const locator = predicates => ({
    or: other => locator([...predicates, ...other.predicates]),
    and: other => locator([
      ...predicates.filter(value => matching.has(value) && other.predicates.some(entry => matching.has(entry))),
    ]),
    predicates,
    filter: () => locator(predicates),
    first: () => locator(predicates),
    isVisible: async () => predicates.some(value => matching.has(value)),
  });
  return {
    closed: false,
    url: () => url,
    locator: selector => locator([selector]),
    getByRole: (role, { name }) => locator(name instanceof RegExp
      ? shown.filter(value => value.startsWith(role + ':') && name.test(value.slice(role.length + 1)))
      : [role + ':' + name]),
    goto: async () => ({ status: () => status, headers: () => headers }),
    close: async function () { this.closed = true; },
  };
}

test('a shared CDP session reports logged-in, logged-out and ambiguous results without closing existing tabs', async () => {
  const existing = fakePage({ url: 'https://example.com' });
  const tabs = [
    fakePage({ url: 'https://www.tumblr.com/dashboard', shown: ['button[aria-label="Text"]'] }),
    fakePage({ url: 'https://accounts.google.com/v3/signin/identifier?private=value' }),
    fakePage({ url: 'https://medium.com/me/stories', status: 403, shown: ['heading:Stories'] }),
  ];
  let opened = 0;
  let disconnected = 0;
  let connections = 0;
  const rows = await checkStatus(['tumblr', 'blogger', 'medium'], env, async endpoint => {
    assert.equal(endpoint, env.CDP_URL);
    connections++;
    return {
      contexts: () => [{ pages: () => [existing], newPage: async () => tabs[opened++] }],
      close: async () => { disconnected++; },
    };
  });
  assert.deepEqual(rows.map(row => row.status), ['logged_in', 'logged_out', 'unknown']);
  assert.equal(connections, 1);
  assert.equal(disconnected, 1);
  assert.ok(tabs.every(page => page.closed));
  assert.equal(existing.closed, false);
  assert.doesNotMatch(JSON.stringify(rows), /test-secret|private=value/);
});

test('saved-session checks distinguish a verification challenge from an ordinary HTTP 403', async () => {
  const settings = { ...env, DRAFTFERRY_MEDIUM_CDP_URL: 'wss://browser.example/separate-secret' };
  const pages = {
    [settings.DRAFTFERRY_MEDIUM_CDP_URL]: fakePage({
      url: 'https://medium.com/me/stories', status: 403, headers: { 'cf-mitigated': 'challenge' },
    }),
    [settings.CDP_URL]: fakePage({ url: 'https://www.tumblr.com/dashboard', status: 403 }),
  };
  const rows = await checkStatus(['medium', 'tumblr'], settings, async endpoint => ({
    contexts: () => [{ newPage: async () => pages[endpoint] }],
    close: async () => {},
  }));
  const report = rows.map(row => checkSummary(row, settings));
  assert.deepEqual(report.map(row => [row.action, row.connectionSetting]), [
    ['complete_browser_verification', 'DRAFTFERRY_MEDIUM_CDP_URL'],
    ['inspect_session', 'CDP_URL'],
  ]);
  assert.doesNotMatch(JSON.stringify(report), /test-secret|separate-secret/);
});

test('a platform override is isolated from the shared session and connection errors are sanitized', async () => {
  const override = 'wss://other.example/override-secret';
  const rows = await checkStatus(['x', 'tumblr', 'mastodon'], { ...env, DRAFTFERRY_X_CDP_URL: override },
    async endpoint => {
      if (endpoint === override) throw new Error('Cannot connect to ' + endpoint);
      assert.equal(endpoint, env.CDP_URL);
      return { contexts: () => [], close: async () => {} };
    });
  assert.deepEqual(rows.map(row => row.reason), [
    'cdp_connection_failed', 'no_browser_context', 'missing_platform_target',
  ]);
  assert.doesNotMatch(JSON.stringify(rows), /override-secret/);
});

test('lookalike and wrong-target pages cannot satisfy a positive probe', async () => {
  const { probe } = configuration('blogger', env);
  const shown = ['link:/View blog/', 'button:Create new post'];
  for (const url of ['https://www.blogger.com/blog/posts/24', 'https://blogger.example/blog/posts/42']) {
    assert.equal(await inspect(fakePage({ url, shown }), probe), undefined);
  }
  assert.deepEqual(await inspect(fakePage({ url: 'https://accounts.google.com/signin/challenge/pwd' }), probe),
    { status: 'unknown', reason: 'verification_required' });
});

test('configured profiles cannot redirect probes to embedded credentials or arbitrary paths', () => {
  for (const DRAFTFERRY_MASTODON_ORIGIN of ['https://secret@mastodon.example', 'https://mastodon.example/write']) {
    assert.equal(configuration('mastodon', { ...env, DRAFTFERRY_MASTODON_ORIGIN }).reason, 'invalid_platform_target');
  }
});

test('Hashnode detects a logged-in homepage with a collapsed sidebar and a signed-out marketing page', async () => {
  const { probe } = configuration('hashnode', env);
  const url = 'https://hashnode.com/';
  for (const heading of ['Your publications', 'Create a publication to start writing']) {
    assert.deepEqual(await inspect(fakePage({
      url, shown: ['heading:Good afternoon, Author', 'heading:' + heading, 'button:Toggle Sidebar'],
    }), probe), { status: 'logged_in', reason: 'authenticated_controls_visible' });
  }
  assert.deepEqual(await inspect(fakePage({
    url, shown: ['link:Start your blog, free', 'a[href="/login"]'],
  }), probe), { status: 'logged_out', reason: 'sign_in_required' });
});
