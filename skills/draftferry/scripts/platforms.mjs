const role = (type, name) => page => page.getByRole(type, { name, exact: true });
const css = selector => page => page.locator(selector);
const on = (url, routes) => routes.test(url.pathname);
const auth = /(?:^|\/)(?:sign[_-]?in|log[_-]?in|sign[_-]?up|register)(?:\/|$)/i;

function httpsOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.href !== url.origin + '/') {
    throw new Error('Expected an HTTPS origin with no path or credentials');
  }
  return url.origin;
}

const fixed = (href, paths, ready, extra = {}) => ({
  href, origin: new URL(href).origin, paths, ready, ...extra
});

const probes = {
  x: () => fixed('https://x.com/home', /^\/home\/?$/, [
    css('[data-testid="SideNav_AccountSwitcher_Button"]'),
    css('[data-testid="SideNav_NewTweet_Button"]'),
  ], { signedOutPath: /^\/(?:i\/flow\/login|login)(?:\/|$)/ }),
  bluesky: () => fixed('https://bsky.app/', /^\/$/, [
    page => css('[data-testid="composeFAB"], [data-testid="newPostBtn"]')(page)
      .or(role('button', /^(New Post|Compose new post)$/i)(page)),
  ], { signedOut: page => role('button', /^sign in$/i)(page).or(role('link', /^sign in$/i)(page)) }),
  mastodon: env => {
    if (!env.DRAFTFERRY_MASTODON_ORIGIN) return;
    const origin = httpsOrigin(env.DRAFTFERRY_MASTODON_ORIGIN);
    return fixed(origin + '/home', /^\/home\/?$/, [
      css('nav a[href^="/@"]'),
      role('button', /^New Post$/i),
    ]);
  },
  medium: () => fixed('https://medium.com/me/stories', /^\/me\/stories(?:\/|$)/, [
    page => role('heading', 'Your stories')(page).or(role('heading', 'Stories')(page)),
    role('link', 'Profile'),
  ]),
  substack: env => {
    if (!env.DRAFTFERRY_SUBSTACK_ORIGIN) return;
    const origin = httpsOrigin(env.DRAFTFERRY_SUBSTACK_ORIGIN);
    return fixed(origin + '/publish/posts', /^\/publish(?:\/|$)/, [
      role('button', 'Create'),
      page => role('heading', 'Posts')(page).or(role('link', 'Posts')(page)),
    ], { authOrigins: ['https://substack.com'] });
  },
  tumblr: () => fixed('https://www.tumblr.com/dashboard', /^\/dashboard(?:\/|$)/, [
    css('button[aria-label="Text"]'),
  ]),
  blogger: env => {
    const id = env.DRAFTFERRY_BLOGGER_BLOG_ID;
    if (!id) return;
    if (!/^\d+$/.test(id)) throw new Error('Expected a numeric Blogger blog ID');
    return fixed('https://www.blogger.com/blog/posts/' + id + '?hl=en', new RegExp('^/blog/posts/' + id + '/?$'), [
      page => page.getByRole('link', { name: /View blog/i }),
      role('button', /^Create new post$/i),
    ], { authOrigins: ['https://accounts.google.com'], signedOutPath: /^\/(?:about|go\/signin)(?:\/|$)/ });
  },
  beehiiv: () => fixed('https://app.beehiiv.com/posts', /^\/posts\/?$/, [
    page => role('button', 'Start writing')(page).or(role('link', 'Start writing')(page))
      .or(role('button', 'New post')(page)).or(role('link', 'New post')(page)),
  ], { authOrigins: ['https://www.beehiiv.com'] }),
  hashnode: () => fixed('https://hashnode.com/', /^\/$/, [
    page => role('link', 'Drafts')(page).or(role('heading', 'Drafts')(page)),
    page => role('button', 'Write')(page).or(role('link', 'Write')(page)),
  ], { authOrigins: ['https://auth.hashnode.com'] }),
};

export const platforms = [...Object.keys(probes), 'devto'];

export function configuration(platform, env) {
  const key = 'DRAFTFERRY_' + platform.toUpperCase() + '_CDP_URL';
  const endpoint = env[key] || (platform === 'x' && env.X_CDP_URL) || env.CDP_URL;
  if (!endpoint?.trim()) return { status: 'not_configured', reason: 'missing_cdp_endpoint' };
  let probe;
  try { probe = probes[platform](env); }
  catch { return { status: 'not_configured', reason: 'invalid_platform_target' }; }
  return probe ? { endpoint, probe } : { status: 'not_configured', reason: 'missing_platform_target' };
}

async function visible(locator) {
  // Filter before first() so a hidden duplicate does not hide the visible element.
  return locator.filter({ visible: true }).first().isVisible();
}

export async function inspect(page, probe) {
  const url = new URL(page.url());
  if ([probe.origin, ...(probe.authOrigins ?? [])].includes(url.origin)) {
    if (on(url, /(?:^|\/)(?:two_factor|challenge|checkpoint)(?:\/|$)/i)) {
      return { status: 'unknown', reason: 'verification_required' };
    }
    if (on(url, auth)) {
      return { status: 'logged_out', reason: 'sign_in_required' };
    }
    if (url.origin === probe.origin && probe.signedOutPath && on(url, probe.signedOutPath)) {
      return { status: 'logged_out', reason: 'sign_in_required' };
    }
    if (url.origin === 'https://accounts.google.com' && probe.origin === 'https://www.blogger.com') {
      return { status: 'logged_out', reason: 'sign_in_required' };
    }
  }
  if (url.origin !== probe.origin) return;
  if (probe.signedOut && await visible(probe.signedOut(page))) {
    return { status: 'logged_out', reason: 'sign_in_required' };
  }
  if (on(url, probe.paths) && (await Promise.all(probe.ready.map(marker => visible(marker(page))))).every(Boolean)) {
    return { status: 'logged_in', reason: 'authenticated_controls_visible' };
  }
}
