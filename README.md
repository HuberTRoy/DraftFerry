# DraftFerry

从用户提供的 Markdown 源文章向多个平台同步内容。子 Skill、已接入的发布器、运行配置和发布回执都放在 DraftFerry Skill 目录内。[主 Skill](skills/draftferry/SKILL.md) · [分发路由表](skills/draftferry/references/platforms.md)

需要 Node.js 22+。进入 `skills/draftferry`，复制 `.env.example` 到 `.env`，在 `CDP_URL` 填入已有的 CDP 连接地址。多个浏览器会话可以按平台配置。

```sh
cd skills/draftferry
npm ci
node --env-file=.env scripts/status.mjs all
node scripts/prepare.mjs --input artifacts/article.md
```

状态检查只查看现有会话，不会创建草稿或发布。Mastodon、Substack 和 Blogger 额外需要配置目标实例、刊物域名或博客 ID。已经登录和目标账号正确是两件事，发布前还会核对账号与目的地。

Tumblr、Blogger 和 beehiiv 可以直接读取 Markdown。DEV.to 使用 API Key 查验账号并发布原文。Medium 支持从 Markdown 保存草稿和发布，也保留公开原文链接导入。X 分发短帖。Bluesky 和 Mastodon 支持短帖预览及发布。Substack 支持草稿和仅网页发布。Hashnode 适配器需要账号已有发布权限的刊物。[源文章格式](skills/draftferry/references/source.md)
