---
name: draftferry-hashnode
description: Prepare a Markdown article and open a draft or publish it to a configured Hashnode publication through CDP.
---

# DraftFerry for Hashnode

Follow the [DraftFerry workflow](../../SKILL.md). The browser account needs an existing publication with write access. Set `DRAFTFERRY_HASHNODE_ORIGIN` to its public HTTPS origin. If the account lists several publications, use `--dashboard` with the intended publication's Hashnode dashboard URL.

```sh
node --env-file-if-exists=.env platforms/draftferry-hashnode/scripts/publish.mjs \
  --input artifacts/article.md --draft
```

Omit the mode flag for local preparation. The draft path checks that the article survives reload. Use `--publish` for requested publication. To publish a saved draft from the same source file, also pass its Hashnode editor URL with `--draft-url`. The publisher checks the destination in Draft settings and opens the resulting article anonymously.
