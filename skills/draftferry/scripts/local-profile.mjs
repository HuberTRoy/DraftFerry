import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { platforms } from './platforms.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));

export function loadLocalProfile(envFile, directory = root, inherited = process.env) {
  const profilePath = resolve(directory, '.draftferry.local.json');
  const profileExists = existsSync(profilePath);
  const profile = profileExists ? JSON.parse(readFileSync(profilePath, 'utf8')) : {};
  const selected = profile?.platforms ?? [];
  if (!Array.isArray(selected) || selected.some(name => !platforms.includes(name))) {
    throw new Error('The local profile contains an invalid platform list.');
  }
  const envName = envFile ?? profile?.envFile ??
    ['.env', '../../.env'].find(name => existsSync(resolve(directory, name)));
  const envPath = envName && resolve(directory, envName);
  const env = { ...(envPath ? parseEnv(readFileSync(envPath, 'utf8')) : {}), ...inherited };
  for (const [platform, field, key] of [
    ['mastodon', 'origin', 'DRAFTFERRY_MASTODON_ORIGIN'],
    ['substack', 'origin', 'DRAFTFERRY_SUBSTACK_ORIGIN'],
    ['blogger', 'blog', 'DRAFTFERRY_BLOGGER_BLOG_ID'],
  ]) {
    const value = profile?.targets?.[platform]?.[field];
    if (typeof value === 'string' && value.trim()) env[key] = value.trim();
  }
  return { env, envPath, profileExists, platforms: [...new Set(selected)], targets: profile?.targets ?? {} };
}
