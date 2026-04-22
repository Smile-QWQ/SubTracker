# SubTracker Lite 部署说明

当前分支只支持 **Cloudflare Worker** 部署。

## 一、部署方式

推荐方式只有一条：

- **fork 仓库**
- 在你自己的 GitHub 仓库里配置 Cloudflare 凭据
- 通过 **GitHub Actions** 首次部署
- 后续用 **Sync fork** 自动更新

---

## 二、部署前需要准备什么

### 1. Cloudflare 账号

你需要有一个自己的 Cloudflare 账号。

### 2. GitHub fork 仓库

先把当前仓库 fork 到你自己的 GitHub 账号下。

### 3. Cloudflare API Token

在 Cloudflare Dashboard 中创建：

- `My Profile`
- `API Tokens`
- `Create Token`

推荐使用 **Custom token**。

至少给这个 token 这些 **Account 级权限**：

- `Account Settings: Read`
- `Workers Scripts: Edit`
- `Workers KV Storage: Edit`
- `D1: Edit`

如果你要启用 Logo 持久化，再额外加：

- `Workers R2 Storage: Edit`

如果你以后还要绑定自定义域名 / Route，再额外加：

- `Workers Routes: Edit`

建议把资源范围限制在你自己的目标 Account。

### 4. Cloudflare Account ID

你还需要你的：

- `CLOUDFLARE_ACCOUNT_ID`

可以在 Cloudflare Dashboard 里看到，例如：

- `Account home`
- 或 `Workers & Pages` 页面右侧 `Account details`

---

## 三、在 GitHub 仓库里配置什么

进入你自己 fork 后的 GitHub 仓库：

- `Settings`
- `Secrets and variables`
- `Actions`

### 必填 Secrets

添加：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

### 可选 Variables

按需添加：

- `WORKER_NAME_PREFIX`
  - 默认值是：`subtracker`
  - 用来决定 Worker 名称、KV / D1 / R2 资源名前缀
- `ENABLE_KV`
  - 默认值是：`true`
  - 不填时默认启用 KV
  - 如果明确填 `false`，部署时将不绑定 KV
- `ENABLE_R2`
  - 填 `true` 时启用 R2
  - 不填或填其他值时，默认不开启

如果你只是想先跑起来，通常只需要：

- 配好两个 Secrets
- 不配 Variables 也可以部署

---

## 四、首次部署

在你自己的 fork 仓库中：

1. 打开 **Actions**
2. 选择 **Deploy to Cloudflare**
3. 点击 **Run workflow**

这一步不需要再填写额外参数。

首次部署时，workflow 会自动：

- 安装依赖
- 运行测试
- 构建前端
- 部署 Worker
- 自动使用当前提交的短 hash 作为版本号

---

## 五、后续更新

后续更新推荐直接使用：

- GitHub 的 **Sync fork**

同步上游代码后，会自动触发：

- `Deploy to Cloudflare`

也就是说，正常情况下你后面不需要再手工重复部署。

只要这些不变：

- Cloudflare 账号
- `WORKER_NAME_PREFIX`
- `ENABLE_R2`

就会继续复用原来的：

- D1
- KV
- R2（如果启用了）

不会因为同步代码就把数据重建掉。

---

## 六、当前资源说明

### 必需

- **D1**

### 推荐

- **KV**

用途：

- Logo 搜索缓存
- 通知去重
- 导入预览缓存

默认会启用 KV。  
如果你在仓库 Variables 里把 `ENABLE_KV` 明确设为 `false`，系统仍然可以运行，但会有功能退化。

### 可选

- **R2**

用途：

- Logo 持久化存储

不启用 R2 时：

- 仍然可以正常使用系统
- 但只支持远程 Logo 引用
- 不支持本地持久化 Logo 库

---

## 七、邮件通知

当前分支默认使用：

- **Resend**

你需要在系统设置里填写：

- `Resend API URL`
- `Resend API Key`
- `发件人`
- `收件人`

默认 API URL 是：

```txt
https://api.resend.com/emails
```

---

## 八、本地手动部署（开发者可选）

如果你不是普通 fork 用户，而是本地维护这个分支的开发者，也可以直接在本机执行：

```bash
npm run deploy:worker
```

如果要启用 R2：

```bash
npm run deploy:worker:r2
```

本地命令行部署会：

- 优先读取环境变量里的 Cloudflare 凭据
- 如果没有配置 `CLOUDFLARE_API_TOKEN`，会尝试走 `wrangler login` 浏览器授权

如果你本地想关闭 KV，也可以临时设置：

```powershell
$env:ENABLE_KV='false'
npm run deploy:worker
```

---

## 九、本地开发（开发者可选）

如果你需要本地调试 Worker：

```bash
npm run dev:worker
```

默认本地地址：

```txt
http://127.0.0.1:8787
```

> 注意：本地 `wrangler dev` 不会自动触发 cron。

---

## 十、当前分支能力边界

### 支持

- 登录
- 订阅管理
- 标签
- 统计
- 日历
- 汇率刷新
- Webhook
- PushPlus
- Telegram
- Resend 邮件
- AI 文本 / 图片识别
- Wallos JSON 导入

### 不支持

- 本地 OCR
- Wallos SQLite / ZIP 导入
- 原生 SMTP
