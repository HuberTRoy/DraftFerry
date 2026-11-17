# Tumblr publishing

Run from the DraftFerry Skill directory with the target blog selected in the CDP session.

```sh
node --env-file-if-exists=.env platforms/draftferry-tumblr/publisher/scripts/tumblr-post.mjs \
  --input artifacts/article.md --blog my-publication --prepare-only
```

Use the actual Tumblr blog name in `--blog`. The script uses the platform CDP variable or the shared `CDP_URL` from `.env`. Use `--title` to supply a title when needed and `--canonical-url` to resolve relative Markdown links. The publisher validates its supported rich text before editing.

`--prepare-only` writes a local article artifact. `--dry-run` opens an editor preview with the supplied content and captures a screenshot. For requested publication, run without either flag. The script confirms the selected blog and checks title, body and links before submitting. Use the returned post ID to verify the content and public URL on the target blog.

Keep receipts in `artifacts/tumblr/`. For an uncertain submission, inspect the platform and existing receipt before retrying.
