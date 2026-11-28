# 黄金空白母版基线

- 来源生产基线：`bfab75563f01cd03873dfafc378fd3fe5231aecb`
- 选择性公共修复：`7df035f` 经与 `bfab755` 合并解析后的相册批量管理差异；`70e8c40` 的 Astro 浏览器脚本检查维护
- 本仓库历史：独立初始化，不继承旧仓库提交历史
- 产品范围：59 元基础版

## 内容保证

`src/content` 仅保留空目录标记，`public/uploads` 仅保留三个通用 SVG 占位图。不存在原站、demo、TT、TT-2 或客户内容。Cloudflare KV 是客户内容的唯一持久化来源。

## 身份保证

同一个本地实例配置同时定义 Pages 项目、Functions `CUSTOMER_ID`、`PAGES_PROJECT_NAME` 和 `DREAM_MEMORY_STORE`。构建脚本从该配置派生前端 ID 和固定网址；运行时校验 Pages hostname，远端验收再次比较前端、Functions 和下载后的 Pages 配置。

正式交付前必须确认前端 `CUSTOMER_ID`、Functions `CUSTOMER_ID`、Pages 项目名、固定 hostname、KV namespace/binding 和远程生产部署配置完全对应。Astro 负责静态页面，`/functions/api/*` 由 Cloudflare Pages Functions 提供；必须使用完整 Wrangler 客户建站流程，不能只部署 `dist` 静态目录。

## 首次渲染保证

前台、后台登录页和后台页面在客户 KV 数据与主题完成初始化前只显示中性加载状态，不得短暂绘制默认暖金色空白站。该保证覆盖冷启动、刷新及前后台往返；请求超时或失败时必须显示明确错误和重试入口，不能永久隐藏页面。

## 空白与验收数据保证

blank 客户站不得携带验收文字、测试图片或任何其他客户数据。自动验收数据只能写入独立测试站的 KV，不得进入模板源码、新客户默认数据或待售库存站。新 Agent 必须从指定的正式候选标签或正式标签 fresh clone 建站，禁止从旧目录、TT、TT-2、Demo、原站或客户实例复制。

私密交付使用 [README 的交付流程](README.md#私密交付)。凭据单独保管，验收及交付记录按同一站点编号追溯。

## 发布门槛

选版、批准、隔离验收、部署后固定域名复验与回滚，统一按 [README](README.md) 执行。[故障记录](INCIDENTS.md) 保留旧修复和回归证据。
