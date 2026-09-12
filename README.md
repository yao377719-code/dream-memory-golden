# Dream Memory 59 元基础版黄金空白母版

这是独立的 Cloudflare Pages + Pages Functions + KV 空白客户框架。源码不含原站、demo、TT、TT-2 或任何客户的人物、故事、图片、音乐、纪念日和语录数据。

## 安全边界

- 客户构建必须显式使用 `PUBLIC_CUSTOMER_MODE=blank`，且必须配置 `CUSTOMER_ID`、Pages 项目名、固定网址和唯一 KV。
- `demo` 只能在同时设置 `PUBLIC_CUSTOMER_MODE=demo` 与 `ALLOW_DEMO_BUILD=true` 时构建；仓库不提供 demo 内容。
- 缺少或错配 ID、Pages 项目名、KV 绑定、固定网址时，构建或运行时立即失败，不回退到 demo。
- 后台密码只从 `ADMIN_PASSWORD` 环境变量送入 Cloudflare Secret；脚本不把密码写入仓库或配置。
- 不提供删除、清空、迁移或初始化既有 KV 的脚本。
- 新 blank 站预置四个**空分类结构**：日常、合照、谷子、稿件。分类中不预置图片或客户内容；分类可在后台改名、排序和管理。

## 本地安装与测试

```powershell
npm ci
npm test
npm run audit:golden
```

直接执行 `npm run build` 而不设置身份变量会按设计失败。使用示例配置验证空白生产构建：

```powershell
npm run customer:verify -- --config tests/fixtures/wrangler.blank.json
npm run customer:build -- --config tests/fixtures/wrangler.blank.json
```

测试 fixture 使用不可部署的全零 KV ID，仅用于本地结构和构建验证；正式开站脚本会写入 Cloudflare 返回的真实唯一 ID。

## 新客户完整流程

先生成随机身份，并检查计划；计划模式不会创建任何资源：

```powershell
npm run customer:names -- --count 1 --suffix-length 6
npm run customer:plan -- --slug luna-a1b2c3
```

正式执行前确保工作树干净，通过不回显的输入把密码放入本进程环境：

```powershell
$env:ADMIN_PASSWORD = Read-Host "输入客户后台密码" -MaskInput
npm run customer:provision -- --slug luna-a1b2c3
Remove-Item Env:ADMIN_PASSWORD
```

`customer:provision` 只在明确的 `--execute` 模式下执行以下顺序：

1. 检查 Git 工作树和 Pages/KV 名称冲突。
2. 创建唯一 KV namespace。
3. 创建唯一 Pages 项目，生产分支名等于 `CUSTOMER_ID`。
4. 在该客户专用 fresh clone 根目录生成被 Git 忽略的 `wrangler.jsonc` 单一身份配置；Pages、Functions 和构建都从它取值。
5. 把 `ADMIN_PASSWORD` 通过标准输入写入 Pages Secret。
6. 以 blank 模式构建并执行源码、产物和身份审计。
7. Wrangler 手动部署，不启用 Git Push 自动部署。
8. 下载 Pages 远端配置，只核对项目名、`CUSTOMER_ID` 和 KV binding。
9. 验收固定前台、后台、公开 API、正确/错误密码、前后端 ID、空 KV，以及首次打开即展示四个空相册分区。
10. 站主交付闭环：通过安全的一次性渠道把后台密码交给站主，不在 Git、配置、Markdown、截图或公开聊天中记录；由站主或交付者完成一次真实后台登录，并验证退出重登后仍可登录。仅验证 Secret 已写入不算交付完成。

任何步骤失败都会停止；脚本不会回滚时删除已创建资源，防止误删。应检查已完成步骤后再决定如何继续，不能盲目重跑。

## 已纳入的基础版

首页资料、关于我们、故事时间线、音乐、语录、纪念日、日历、相册分类及图片、16 套主题、自定义主题色、预设布局、模块开关、所有模块标题编辑、图片焦点实时预览、原图优先上传，以及相册批量上传/进度/失败隔离/排序/旧草稿兼容。

明确不含 demo 访问统计、旧 Netlify/Decap、私密日记、多曲歌单、小人入口及其他定制功能。
