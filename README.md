# 梦女个人网站国内版黄金模板

这是 59 元基础版的空白 Cloudflare Pages、Functions 与 KV 模板。新站使用独立身份、固定网址、后台密码和 KV。空站保留日常、合照、谷子、稿件四个可编辑入口。来源见 [BASELINE.md](BASELINE.md) 和 [PROVENANCE.md](PROVENANCE.md)，历史故障和验证入口见 [故障记录](INCIDENTS.md)。

## 选版与批准

GitHub 的 `v1.0.0-rc.6` 指向 `9ef573f`，用于追溯现有站。标签是否可用以该标签和完整 commit 对应的验收记录为准。版本默认选择已批准的正式标签 `vX.Y.Z`，指定候选标签 `vX.Y.Z-rc.N` 时，站主需要明确批准该候选。批准记录存放在私密目录，由站主传入。仓库提供 [示例](tests/fixtures/approval.example.json)，其中的值仅演示结构。脚本比对 GitHub 标签的实际 commit，并校验批准记录中的验收项。单站和批量均从该标签的新 clone 构建。

需要把站点、构建和检查结果对上实际部署 commit。GitHub `main` 前进后，仍可使用经过审批的旧标签。固定标签一经使用应保留原指向。验收报告需覆盖 Node、Astro check、空白构建、构建产物、桌面、手机、身份、双站隔离、保存刷新、相册部分失败重试、实际音频播放和坏产物拦截。

## 本地与隔离验收

```powershell
npm ci
npm test
npm run audit:golden
npm run customer:build -- --config tests/fixtures/wrangler.blank.json
npx playwright install chromium
npm run golden:accept:local
```

运行 `npm run check` 时，从同一测试身份设置 `PUBLIC_CUSTOMER_MODE=blank`、`PUBLIC_CUSTOMER_ID`、`PUBLIC_PAGES_PROJECT_NAME` 和 `PUBLIC_SITE_URL`。在一个副本中顺序运行构建和 Astro check。Windows 已安装 Edge 时可用 `GOLDEN_BROWSER_CHANNEL=msedge`。本地验收创建两个不同身份的 Wrangler Pages 测试目录、独立持久化 KV 和合成内容。结果及截图写到 `.customer/local-accept-*`。

运行 `npm run golden:accept` 做独立云测试时，分别传入 `GOLDEN_TEST_URL`、`GOLDEN_TEST_CUSTOMER_ID`、`GOLDEN_ADMIN_PASSWORD`、`GOLDEN_ISOLATION_URL`、`GOLDEN_ISOLATION_CUSTOMER_ID` 和 `GOLDEN_ACCEPTANCE_OUTPUT`。只用专门验收的项目和全新测试 KV。验收会检查双方的身份与初始空数据，在主验收站保存合成数据。验收和批准由不同命令完成，完成本地验收后仍要核对批准记录。

## 开通、复验与续跑

先预览计划。正式执行前将 `$tag` 设为批准标签，`$approval` 设为该标签的私密批准记录路径。私密台账目录可用 `--delivery-dir` 指定，默认是当前 Windows 用户下的 `%LOCALAPPDATA%\Dream-Memory-Golden-Delivery`。

```powershell
npm run customer:plan -- --slug luna-a1b2c3
$env:ADMIN_PASSWORD = Read-Host "输入独立的六位后台密码" -MaskInput
try {
  npm run customer:provision -- --slug luna-a1b2c3 --template-version $tag --approval $approval
} finally {
  Remove-Item Env:ADMIN_PASSWORD
}
npm run customer:batch -- --count 5 --template-version $tag --approval $approval
```

多账户登录时用进程环境的 CLOUDFLARE_ACCOUNT_ID 指定授权账户，续跑会核对首次记录的同一账户。脚本从已确认的项目工作区创建干净副本，核对名称、预记资源创建、创建 Pages 和 KV、通过标准输入写 Secret，随后构建。部署前直接用当前构建产物启动本地 Pages 和 Functions，核对前后台身份、空数据、CSS、关键图片尺寸及手机和桌面布局。产物通过后才会调用 Wrangler。批量按站执行，首站完成固定域名复验后才进入下一站。生产口令只用于目标 Pages Secret 和交付验收，隔离预检使用合成口令。

`cf:deploy` 指向同一个开站入口。直接执行 Wrangler 或启用 Git 自动部署会绕过仓库门槛，发布账户仅在批准入口执行部署。新站正式域名通过远端配置、KV、HTTP 和真实浏览器登录、刷新、退出重登后，台账才标记待售。

中途失败时，先从私密视图查站点编号、项目和故障阶段，按同一标签、批准记录和 Pages 项目继续。批量和单站均可使用 `--resume dream-memory-<原项目名>`。单次恢复处理一个既有记录；批量恢复使用 `customer:batch -- --resume …`。资源创建前有意图记录，恢复时核对同名项目和 KV。同一条记录已经完成的阶段跳过。进程异常退出遗留锁时，先确认持锁 PID 已退出，并备份私密台账后再处理锁文件。开站流程不删除云资源。

## 私密交付

`npm run customer:delivery-view` 输出本机 HTML 文件位置。按站点编号、固定 URL、Pages 项目、状态或版本搜查，可分别复制前后台固定链接。旧批量 JSONL 保持可读，未记录的字段显示待核。新口令单独保存在私密目录的 `credentials` 下，每站一份。旧台账历史口令由站主单独保管。台账和视图应在受 Windows 用户权限保护且未开启同步的目录使用。口令只在站主批准后逐站交付，经原私密交付渠道查找；客户可回看原交付消息。

`npm run customer:mark-sold -- --project <Pages项目>` 追加已售状态。已向客户送达时使用 `--delivered` 记录交付时间。验收时间与交付时间分别记录。

## 失败处理与回滚

开站失败留在待验收。现有站正式发布前记录健康 deployment ID、固定域名、部署 commit 和绑定，并保留通过验收的完整产物。复验失败先停止后续发布，按审批在 Pages 项目 Deployments 中选择已记录的健康 production deployment，使用 Rollback to this deployment，再复验固定域名、前后台身份、绑定、样式与读取。参见 [Cloudflare Pages 回滚流程](https://developers.cloudflare.com/pages/configuration/rollbacks/)。涉及图片回收的回滚还要确保单写者约束，部署回滚无法复原已经实删的对象。

图片生命周期绑定、日志接收端、容量和本地备份见 [运行与交付说明](OPERATIONS.md)。
