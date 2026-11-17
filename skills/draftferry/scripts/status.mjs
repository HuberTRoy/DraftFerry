import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';
import { configuration, inspect, inspectAuthRoute, platforms } from './platforms.mjs';
import { devToStatus } from '../platforms/draftferry-devto/scripts/api.mjs';

const result = (status, reason) => ({ status, reason });

async function checkPage(context, probe) {
  let page;
  try {
    page = await context.newPage();
    const response = await page.goto(probe.href, { waitUntil: 'domcontentloaded', timeout: 18000 });
    const status = response?.status();
    const initialUrl = new URL(page.url());
    const authState = inspectAuthRoute(initialUrl, probe);
    if (response?.headers?.()?.['cf-mitigated'] === 'challenge') {
      return result('unknown', 'verification_required');
    }
    if (authState) return authState;
    if (status === 401 && initialUrl.origin === probe.origin) {
      return result('logged_out', 'authentication_required');
    }
    if (status >= 400) return result('unknown', 'platform_http_' + status);
    const deadline = Date.now() + 7000;
    do {
      const observation = await inspect(page, probe);
      if (observation) return observation;
      await wait(250);
    } while (Date.now() < deadline);
    return result('unknown', 'no_matching_login_signal');
  } catch {
    // Playwright errors can include a private URL or request details.
    return result('unknown', 'navigation_or_probe_failed');
  } finally {
    await page?.close({ runBeforeUnload: false }).catch(() => {});
  }
}

async function connect(endpoint) {
  const { chromium } = await import('playwright');
  const options = { timeout: 15000, noDefaults: true };
  try { return await chromium.connectOverCDP(endpoint, options); }
  catch (error) {
    if (!/502|503|econnreset|etimedout|timeout/i.test(error.message)) throw error;
    await wait(10000);
    return chromium.connectOverCDP(endpoint, options);
  }
}

export async function checkStatus(selected, env = process.env, connectBrowser = connect) {
  const rows = new Map();
  const groups = new Map();
  const apiChecks = [];
  for (const platform of selected) {
    if (platform === 'devto') {
      apiChecks.push(devToStatus(env).then(status => rows.set(platform, status)));
      continue;
    }
    const config = configuration(platform, env);
    if (!config.endpoint) rows.set(platform, config);
    else {
      if (!groups.has(config.endpoint)) groups.set(config.endpoint, []);
      groups.get(config.endpoint).push({ platform, probe: config.probe });
    }
  }
  const cdpChecks = [...groups].map(async ([endpoint, targets]) => {
    let browser;
    try {
      browser = await connectBrowser(endpoint);
      // Match the legacy publishers' profile selection. Never create a fresh context
      // or choose another profile just because it has a logged-in account.
      const context = browser.contexts()[0];
      for (const { platform, probe } of targets) {
        const observation = context
          ? await checkPage(context, probe)
          : result('unknown', 'no_browser_context');
        rows.set(platform, observation);
      }
    } catch (error) {
      const reason = error.code === 'ERR_MODULE_NOT_FOUND' ? 'playwright_not_installed' : 'cdp_connection_failed';
      for (const { platform } of targets) {
        if (!rows.has(platform)) rows.set(platform, result('unknown', reason));
      }
    } finally {
      // Disconnect from CDP while preserving the user's browser and existing tabs.
      await browser?.close().catch(() => {});
    }
  });
  await Promise.all([...apiChecks, ...cdpChecks]);
  return selected.map(platform => ({ platform, ...rows.get(platform) }));
}

async function main(args) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node status.mjs [all | <platform> ...]\nPlatforms: ' + platforms.join(', '));
    return;
  }
  const selected = !args.length || (args.length === 1 && args[0] === 'all') ? platforms : [...new Set(args)];
  if (selected.some(platform => !platforms.includes(platform))) {
    console.error('Unknown platform. Use --help for the supported names.');
    process.exitCode = 2;
    return;
  }
  const results = await checkStatus(selected);
  console.log(JSON.stringify({ results }, null, 2));
  if (results.some(row => row.status !== 'logged_in')) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
