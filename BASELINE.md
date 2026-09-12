# 黄金空白母版基线

- 来源生产基线：`bfab75563f01cd03873dfafc378fd3fe5231aecb`
- 选择性公共修复：`7df035f` 经与 `bfab755` 合并解析后的相册批量管理差异；`70e8c40` 的 Astro 浏览器脚本检查维护
- 本仓库历史：独立初始化，不继承旧仓库提交历史
- 产品范围：59 元基础版

## 内容保证

`src/content` 仅保留空目录标记，`public/uploads` 仅保留三个通用 SVG 占位图。不存在原站、demo、TT、TT-2 或客户内容。Cloudflare KV 是客户内容的唯一持久化来源。

## 身份保证

同一个本地实例配置同时定义 Pages 项目、Functions `CUSTOMER_ID`、`PAGES_PROJECT_NAME` 和 `DREAM_MEMORY_STORE`。构建脚本从该配置派生前端 ID 和固定网址；运行时校验 Pages hostname，远端验收再次比较前端、Functions 和下载后的 Pages 配置。

## 发布门槛

必须通过：Node 单元测试、Astro check、blank 构建、黄金源码审计、构建产物审计、开站脚本 plan 模式。下一阶段才能创建独立 GitHub 仓库和全新测试实例。
