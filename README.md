# DraftFerry

DraftFerry syncs a Markdown article to multiple publishing platforms. Platform skills, publishing scripts, configuration examples, and publication receipts live under `skills/draftferry`. See the [main skill](skills/draftferry/SKILL.md) and [platform guides](skills/draftferry/references/platforms.md).

Requires Node.js 22 or later. Use [DraftFerry Setup](skills/draftferry/draftferry-setup/SKILL.md) to configure any platform independently and verify access. For manual setup, copy `.env.example` to `.env` in `skills/draftferry` and fill only the values for your chosen platforms. Use `CDP_URL` for browser platforms and `DEV_TO_API_KEY` for DEV.to.

```sh
cd skills/draftferry
npm ci
node --env-file=.env scripts/status.mjs medium
node scripts/prepare.mjs --input artifacts/article.md
```

The status command checks access without creating drafts or publishing. Mastodon, Substack, and Blogger also need the target instance, publication domain, or blog ID, respectively. Check the active account and destination before publishing. See the [account preflight guide](skills/draftferry/references/preflight.md).

Use [DraftFerry Check](skills/draftferry/draftferry-check/SKILL.md) after setup to check only saved platforms and see which sessions need manual attention.

Tumblr, Blogger, beehiiv, Substack, and Hashnode accept Markdown articles. Medium supports Markdown drafts and publishing as well as importing a public source URL. DEV.to publishes Markdown through its API. X, Bluesky, and Mastodon share short posts. Substack publishes to the web only, and Hashnode requires write access to an existing publication. See the [source article format](skills/draftferry/references/source.md).
