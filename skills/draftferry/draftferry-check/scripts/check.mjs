import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { checkStatus } from '../../scripts/status.mjs';
import { credentialSetting } from '../../scripts/platforms.mjs';
import { loadLocalProfile } from '../../scripts/local-profile.mjs';

const actions = {
  verification_required: 'complete_browser_verification',
  api_key_rejected: 'replace_api_key',
  cdp_connection_failed: 'check_browser_connection',
  no_browser_context: 'check_browser_connection',
  playwright_not_installed: 'install_dependencies',
  missing_api_key: 'configure_api_key',
  missing_cdp_endpoint: 'configure_cdp',
  missing_platform_target: 'configure_platform_target',
  invalid_platform_target: 'configure_platform_target',
};

export function checkSummary(row, env, targets) {
  const expected = targets?.[row.platform]?.account;
  const mismatch = row.status === 'logged_in' && typeof row.account === 'string' && typeof expected === 'string' &&
    row.account.toLowerCase() !== expected.trim().replace(/^@/, '').toLowerCase();
  let action = actions[row.reason];
  if (mismatch) action = 'check_account';
  if (!action) {
    if (row.status === 'logged_in') action = 'none';
    else if (row.status === 'logged_out') action = 'sign_in';
    else if (/^platform_http_(?:429|5\d\d)$/.test(row.reason)) action = 'retry_later';
    else action = 'inspect_session';
  }
  return {
    ...row,
    ...(mismatch ? { status: 'unknown', reason: 'configured_account_mismatch' } : {}),
    connectionSetting: credentialSetting(row.platform, env),
    action,
  };
}

async function main() {
  const { values, positionals } = parseArgs({
    options: { help: { type: 'boolean' }, 'env-file': { type: 'string' } },
    allowPositionals: true,
  });
  if (values.help) {
    console.log('Usage: node draftferry-check/scripts/check.mjs [--env-file PATH] [<configured-platform> ...]');
    return;
  }
  const profile = loadLocalProfile(values['env-file']);
  if (!profile.platforms.length) throw new Error('No saved platforms. Run DraftFerry Setup first.');
  const selected = positionals.length ? [...new Set(positionals)] : profile.platforms;
  if (selected.some(platform => !profile.platforms.includes(platform))) {
    throw new Error('Select only platforms saved in the local DraftFerry profile.');
  }
  const results = (await checkStatus(selected, profile.env))
    .map(row => checkSummary(row, profile.env, profile.targets));
  console.log(JSON.stringify({ results }, null, 2));
  if (results.some(row => row.action !== 'none')) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch(error => {
    console.error(error instanceof SyntaxError ? 'The local profile or dotenv file could not be parsed.' : error.message);
    process.exitCode = 2;
  });
}
