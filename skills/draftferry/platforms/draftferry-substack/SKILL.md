---
name: draftferry-substack
description: Prepare a Markdown article, create a Substack draft, or publish it to the web through CDP.
---

# DraftFerry for Substack

Follow the [DraftFerry workflow](../../SKILL.md). Set `DRAFTFERRY_SUBSTACK_ORIGIN` or use `--origin` for the publication dashboard's HTTPS origin.

```sh
node --env-file-if-exists=.env platforms/draftferry-substack/scripts/publish.mjs \
  --input artifacts/article.md --draft
```

Omit the mode flag for local preparation. `--draft` saves a new article and checks it after reload. Use `--publish` for requested web publication. The script confirms subscriber delivery is off before submitting and keeps a receipt with the result. Verify the public permalink. [Substack web publication instructions](https://support.substack.com/hc/en-us/articles/360037831771-How-do-I-publish-a-new-post-on-Substack)
