---
name: draftferry-check
description: Check login and access for publishing platforms already configured in DraftFerry and identify the accounts that need manual attention.
---

# DraftFerry Check

Use this skill for requests to check whether saved DraftFerry sessions are still logged in, which accounts need manual verification, or whether previously configured platforms are ready for a distribution run.

Run from the parent DraftFerry directory:

```sh
node draftferry-check/scripts/check.mjs
node draftferry-check/scripts/check.mjs medium blogger
```

The first command checks platforms saved in `.draftferry.local.json`. Positional names restrict the run to a subset of that profile. If no platforms were saved, use [DraftFerry Setup](../draftferry-setup/SKILL.md) to choose them. A shared CDP endpoint does not select a platform.

Report the platforms with authenticated sessions and surface each action item with the platform and connection setting name. Tell the user to log in or complete a challenge in that browser session, then rerun just that platform. Report connection issues and missing configuration separately from a confirmed logout. The DEV.to check uses the saved API Key and can distinguish a rejected key from a browser issue.

The command returns JSON with an `action` for each platform. Exit code 0 means no action was found, 1 means at least one result needs attention, and 2 means there is no saved selection or the command could not be configured.

This check reads account state. It leaves manual login and verification to the user. Keep credential values out of the output. A logged-in browser session does not establish publishing permission or prove the intended account for every platform.
