---
name: draftferry-setup
description: Initialize or update DraftFerry for a user. Choose publishing platforms, reuse local credentials, save account and publication defaults, and verify access before the first distribution run.
---

# DraftFerry Setup

Use the parent DraftFerry directory as the working directory. Install dependencies there with `npm ci` before running browser checks. Read the [setup configuration guide](references/configuration.md) for the supported settings.

Each platform is optional and can be set up independently. One platform is enough to get started. Leave unselected platforms out of the setup questions and checks. The user can add more platforms later.

1. Run `node draftferry-setup/scripts/setup.mjs` to inspect the local settings without printing credential values. Reuse the existing dotenv file and saved publishing targets.
2. Ask which platforms the user wants if they have not already selected them. For each selected platform, ask only for the missing account, destination, or credential setup details. If the user skips a platform, continue with the others. Confirm a target visible in the existing session with the user if it is ambiguous. Use the [platform routing guide](../references/platforms.md) for destination requirements.
3. For browser platforms, reuse the shared CDP session unless the user needs separate sessions. For DEV.to, use its API Key. When a credential is missing, direct the user to provide it through their local environment or private dotenv file. Keep credentials out of chat, the profile, and reports.
4. Save the chosen platforms, public target defaults, and optional dotenv file path in `.draftferry.local.json` in the DraftFerry directory. Keep earlier settings unless the user requests a change. Report which platforms and public targets were configured.
5. Run `node draftferry-setup/scripts/setup.mjs --check <platforms>` with the platforms selected for this setup. Review the login status and confirm the active account or publication with read-only inspection when status alone does not establish it. A missing setting or failed login on one platform does not block setup for the others.
6. If the user supplied a Markdown article during setup, prepare it locally using the [source guide](../references/source.md). Setup stops at local preparation and read-only access checks. A subsequent draft or publishing request uses the [main DraftFerry skill](../SKILL.md).

Use [DraftFerry Check](../draftferry-check/SKILL.md) for later checks of saved sessions.
