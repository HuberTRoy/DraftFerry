# DraftFerry

[English](README.md) · [简体中文](README.zh-CN.md)

[![Markdown 源文件](https://img.shields.io/badge/Markdown-Source-222222?logo=markdown)](#工作原理)
[![Node.js 22 或更新版本](https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs)](#安装)
[![通过 CDP 发布](https://img.shields.io/badge/Browser-CDP-4F46E5)](#配置)
[![支持 10 个发布平台](https://img.shields.io/badge/Platforms-10-2563EB)](#支持的平台)
[![只读会话检查](https://img.shields.io/badge/Sessions-Read--Only%20Checks-0F766E)](#命令)
[![GPL-3.0 许可证](https://img.shields.io/badge/License-GPL--3.0-2563EB)](LICENSE)

**写一份 Markdown，按需分发到多个平台。**

DraftFerry 是一款开源免费的多平台发布 Skill，适合在多个渠道分享同一篇文章的创作者、开发者和团队。提供一份 Markdown 文件，就可以从十个平台里挑选发布目标。你可以把全文发到 Medium、DEV.to 或 Substack，也可以把文章链接配上短帖，分享到 X、Bluesky 或 Mastodon。

DraftFerry 会检查已配置的平台是否需要登录或人工验证，并按各平台的编辑器准备内容。在支持的平台上，你可以先查看草稿或预览。你发出发布指令后，它会核验公开链接，方便你查看各平台的发布结果。浏览器平台通过 CDP 复用现有登录会话，DEV.to 使用你的 API Key。

[初始化 Skill](skills/draftferry/draftferry-setup/SKILL.md) · [会话检查](skills/draftferry/draftferry-check/SKILL.md) · [发布 Skill](skills/draftferry/SKILL.md)

## 目录

- [工作原理](#工作原理)
- [功能特性](#功能特性)
- [支持的平台](#支持的平台)
- [安装](#安装)
- [快速开始](#快速开始)
- [命令](#命令)
- [配置](#配置)
- [故障排查](#故障排查)
- [许可证](#许可证)

## 工作原理

1. **读取源文件。** DraftFerry 从你提供的 Markdown 开始。它可以从指定参数、YAML front matter 或正文开头的一级标题读取文章标题。如果源文件包含 `canonical_url`，支持的平台会使用该原文链接。
2. **检查发布目标。** [DraftFerry Setup](skills/draftferry/draftferry-setup/SKILL.md) 保存你选择的平台和公开发布目标。[DraftFerry Check](skills/draftferry/draftferry-check/SKILL.md) 复用这些设置，报告哪些会话已登录、哪些需要处理。
3. **按平台准备内容。** 支持 Markdown 的平台使用原文，浏览器富文本编辑器接收转换后的内容，短帖平台使用你提供的文案或文章标题与源链接。浏览器发布通过 Playwright 连接已有的 CDP 会话，DEV.to 使用 API Key。
4. **提交并核验结果。** 你可以只在本地准备，或在支持的平台保存草稿、预览和发布。公开发布后，DraftFerry 核验文章链接再报告成功，并将发布脚本生成的回执保存在 `artifacts/`。

请求由你配置的浏览器或本地脚本直接发往目标平台，无需通过 DraftFerry 的托管发布服务。支持的 Markdown 写法和排版边界见[源文章格式](skills/draftferry/references/source.md)。

## 功能特性

- **一份原文，十个平台。** 同一份 Markdown 可以用于文章平台和社交平台。可以先配置一个目的地，以后逐个添加。
- **草稿和预览。** 根据平台能力保存草稿、填入预览编辑器或在本地生成待发布内容。
- **只读会话检查。** 查看已保存的平台是否需要重新登录或人工验证，也能区分 CDP 连接异常和 DEV.to API Key 被拒绝。
- **仅网页发布。** Substack 和 beehiiv 的发布流程会公开网页文章，不发送订阅邮件。
- **公开链接和发布回执。** 核验发布结果，并保留提交记录。遇到结果不明时，可以先检查平台和已有记录再重试。

## 支持的平台

| 平台                                                                 | 平台 ID    | 连接方式 | 支持的流程                                       |
| -------------------------------------------------------------------- | ---------- | -------- | ------------------------------------------------ |
| [X](skills/draftferry/platforms/draftferry-x/SKILL.md)               | `x`        | CDP      | 发布短帖                                         |
| [Bluesky](skills/draftferry/platforms/draftferry-bluesky/SKILL.md)   | `bluesky`  | CDP      | 预览和发布短帖                                   |
| [Mastodon](skills/draftferry/platforms/draftferry-mastodon/SKILL.md) | `mastodon` | CDP      | 在选定实例预览和发布短帖                         |
| [DEV.to](skills/draftferry/platforms/draftferry-devto/SKILL.md)      | `devto`    | API Key  | 发布 Markdown 文章                               |
| [Medium](skills/draftferry/platforms/draftferry-medium/SKILL.md)     | `medium`   | CDP      | 从 Markdown 保存草稿并发布，也支持导入公开源链接 |
| [Substack](skills/draftferry/platforms/draftferry-substack/SKILL.md) | `substack` | CDP      | 从 Markdown 保存草稿或仅发布到网页               |
| [Tumblr](skills/draftferry/platforms/draftferry-tumblr/SKILL.md)     | `tumblr`   | CDP      | 在编辑器预览富文本并发布                         |
| [Blogger](skills/draftferry/platforms/draftferry-blogger/SKILL.md)   | `blogger`  | CDP      | 保存富文本草稿并发布                             |
| [beehiiv](skills/draftferry/platforms/draftferry-beehiiv/SKILL.md)   | `beehiiv`  | CDP      | 保存富文本草稿或仅发布到网页                     |
| [Hashnode](skills/draftferry/platforms/draftferry-hashnode/SKILL.md) | `hashnode` | CDP      | 在已有刊物中从 Markdown 保存草稿并发布           |

## 安装

需要 Node.js 22 或更新版本和 npm。通过浏览器发布的平台需要一个已登录、能通过 Chrome DevTools Protocol（CDP）连接的浏览器会话。DEV.to 使用 API Key。

### 一键安装

默认将 DraftFerry 安装到 Codex 的 Skill 目录。

```sh
curl -fsSL https://raw.githubusercontent.com/HuberTRoy/DraftFerry/main/install.sh | bash
```

用 `--platform claude`、`--platform hermes` 或 `--platform openclaw` 安装到对应的宿主。用 `--dest` 指定自定义 Skill 目录。

```sh
curl -fsSL https://raw.githubusercontent.com/HuberTRoy/DraftFerry/main/install.sh | bash -s -- --platform hermes
```

安装脚本会下载完整的 Skill 并运行 `npm ci`。Playwright 会复用已有的 CDP 浏览器。用 `--force` 升级时会保留本地环境文件、平台配置和发布回执。用 `--skip-npm-install` 可以先复制文件，之后再安装依赖。

### 从本地仓库安装

在仓库根目录运行 `bash install.sh` 即可从本地副本安装。如果想直接在仓库里使用，运行：

```sh
cd skills/draftferry
npm ci
```

在 Agent 中打开仓库并使用[主 Skill](skills/draftferry/SKILL.md)。如果手动安装，请复制整个 `skills/draftferry` 文件夹，并附上仓库根目录的 [LICENSE](LICENSE)。

## 快速开始

1. 用 [DraftFerry Setup](skills/draftferry/draftferry-setup/SKILL.md) 配置你想使用的平台。可以只选一个，以后再逐个添加。初始化会复用已有凭据，只询问所选平台还缺的设置。
2. 用 [DraftFerry Check](skills/draftferry/draftferry-check/SKILL.md) 检查已保存的平台，查看哪些会话需要重新登录、完成人工验证或修正配置。
3. 把 Markdown 文件和目的地交给 [DraftFerry](skills/draftferry/SKILL.md)。你可以要求只在本地准备内容、在支持的平台保存草稿，或公开发布并核验链接。

```text
用 $draftferry-setup 复用我已有的浏览器会话，配置 Medium 和 Bluesky。
用 $draftferry-check 检查我保存的平台，告诉我哪些会话需要处理。
用 $draftferry 把 article.md 准备成适合 Medium 和 Bluesky 的内容。
用 $draftferry 把 article.md 发布到 Medium 和 Bluesky，并核验公开链接。
```

<!-- 初始化与会话检查截图占位 -->

## 命令

从 `skills/draftferry` 目录运行。

| 命令                                                       | 用途                             |
| ---------------------------------------------------------- | -------------------------------- |
| `node draftferry-setup/scripts/setup.mjs`                  | 查看已保存的设置和凭据配置状态。 |
| `node draftferry-check/scripts/check.mjs`                  | 检查已保存平台的登录和访问状态。 |
| `node draftferry-check/scripts/check.mjs hashnode`         | 只复查已保存的 Hashnode 会话。   |
| `node --env-file-if-exists=.env scripts/status.mjs medium` | 使用本地环境文件检查指定平台。   |
| `node scripts/prepare.mjs --input artifacts/article.md`    | 在本地解析文章并转换成 HTML。    |
| `npm test`                                                 | 运行自动化测试。                 |

## 配置

[DraftFerry Setup](skills/draftferry/draftferry-setup/SKILL.md) 会把你选定的平台以及公开账号或刊物的默认值保存到 `.draftferry.local.json`。所有平台都可独立选择。多个平台可以共用一个 CDP 会话，也可以分别指定各自的浏览器会话。

如果直接使用 CLI，可以从[配置模板](skills/draftferry/.env.example)创建本地 `.env`，只填写所选平台需要的字段。

```sh
test -e .env || cp .env.example .env
```

| 设置                                                                                     | 用途                                                              |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `CDP_URL`                                                                                | 共用的浏览器连接地址。                                            |
| `DRAFTFERRY_<PLATFORM>_CDP_URL`                                                          | 给单个平台配置独立的 CDP 会话，例如 `DRAFTFERRY_MEDIUM_CDP_URL`。 |
| `DEV_TO_API_KEY`                                                                         | 检查 DEV.to 账号或发布文章。                                      |
| `DRAFTFERRY_MASTODON_ORIGIN`、`DRAFTFERRY_SUBSTACK_ORIGIN`、`DRAFTFERRY_BLOGGER_BLOG_ID` | 指定登录检查所用的 Mastodon 实例、Substack 刊物或 Blogger 博客。  |

凭据保存在本地环境中。各平台的发布目标字段见[初始化配置说明](skills/draftferry/draftferry-setup/references/configuration.md)。

<!-- 发布与核验截图占位 -->

## 故障排查

| 检查结果                 | 处理方式                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| 某个平台需要登录或验证   | 在为该平台配置的浏览器会话里完成操作，然后只复查该平台。                                  |
| 会话检查没有列出某个平台 | 用 [DraftFerry Setup](skills/draftferry/draftferry-setup/SKILL.md) 把它加入已保存的清单。 |
| 无法连接 CDP             | 确认目标浏览器正在运行，且配置的 CDP 地址可以访问。                                       |
| 提交结果不明确           | 先查看平台和已有发布回执，再决定是否重试。                                                |

## 许可证

DraftFerry 免费使用，采用 [GNU 通用公共许可证 v3.0](LICENSE)。SPDX 标识为 `GPL-3.0-only`。
