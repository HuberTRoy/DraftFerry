---
name: draftferry-mastodon
description: Prepare a short source-article post and publish it through an authenticated Mastodon CDP session.
---

# DraftFerry for Mastodon

Follow the [DraftFerry workflow](../../SKILL.md). Set `DRAFTFERRY_MASTODON_ORIGIN` or use `--origin` for the account's instance. Pass the account handle to `--account`. With a public source URL, the default post uses the title and link. Use `--text` for final short copy or a local-only source.

```sh
node --env-file-if-exists=.env platforms/draftferry-mastodon/scripts/post.mjs \
  --input artifacts/article.md --account author@mastodon.example --preview
```

Omit the mode flag for local preparation. `--preview` fills and checks a temporary composer. Use `--publish` for requested public posting. Confirm the visibility in the composer and verify the text and author on the returned permalink.
