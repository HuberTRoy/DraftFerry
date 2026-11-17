---
name: draftferry-medium
description: Prepare supplied Markdown, save a Medium draft, and publish a Medium story through an authenticated CDP session.
---

# DraftFerry for Medium

Use the [account preflight](../../references/preflight.md) to check the browser session. Run the [Markdown publisher](scripts/publish.mjs) with the intended Medium handle.

```sh
node --env-file-if-exists=.env platforms/draftferry-medium/scripts/publish.mjs \
  --input artifacts/article.md --account HANDLE --draft
```

Omit the mode flag for local preparation. `--draft` saves the article and checks the title, text, formatting, and link destinations after reloading. If the source supplies a canonical URL, the publisher saves and checks it in Story Settings. [Medium canonical settings](https://help.medium.com/hc/en-us/articles/360033930293-Set-a-canonical-link)

For requested publication, use `--publish`. Add `--draft-url` with the saved editor URL to publish a draft that still matches the same source. The publisher verifies the active account and turns off subscriber email in the publish review before clicking Publish. It checks the public story and keeps a receipt under `artifacts/medium/`.

For an article already available at a public URL, the [URL importer](scripts/import.mjs) accepts `--source-url` or the Markdown file's canonical URL. Check that the public page matches the Markdown before choosing that route. [Medium import documentation](https://help.medium.com/hc/en-us/articles/214550207-Importing-a-post-to-Medium)
