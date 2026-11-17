# DraftFerry

DraftFerry syncs a Markdown article to multiple publishing platforms. Platform skills, publishing scripts, configuration examples, and publication receipts live under `skills/draftferry`. See the [main skill](skills/draftferry/SKILL.md) and [platform guides](skills/draftferry/references/platforms.md).

Requires Node.js 22 or later. In `skills/draftferry`, copy `.env.example` to `.env` and set `CDP_URL` to your browser's CDP endpoint. Set platform-specific endpoints if you use separate browser sessions. Set `DEV_TO_API_KEY` for DEV.to.

```sh
cd skills/draftferry
npm ci
node --env-file=.env scripts/status.mjs all
node scripts/prepare.mjs --input artifacts/article.md
```

The status command checks access without creating drafts or publishing. Mastodon, Substack, and Blogger also need the target instance, publication domain, or blog ID, respectively. Check the active account and destination before publishing. See the [account preflight guide](skills/draftferry/references/preflight.md).

Tumblr, Blogger, beehiiv, Substack, and Hashnode accept Markdown articles. Medium supports Markdown drafts and publishing as well as importing a public source URL. DEV.to publishes Markdown through its API. X, Bluesky, and Mastodon share short posts. Substack publishes to the web only, and Hashnode requires write access to an existing publication. See the [source article format](skills/draftferry/references/source.md).
