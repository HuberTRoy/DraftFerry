# beehiiv publishing

Run from the DraftFerry Skill directory with the target blog selected in the CDP session.

```sh
node --env-file-if-exists=.env platforms/draftferry-beehiiv/publisher/scripts/beehiiv-post.mjs \
  --input artifacts/article.md --blog my-publication --prepare-only
```

Use the actual publication subdomain in `--blog`. The script uses the platform CDP variable or the shared `CDP_URL` from `.env`. Use `--title` to supply a title when needed and `--canonical-url` to resolve relative Markdown links. The publisher validates its supported rich text before editing.

Use `--blog-url` for a custom publication domain. The script checks the destination in Web settings and verifies public body and links. Its publication mode is immediate and web only. The last Publish now button submits the post.

`--prepare-only` writes a local article artifact. `--dry-run` creates a saved beehiiv draft. For requested web publication, run without either flag and verify the permalink in the receipt.

Keep receipts in `artifacts/beehiiv/`. For an uncertain submission, inspect the platform and existing receipt before retrying.
