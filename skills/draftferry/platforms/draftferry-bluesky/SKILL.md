---
name: draftferry-bluesky
description: Prepare a short source-article post and publish it through an authenticated Bluesky CDP session.
---

# DraftFerry for Bluesky

Follow the [DraftFerry workflow](../../SKILL.md). Pass the complete Bluesky handle to `--account`. With a Markdown source that has a canonical URL, the default text is the title and source link. Use `--text` for final short copy or when the source is local.

```sh
node --env-file-if-exists=.env platforms/draftferry-bluesky/scripts/post.mjs \
  --input artifacts/article.md --account example.bsky.social --preview
```

Omit the mode flag to prepare text locally. `--preview` fills and checks a temporary composer. Use `--publish` in its place for requested publication. Verify the exact post on the returned permalink. Keep the receipt before attempting an uncertain submission again.
