# Source article

Use one UTF-8 Markdown file for the entire run. The title comes from `--title`, YAML front matter `title`, or a leading H1, in that order. A matching leading H1 supplies the title field and is removed from the body. The optional `canonical_url` gives the original public URL and provides a base for relative links in HTML. Use `--canonical-url` to provide it separately.

```md
---
title: Planning a community garden
canonical_url: https://example.org/articles/community-garden
---

## Choose a site

Look for soil, sunlight, and access to water. See the [garden checklist](/checklist).
```

Prepare the article locally from the DraftFerry Skill directory.

```sh
node scripts/prepare.mjs --input artifacts/article.md
node scripts/prepare.mjs --input artifacts/article.md --format html
node scripts/prepare.mjs --input artifacts/article.md --format markdown
```

The default JSON contains the title, Markdown body, optional canonical URL, and rendered HTML. Rich text conversion handles headings, lists, emphasis, links, quotes, code, and tables. Raw HTML in Markdown is escaped during HTML rendering. The automated rich text editors currently handle text and links. Articles with images or unsupported formatting need a manual editor check before publication. For short-post platforms use the supplied short copy, or prepare a short post linking to the public source.
