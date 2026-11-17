# Blogger publishing

Run from the DraftFerry Skill directory with the target blog selected in the CDP session.

```sh
node --env-file-if-exists=.env platforms/draftferry-blogger/publisher/scripts/blogger-post.mjs \
  --input artifacts/article.md --blog 123456789 --prepare-only
```

Use the actual numeric blog ID from the Blogger preflight in `--blog`. The script uses the platform CDP variable or the shared `CDP_URL` from `.env`. Use `--title` to supply a title when needed and `--canonical-url` to resolve relative Markdown links. The publisher validates its supported rich text before editing.

Pass `--blog-url` to verify the public blog origin. Blogger uses the Compose iframe. The publisher checks content and formatting after auto-save, and verifies them again on the public post after confirmation. The editor may mask a link in `href`; recover the destination from `data-original-attrs` when checking the draft.

`--prepare-only` writes a local article artifact. `--dry-run` creates a saved Blogger draft. For requested publication, run without either flag and verify the permalink in the receipt.

Keep receipts in `artifacts/blogger/`. For an uncertain submission, inspect the platform and existing receipt before retrying.
