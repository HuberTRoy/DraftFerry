# DraftFerry

[English](README.md) · [简体中文](README.zh-CN.md)

[![Markdown source](https://img.shields.io/badge/Markdown-Source-222222?logo=markdown)](#how-it-works)
[![Node.js 22 or later](https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs)](#install)
[![Browser publishing via CDP](https://img.shields.io/badge/Browser-CDP-4F46E5)](#configuration)
[![10 publishing platforms](https://img.shields.io/badge/Platforms-10-2563EB)](#supported-platforms)
[![Session checks](https://img.shields.io/badge/Sessions-Read--Only%20Checks-0F766E)](#commands)
[![GPL-3.0 license](https://img.shields.io/badge/License-GPL--3.0-2563EB)](LICENSE)

**Write once in Markdown. Publish to the platforms you choose.**

DraftFerry is a free, open-source publishing skill for writers, developers, and teams that share the same article across multiple channels. Give it a Markdown file and choose from ten destinations. Publish the full article to places like Medium, DEV.to, or Substack, and share a short post with the article link on X, Bluesky, or Mastodon.

DraftFerry checks your saved destinations for sign-in or manual verification, prepares the content for each platform, and lets you review a draft or preview where supported. When you ask it to publish, it checks the resulting public links so you can see where each post went live. Browser-based publishing uses your existing sessions through CDP, and DEV.to uses your API key.

[Setup skill](skills/draftferry/draftferry-setup/SKILL.md) · [Session check](skills/draftferry/draftferry-check/SKILL.md) · [Publishing skill](skills/draftferry/SKILL.md)

## Contents

- [How it works](#how-it-works)
- [Features](#features)
- [Supported platforms](#supported-platforms)
- [Install](#install)
- [Quick start](#quick-start)
- [Commands](#commands)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## How it works

1. **Read your source.** DraftFerry starts with the Markdown file you provide. It reads an explicit title, YAML front matter, or a leading H1. If the source includes `canonical_url`, it can carry that URL to platforms that support it.
2. **Check the selected destinations.** [DraftFerry Setup](skills/draftferry/draftferry-setup/SKILL.md) saves the platforms and public targets you choose. [DraftFerry Check](skills/draftferry/draftferry-check/SKILL.md) reuses those settings and reports which sessions are signed in and which need attention.
3. **Prepare the content.** DraftFerry sends Markdown directly where supported, converts it to rich text for browser editors, and uses short copy or a title and source link for social posts. Browser adapters connect to an existing CDP session through Playwright. DEV.to uses its API Key.
4. **Submit and verify.** You can prepare locally, save a draft or preview where supported, or ask DraftFerry to publish. A publishing run checks the resulting permalink before reporting verified success and keeps any publisher receipts under `artifacts/`.

Platform requests go from the configured browser or local scripts directly to the destination. DraftFerry runs without a project-hosted publishing service. See the [source article guide](skills/draftferry/references/source.md) for supported Markdown and formatting limits.

## Features

- **One source, ten destinations.** Reuse the same Markdown file across article publishers and social platforms. Configure any subset and add destinations later.
- **Drafts and previews.** Inspect the output before publishing. Depending on the platform, the publisher can save a draft, fill a preview editor, or prepare a local payload.
- **Read-only session checks.** Check saved accounts without publishing. The result tells you when a browser needs sign-in or manual verification, when CDP is unreachable, or when the DEV.to API Key is rejected.
- **Website-only delivery.** The Substack and beehiiv publishing workflows publish to the web without sending a newsletter email.
- **Public links and receipts.** Verify the result and keep a record of the submission so you can check an uncertain outcome before retrying.

## Supported platforms

| Platform                                                             | ID         | Connection | Available workflow                                        |
| -------------------------------------------------------------------- | ---------- | ---------- | --------------------------------------------------------- |
| [X](skills/draftferry/platforms/draftferry-x/SKILL.md)               | `x`        | CDP        | Short post                                                |
| [Bluesky](skills/draftferry/platforms/draftferry-bluesky/SKILL.md)   | `bluesky`  | CDP        | Short post preview and publication                        |
| [Mastodon](skills/draftferry/platforms/draftferry-mastodon/SKILL.md) | `mastodon` | CDP        | Short post preview and publication on a selected instance |
| [DEV.to](skills/draftferry/platforms/draftferry-devto/SKILL.md)      | `devto`    | API Key    | Markdown publication                                      |
| [Medium](skills/draftferry/platforms/draftferry-medium/SKILL.md)     | `medium`   | CDP        | Markdown draft and publication, plus public URL import    |
| [Substack](skills/draftferry/platforms/draftferry-substack/SKILL.md) | `substack` | CDP        | Markdown draft and web-only publication                   |
| [Tumblr](skills/draftferry/platforms/draftferry-tumblr/SKILL.md)     | `tumblr`   | CDP        | Rich-text editor preview and publication                  |
| [Blogger](skills/draftferry/platforms/draftferry-blogger/SKILL.md)   | `blogger`  | CDP        | Rich-text draft and publication                           |
| [beehiiv](skills/draftferry/platforms/draftferry-beehiiv/SKILL.md)   | `beehiiv`  | CDP        | Rich-text draft and web-only publication                  |
| [Hashnode](skills/draftferry/platforms/draftferry-hashnode/SKILL.md) | `hashnode` | CDP        | Markdown draft and publication to an existing publication |

## Install

You need Node.js 22 or newer and npm. For browser platforms, use an existing browser session that exposes a Chrome DevTools Protocol (CDP) endpoint. DEV.to uses its API Key.

### One-line install

Install DraftFerry into the Codex skills directory:

```sh
curl -fsSL https://raw.githubusercontent.com/HuberTRoy/DraftFerry/main/install.sh | bash
```

Use `--platform claude`, `--platform hermes`, or `--platform openclaw` to select another host. Use `--dest` for a custom skill directory.

```sh
curl -fsSL https://raw.githubusercontent.com/HuberTRoy/DraftFerry/main/install.sh | bash -s -- --platform hermes
```

The installer downloads the complete skill bundle and runs `npm ci`. Playwright uses your existing CDP browser. Use `--force` to update an installed DraftFerry skill while keeping its local environment, platform profile, and publication receipts. Use `--skip-npm-install` to copy the files and install dependencies later.

### Install from a checkout

Run `bash install.sh` from the repository root to install from the local copy. To work directly in the checkout, install the shared dependencies:

```sh
cd skills/draftferry
npm ci
```

Use the [main skill](skills/draftferry/SKILL.md) from your agent with the repository open. For a manual installation, copy the entire `skills/draftferry` folder and include the root [LICENSE](LICENSE).

## Quick start

1. Ask [DraftFerry Setup](skills/draftferry/draftferry-setup/SKILL.md) to configure the platforms you want. Start with one platform or add more later. Setup reuses existing credentials and asks for the missing settings for your selection.
2. Run [DraftFerry Check](skills/draftferry/draftferry-check/SKILL.md). It checks your saved platforms and tells you which sessions need sign-in, manual verification, or a configuration fix.
3. Give [DraftFerry](skills/draftferry/SKILL.md) a Markdown file and the destinations. Ask it to prepare content locally, save a platform draft where supported, or publish and verify the public links.

```text
Use $draftferry-setup to configure Medium and Bluesky with my existing browser session.
Use $draftferry-check to check my saved platforms and tell me which sessions need attention.
Use $draftferry to prepare article.md for Medium and Bluesky.
Use $draftferry to publish article.md to Medium and Bluesky and verify the public links.
```

<!-- Setup and session check screenshot placeholder -->

## Commands

Run from `skills/draftferry`.

| Command                                                    | Purpose                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------- |
| `node draftferry-setup/scripts/setup.mjs`                  | Inspect saved settings and see which credentials are present. |
| `node draftferry-check/scripts/check.mjs`                  | Check login and access for the saved platforms.               |
| `node draftferry-check/scripts/check.mjs hashnode`         | Recheck a single saved platform.                              |
| `node --env-file-if-exists=.env scripts/status.mjs medium` | Check an explicit platform using a local environment file.    |
| `node scripts/prepare.mjs --input artifacts/article.md`    | Parse the article and render HTML locally.                    |
| `npm test`                                                 | Run the automated tests.                                      |

## Configuration

[DraftFerry Setup](skills/draftferry/draftferry-setup/SKILL.md) saves your chosen platforms and public account or publication defaults in `.draftferry.local.json`. Each platform is optional. A shared CDP session can serve several destinations, and platform-specific overrides let you use separate browser sessions.

For direct CLI use, create a local `.env` from [the template](skills/draftferry/.env.example) and fill the fields for your selected destinations:

```sh
test -e .env || cp .env.example .env
```

| Setting                                                                                  | When to use it                                                                               |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `CDP_URL`                                                                                | Shared browser connection.                                                                   |
| `DRAFTFERRY_<PLATFORM>_CDP_URL`                                                          | A separate CDP session for a platform, such as `DRAFTFERRY_MEDIUM_CDP_URL`.                  |
| `DEV_TO_API_KEY`                                                                         | Check or publish to DEV.to.                                                                  |
| `DRAFTFERRY_MASTODON_ORIGIN`, `DRAFTFERRY_SUBSTACK_ORIGIN`, `DRAFTFERRY_BLOGGER_BLOG_ID` | Select the Mastodon instance, Substack publication, or Blogger blog used by the login check. |

Keep credentials in the local environment and use the [setup configuration guide](skills/draftferry/draftferry-setup/references/configuration.md) for platform-specific destination fields.

<!-- Publishing and verification screenshot placeholder -->

## Troubleshooting

| Result                                       | What to do                                                                                                                    |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| A platform needs sign-in or verification     | Complete it in the configured browser session and rerun the check for that platform.                                          |
| A platform is missing from the session check | Add it through [DraftFerry Setup](skills/draftferry/draftferry-setup/SKILL.md). The checker runs against the saved selection. |
| The checker cannot connect over CDP          | Check that the intended browser is running and that the configured endpoint is reachable.                                     |
| A submission has an uncertain outcome        | Check the platform and the existing receipt before submitting again.                                                          |

## License

DraftFerry is free to use and distributed under the [GNU General Public License v3.0](LICENSE). The SPDX identifier is `GPL-3.0-only`.
