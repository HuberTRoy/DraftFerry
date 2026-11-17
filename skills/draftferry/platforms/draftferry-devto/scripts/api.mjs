const endpoint = 'https://dev.to/api';
const accept = 'application/vnd.forem.api-v1+json';

export function devToRequest(path, { apiKey, ...options } = {}) {
  const headers = { Accept: accept };
  if (apiKey) headers['api-key'] = apiKey;
  if (options.body) headers['Content-Type'] = 'application/json';
  return fetch(endpoint + path, {
    ...options, headers, redirect: 'error', signal: AbortSignal.timeout(15000),
  });
}

export async function devToStatus(env = process.env) {
  const apiKey = env.DEV_TO_API_KEY?.trim();
  if (!apiKey) return { status: 'not_configured', reason: 'missing_api_key' };
  try {
    const response = await devToRequest('/users/me', { apiKey });
    if (response.status === 401 || (response.status === 403 && response.headers.get('content-type')?.includes('json'))) {
      return { status: 'logged_out', reason: 'api_key_rejected' };
    }
    if (!response.ok) return { status: 'unknown', reason: 'platform_http_' + response.status };
    const { username } = await response.json();
    if (typeof username !== 'string' || !username.trim()) return { status: 'unknown', reason: 'api_account_missing' };
    return { status: 'logged_in', reason: 'api_key_verified', account: username };
  } catch {
    return { status: 'unknown', reason: 'api_check_failed' };
  }
}
