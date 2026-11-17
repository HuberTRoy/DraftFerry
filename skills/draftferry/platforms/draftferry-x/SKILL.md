---
name: draftferry-x
description: Share a short post based on a Markdown source article through an authenticated X CDP session.
---

# DraftFerry for X

Use the [DraftFerry workflow](../../SKILL.md) to check the session and confirm the active account. For a long article, prepare a short post with the supplied source URL if available. For supplied short copy, use the exact text. Use [the local article parser](../../references/source.md) to read the source title and canonical URL.

When the user requests publication, pass the final copy as `X_POST_TEXT` to [the X publisher](scripts/post.cjs) and run it with `node --env-file-if-exists=.env` from the Skill directory. The publisher uses a new tab in the selected CDP session. Verify author and text on the resulting status permalink before reporting publication.
