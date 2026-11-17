# Setup configuration

Run these commands from the DraftFerry directory.

```sh
node draftferry-setup/scripts/setup.mjs
node draftferry-setup/scripts/setup.mjs --check
node draftferry-setup/scripts/setup.mjs --check medium devto
```

Set up any subset of platforms, including a single platform. Configure credentials and destinations only for the platforms you choose. A browser endpoint is needed for selected browser platforms, and an API Key is needed if you select DEV.to.

The first command inventories available credentials and saved settings. The second checks the platforms saved in the profile. Pass platform names to check a subset. Use `all` for an explicit check of every platform.

The helper uses `--env-file` when supplied, then the profile's `envFile`, then the DraftFerry directory's `.env`. When no skill-local file exists, it also recognizes the project root's `.env` in this repository. Credentials already set in the process environment take precedence. The file stays where it is.

Save public setup preferences in the DraftFerry directory's ignored `.draftferry.local.json`. Include only the platforms and destination values chosen by the user.

```json
{
  "platforms": ["medium", "substack"],
  "envFile": "../../.env",
  "targets": {
    "medium": { "account": "medium-handle" },
    "substack": { "origin": "https://example.substack.com" }
  }
}
```

`envFile` is optional and can be relative to the DraftFerry directory. Account names, publication URLs, and IDs belong under `targets`. CDP endpoints and API Keys belong in the local environment or dotenv file.

| Platform | Target keys | Publisher options |
| --- | --- | --- |
| X | `account` | Use it to check the active X profile. |
| Bluesky | `account` | `--account` |
| Mastodon | `account`, `origin` | `--account`, `--origin` |
| DEV.to | `account` | `--account` |
| Medium | `account` | `--account` |
| Substack | `origin` | `--origin` |
| Tumblr | `blog` | `--blog` |
| Blogger | `blog`, `blogUrl` | `--blog` for the numeric blog ID, `--blog-url` for the public root |
| beehiiv | `blog`, `blogUrl` | `--blog` for the publication subdomain, `--blog-url` for the public root |
| Hashnode | `origin`, optional `dashboard` | `--origin`, `--dashboard` |

The setup check uses the saved Mastodon and Substack origins and Blogger blog ID when checking those targets. During distribution, pass saved target values to the publisher as defaults. A target named in a specific request takes precedence. An authenticated browser does not by itself confirm the selected account or write access.
