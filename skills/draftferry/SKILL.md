---
name: draftferry
description: Sync a supplied Markdown article to selected publishing and social platforms. Check authenticated CDP sessions, prepare platform-ready content, or run the bundled publisher for a requested destination.
---

# DraftFerry

1. Use this Skill directory as the working directory. Install dependencies here with `npm ci`. Keep local configuration in `.env`, and content and run state under `artifacts/`. Use the bundled platform Skills and publishers.
2. Identify the requested platforms and mode: **status**, **prepare**, or **publish**. For status without a platform list, check all ten. For prepare or publish, resolve the supplied Markdown article, destination, and target account or publication. Read the [source article guide](references/source.md).
3. Run the read-only [preflight](references/preflight.md) for the selected platforms. DEV.to uses its API Key and the browser platforms use CDP. In status mode, report the results and stop. Prepare locally when possible. Create a saved draft on the platform when the user requests one.
4. For each target, load its [platform Skill](references/platforms.md). Confirm the account and destination using the credential or CDP profile selected for submission. If preflight cannot resolve the session, inspect it read-only or report what needs fixing.
5. Publication requires the user's request to publish. Treat the Markdown file as the source of truth. Preserve its wording, formatting and links as the destination supports them. Use the supplied canonical URL when appropriate. If a publisher cannot accept the supplied input or requested delivery mode, report the gap and prepare the content locally.
6. Retain the existing publishers' state and receipts under `artifacts/`. Reconcile an uncertain submission before another attempt. Report the verified URL when publication succeeds.

Each platform Skill describes its available publishing capabilities.
