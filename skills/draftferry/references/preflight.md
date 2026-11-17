# Account preflight

Use [DraftFerry Check](../draftferry-check/SKILL.md) to monitor only the platforms saved during setup. Use the commands below for an explicit platform list or an all-platform preflight.

Run these commands from the DraftFerry Skill directory with Node.js 22+.

```sh
npm ci
node --env-file-if-exists=.env scripts/status.mjs all
node --env-file-if-exists=.env scripts/status.mjs devto medium
```

Set endpoints via the process environment or a local `.env` using [the example](../.env.example). Resolve `DRAFTFERRY_<PLATFORM>_CDP_URL` first, then `X_CDP_URL` for X, then the shared `CDP_URL`. Pass the chosen endpoint unchanged as the platform publisher expects and keep credentials out of logs. Mastodon and Substack need the actual instance or publication origin. Blogger needs the numeric blog ID.

For browser platforms, the script uses temporary tabs in the first CDP context and reads the authenticated UI. DEV.to calls its read-only account endpoint with `DEV_TO_API_KEY` and reports the account handle.

| Status | Meaning |
| --- | --- |
| `logged_in` | Authenticated UI markers or a verified DEV.to API account. Confirm the target account and write permission before submission. |
| `logged_out` | The platform showed an explicit sign-in signal. Sign in manually in the same browser profile and check again. |
| `unknown` | No clear signal, CDP error, site issue, or challenge. Inspect before proceeding. |
| `not_configured` | Missing API Key, endpoint, or valid target settings. |

Output is JSON. Exit code 0 means all requested probes returned `logged_in`; 1 means inspect the per-platform results, including any successful ones; 2 means invalid arguments. UI markers are intentionally conservative and should be calibrated against the actual profiles before relying on them for unattended runs. A missing marker, a public page, or a redirect to an unknown origin never counts as authenticated.
