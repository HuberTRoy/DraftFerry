import { relative } from 'node:path';
import { parseArgs } from 'node:util';
import { checkStatus } from '../../scripts/status.mjs';
import { credentialSetting, platforms } from '../../scripts/platforms.mjs';
import { loadLocalProfile, root } from '../../scripts/local-profile.mjs';

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      check: { type: 'boolean' },
      'env-file': { type: 'string' },
      help: { type: 'boolean' },
    },
    allowPositionals: true,
  });
  if (values.help) {
    console.log('Usage: node draftferry-setup/scripts/setup.mjs [--env-file PATH] [--check [all | <platform> ...]]');
    return;
  }
  if (!values.check && positionals.length) throw new Error('Use --check to select platforms.');
  const { env, envPath, profileExists, platforms: defaults } = loadLocalProfile(values['env-file']);
  if (!values.check) {
    console.log(JSON.stringify({
      envFile: envPath ? relative(root, envPath) : null,
      profileExists,
      platforms: defaults,
      credentials: Object.fromEntries(platforms.map(platform => {
        const key = credentialSetting(platform, env);
        const source = !key ? 'missing' : key === 'DEV_TO_API_KEY' ? 'api_key' :
          key === 'CDP_URL' ? 'shared_cdp' : 'platform_cdp';
        return [platform, source];
      })),
    }, null, 2));
    return;
  }

  const requested = positionals.length ? positionals : defaults;
  const selected = requested.length === 1 && requested[0] === 'all' ? platforms : [...new Set(requested)];
  if (!selected.length || selected.some(platform => !platforms.includes(platform))) {
    throw new Error('Choose valid platforms or use --check all.');
  }
  const results = await checkStatus(selected, env);
  console.log(JSON.stringify({ results }, null, 2));
  if (results.some(row => row.status !== 'logged_in')) process.exitCode = 1;
}

main().catch(error => {
  console.error(error instanceof SyntaxError ? 'The local profile or dotenv file could not be parsed.' : error.message);
  process.exitCode = 2;
});
