# 国内版运行与交付

## 图片回收

Pages Functions 可通过 `DREAM_MEMORY_IMAGE_LIFECYCLE` 接入专属图片生命周期 Worker。示例配置在 `cloudflare/wrangler.images.example.jsonc`。Cloudflare Pages 绑定的是另行部署的 Durable Object Worker。隔离验证的 KV、CUSTOMER_ID、Pages 项目和 Worker 需要一一对应。启用时，后台保存和图片写入必须经同一协调器。迁移前先让旧部署的写入停止，保留站点数据和必要的对象备份，避免两条写入路径并行。现有实例绑定和实删须单独批准。

协调器先记待写状态，等 `site.json` 写入成功后再提交当前快照并回收所有已失去引用的本站图片。递归检查图库、未分类图、分类封面、资料、故事和其他旧数据形状中的图片引用。上传后未保存的草稿保留 24 小时，过期进入回收。失败随后由 alarm 重试，删过的对象保留墓碑，阻止旧快照重新引用或 KV 节点继续读出旧值。启用后管理页按上次读写版本提交，遇到另一会话已保存的情况会提示刷新。缺少协调器的既有配置继续走兼容存储路径，物理回收需要绑定。

新图片响应使用 `Cache-Control: no-store`。已经下发的一年缓存可能继续由旧浏览器或代理命中。协调器拦截撤销图片的冷请求，Cloudflare KV 自身的跨节点传播需要单独在云隔离环境验证。

`GET /api/admin-image?inventory=1` 是需后台授权的只读审阅接口。每页返回本站未引用候选键、创建时间和已测字节数，按 `nextCursor` 继续，字节数未知的单独计数。等待保存的草稿也可能出现在结果中，历史清理需等待草稿窗口并复核引用。接口不提供删除操作。此次只在合成数据上验证流程，生产历史孤图清单等待指定读取范围。

## 运行日志

各 HTTP 路由返回 `X-Request-ID`。日志允许记录路由类、方法、状态、版本、总耗时和 KV、图片协调器及网易云请求各阶段耗时。错误和慢请求保留，普通成功请求按 5% 采样。配置受控 HTTPS 接收地址 `DREAM_MEMORY_LOG_ENDPOINT`，身份令牌作为 Secret `DREAM_MEMORY_LOG_TOKEN` 设置。检索时用请求 ID 匹配结构化记录。密码、Cookie、请求体、图片和带查询参数的 URL 不进入日志。没有接收端时只存在实时日志，Pages tail 不提供历史查询。接收失败的告警及接收端自身的保留策略由受控系统配置。

本轮在本机 HTTP 接收端和隔离的 Workers 运行时验证。触发 KV 写入失败并关闭测试运行时后，仍能从落盘记录按请求 ID 查回。Cloudflare Fetch 使用手动处理重定向模式，接收端响应 3xx 时不转发令牌。真实接收端权限和云端故障回查仍待验证。

## Cloudflare 容量

2026-11-27 授权 Wrangler 只读查询返回 46 个 Pages 项目和 51 个 KV namespace。按每账户 100 个 Pages 项目计算，剩余 54 个项目名额。待售、样例和测试项目均占名额。Workers Free 的 KV 合计 1 GB，每天读 100,000 键，写、删和 list 各 1,000 次。namespace 数量与存储用量分别统计。账户实际 KV 字节数和增长待用授权 Cloudflare KV Analytics 核实。接近上限时单独评估新单共用部署与租户隔离或 Workers for Platforms。

- [Pages 限制](https://developers.cloudflare.com/pages/platform/limits/)
- [KV 配额](https://developers.cloudflare.com/kv/platform/pricing/)
- [KV 统计](https://developers.cloudflare.com/kv/observability/metrics-analytics/)
- [KV 一致性](https://developers.cloudflare.com/kv/concepts/how-kv-works/)
- [Pages Functions 日志](https://developers.cloudflare.com/pages/functions/debugging-and-logging/)
- [Pages Durable Object 绑定](https://developers.cloudflare.com/pages/functions/bindings/#durable-objects)

## 项目内清单

- C 盘外层旧仓库的 `migration-backups`、项目摘要和现有本地实例配置先确认保留与备份。配置可能含敏感信息，禁止写入 Git。已有 `.wrangler` 可能保留独立测试数据，确认无继续验收或审计用途后再处理。
- C、E 两份仓库里的 `node_modules` 和 `.astro` 可由锁文件和源码重建，确认没有运行的本项目进程占用后再清理。旧 `dist` 先对照部署和回滚记录，保留已发布或用于取证的产物。
- 当前修复工作树里 `.customer/local-accept-*` 是测试报告、截图、合成 KV 和产物，先保留最终通过与故意失败证据。测试依赖缓存和已失败的本机临时输出可在证据归档后清理。
- C 盘外层和内层 Golden 本来就是两份 Git 历史。E 盘副本仍在 rc.3。保留三处现有配置及历史，清理须另行确认。
