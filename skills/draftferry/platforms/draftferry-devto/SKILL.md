---
name: draftferry-devto
description: Verify the configured DEV.to API Key and publish supplied Markdown through the DEV API.
---

# DraftFerry for DEV.to

DEV.to uses `DEV_TO_API_KEY` for account checks and submission. Run its [read-only account preflight](../../references/preflight.md) and check the returned account handle.

```sh
node --env-file-if-exists=.env scripts/status.mjs devto
node --env-file-if-exists=.env platforms/draftferry-devto/scripts/publish.mjs --input artifacts/article.md
```

The second command prints the local payload. For requested publication, add `--publish --account USERNAME`. The publisher checks which account the Key belongs to and preserves the Markdown body, optional canonical URL, and supplied `--tag` values. It checks the public API record after submission and saves a receipt under `artifacts/devto/`. Reconcile an uncertain receipt before submitting again. [DEV API documentation](https://developers.forem.com/api/v1)
