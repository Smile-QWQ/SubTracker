# Cloudflare Worker 部署说明（SubTracker Lite）

> 适用于当前 Cloudflare Worker 版本。

## 当前能力边界

- 单 Worker 一体化部署：前端静态资源 + API 同域提供
- 必需资源：**D1**
- 推荐资源：**KV**
- 可选资源：**R2**
- 支持：登录、订阅、标签、设置、统计、日历、汇率刷新、Webhook、PushPlus、Telegram、MailChannels 邮件、AI 文本/视觉识别、Wallos JSON 导入
- 不支持：本地 OCR、Wallos SQLite/ZIP 导入、原生 SMTP

## 1. fork 仓库并配置 GitHub Secrets

在你自己的 fork 仓库里配置：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

可选配置 GitHub Actions Variables：

- `WORKER_NAME_PREFIX`：默认 `subtracker`
- `ENABLE_R2`：填 `true` 后，后续 sync fork 自动部署也会启用 R2

## 2. 调整变量

按需修改 `wrangler.jsonc` 里的 `vars`：

- `WEB_ORIGIN`
- `BASE_CURRENCY`
- `DEFAULT_NOTIFY_DAYS`
- `EXCHANGE_RATE_URL`
- `CRON_SCAN`
- `CRON_REFRESH_RATES`
- `MAILCHANNELS_API_URL`

## 3. 本地调试

```bash
npm run dev:worker
```

默认会使用 `wrangler.jsonc` 启动本地 Worker。

默认 Workers 域名前缀为 `subtracker`。如果你想改成别的前缀，可以在部署时传：

```bash
npm run deploy:worker -- --name-prefix your-prefix
```

或者：

```bash
$env:CLOUDFLARE_WORKER_PREFIX='your-prefix'
npm run deploy:worker
```

## 4. 通过 GitHub Actions 首次部署

首次 fork 后：

1. 打开 Actions 页面
2. 选择 **Deploy to Cloudflare**
3. 点击 **Run workflow**
4. 根据需要填写：
   - `branch`
   - `name_prefix`
   - `enable_r2`
   - `app_version`

默认域名前缀是 `subtracker`。

如果 `app_version` 留空，workflow 会自动使用当前部署 commit 的短 hash 作为版本号。

## 5. 后续更新

后续使用 GitHub 的 **Sync fork** 同步上游代码后，会自动触发部署 workflow。  
自动部署会优先读取仓库 Variables 中的：

- `WORKER_NAME_PREFIX`
- `ENABLE_R2`

## 6. 命令行手动部署（开发者 / 本地）

如果你自己本地维护并想手动部署，也可以继续使用：

```bash
npm run deploy:worker
```

启用 R2：

```bash
npm run deploy:worker:r2
```

## 7. 运行期说明

- 没配 KV：系统仍可运行，但导入预览缓存、Logo 搜索缓存和通知去重会退化
- 没配 R2：系统仍可运行，但只支持远程 Logo 引用，不支持持久上传 Logo 库
- 邮件通知默认走 MailChannels HTTP API，请在系统设置里配置发件邮箱和收件邮箱
