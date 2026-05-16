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

注意这里有一个很容易踩坑的点：

- fork 时请取消勾选 **只复制默认分支 / Copy the main branch only**
- 否则你的 fork 里不会带上 `lite` 分支
- 如果已经忘了取消，最省事的做法通常是删除这个 fork 后重新 fork 一次

### 3. Cloudflare API Token

在 Cloudflare Dashboard 中创建：

- `My Profile`
- `API Tokens`
- `Create Token`

推荐使用 **Custom token**。

至少给这个 token 这些 **Account 级权限**：

- `Account Settings: Read`
- `Workers Scripts: Edit`
- `D1: Edit`

如果你要启用 Logo 持久化，再额外加：

- `Workers R2 Storage: Edit`

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
  - 用来决定 Worker 名称、D1 / R2 资源名前缀
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
2. 选择 **Lite CI and Deploy**
3. 在 **Use workflow from** 里选择 **`lite` 分支**
4. 点击 **Run workflow**

这里一定要确认运行的是 **`lite`**，不要直接用默认显示的 `main` 去跑。

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

- `Lite CI and Deploy`

也就是说，正常情况下你后面不需要再手工重复部署；同一个 workflow 会先跑 CI，验证通过后再执行部署。

如果你后面需要手动重新执行，也同样记得：

- 在 **Use workflow from** 中选择 **`lite` 分支**

只要这些不变：

- Cloudflare 账号
- `WORKER_NAME_PREFIX`
- `ENABLE_R2`

就会继续复用原来的：

- D1
- R2（如果启用了）

不会因为同步代码就把数据重建掉。

---

## 六、当前资源说明

### 必需

- **D1**

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

## 八、当前分支能力边界

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
- Wallos JSON / SQLite / ZIP 导入
- SubTracker 备份 ZIP 导入

### 不支持

- 本地 OCR
- 原生 SMTP
- 标签月预算
- 独立预算统计页
- 仪表盘趋势图 / 标签预算图
- 费用统计自动续订占比图

---

## 九、从旧 lite 版本升级

如果你的 fork 仍停留在：

- `be70f8d2d9d1a7a0c9f6e814ff7f4c16e57cefd5`

可以直接通过当前 GitHub Actions 部署到本版本：

- **不需要手工数据库迁移**
- **不需要重建 D1**

升级后的对外变化：

- 标签月预算、预算页和对应菜单入口已删除
- 仪表盘改为轻量首页，只保留核心指标、全局预算和即将续订列表
- 费用统计只保留费用概览、状态分布、币种分布、月订阅支出 TOP10 与 AI 总结
- Wallos / SubTracker 备份导入仍可使用，但需要使用同版本前端完成导入流程
- 自动续费会分批追赶历史积压，不再一次性补完整个 backlog

对于普通 Web 用户，这些变化随同一版本前端一起发布；部署后刷新页面即可使用新界面。

---

## 十、Worker Lite 的性能取舍

这个分支面向 **Cloudflare Worker Free**，因此实现上做了明确的 Lite 化裁剪，而不是完全复刻 Docker 版的运行模型。

### 1. L1 isolate 内存 + L2 D1 持久缓存

当前热点读取接口使用两级缓存：

- **L1：当前 isolate 内存缓存**
- **L2：D1 `ComputedCache` 持久缓存**
- **L1 命中窗口固定较短**，并且不会超过对应 D1 条目的剩余有效期

目前接入 D1 二级缓存的接口是：

- `/settings`（5 分钟）
- `/exchange-rates/latest`（5 分钟）
- `/statistics/overview`（5 分钟）
- `/calendar/events`（10 分钟）

仍保留短 TTL 内存缓存的读取接口包括：

- `/tags`
- `/subscriptions`

这样做的原因是：

- Worker Free 每次 HTTP 请求只有 **10ms CPU**
- 同一页面会并发读取多份数据
- 如果每次都实时重算，很容易撞上 `Worker exceeded CPU time limit`
- D1 读额度相对充裕，适合承担热点聚合结果的二级缓存
- 同时避免继续消耗 KV Free 的每日写入额度

这套缓存的副作用是：

- 正常写操作后，统计/日历/汇率相关接口通常会立即切到新版本缓存，而不是机械地等 TTL 过期
- 真正可能自然短暂变旧的主要是 `/statistics/overview`，在无写操作场景下最多约 5 分钟
- `/calendar/events` 更依赖 version bump，正常情况下不应频繁看到明显旧值
- L1 仍是 isolate 级缓存，不保证跨实例强一致
- D1 二级缓存会跨 isolate 复用，但通过版本号失效而不是逐条删除

当前实现已经对主要写操作做了主动失效，所以正常情况下：

- 保存设置后，会刷新 settings / statistics / calendar / exchange-rates，并 bump `cacheVersion.settings` / `cacheVersion.statistics` / `cacheVersion.calendar` / `cacheVersion.exchangeRates`
- 修改标签后，会刷新 tags / subscriptions / statistics，并 bump `cacheVersion.statistics`
- 修改订阅后，会刷新 subscriptions / statistics / calendar，并 bump `cacheVersion.statistics` / `cacheVersion.calendar`
- Wallos 导入提交后，会刷新 subscriptions / tags / statistics / calendar，并 bump `cacheVersion.statistics` / `cacheVersion.calendar`
- 汇率刷新成功后，也会 bump `cacheVersion.statistics` / `cacheVersion.calendar` / `cacheVersion.exchangeRates`

也就是说：

> **缓存带来的不是“写完一定还要等完整 TTL”，而是“正常写后通常会立刻切新版本；只有少数纯时间驱动统计（主要是 `/statistics/overview`）才可能在无写操作时最多短暂旧约 5 分钟”。**

### 2. 不使用 KV

当前分支不绑定 KV，原因是 Cloudflare Workers Free 的 KV 写入额度只有 **1000/day**，对于本项目的缓存失效、通知去重和导入预览场景来说过于紧张。

现在这些能力的处理方式是：

- 读取类接口：使用 isolate 内存短缓存
- 热点聚合接口：额外落一层 D1 `ComputedCache`
- 通知去重：回到 D1
- 导入预览：按 lite 版导入流程处理
- Logo 搜索缓存：仅保留进程内短缓存

另外，`ComputedCache` 过期行会通过现有的 hourly Worker cron 顺手清理，不单独增加新的调度器。

### 3. Wallos 导入能力

当前 Worker 分支支持：

- Wallos JSON 导入
- Wallos SQLite 数据库导入（`.db` / `.sqlite` / `.sqlite3`）
- Wallos ZIP 备份导入
- SubTracker 备份 ZIP 导入

其中：

- JSON / SQLite / ZIP 的文件解析发生在浏览器端
- Worker 负责处理 ZIP Logo（若启用 R2）并最终写库

并且会尽量对齐 Wallos 自己的运行时语义：

- 对 `auto_renew = true` 且 `next_payment` 已落后的订阅，会先按 Wallos 的周期推进逻辑修正日期，再判定状态
- ZIP 预览阶段会先处理其中可匹配的 Logo 资产

关于 ZIP Logo：

- **启用 R2 时**
  - 预览阶段会先把匹配到的 Logo 写入 R2 临时对象
  - 确认导入时直接复用这些对象，不重复上传
- **未启用 R2 时**
  - 仍可导入 ZIP 中的数据库内容
  - 但会忽略 ZIP 中的 Logo，并在预览中给出 warning

### 4. Logo 搜索是 Lite 版

Worker Lite 的 Logo 搜索只保留：

- 网站 icon / manifest / og:image
- DuckDuckGo 候选

并明确去掉：

- Brave
- 搜索阶段的服务端逐图探测
- main 分支那种更重的结果精筛

这样做的目的，是把 `/subscriptions/logo/search` 从高 CPU 路径压到 Worker Free 能承受的范围内。

副作用是：

- 搜索结果质量不如 Docker / main 分支
- 偶尔会混入不够理想的候选图

### 5. Cron 已拆成 Lite 版职责

当前默认触发器是：

- `* * * * *`：提醒扫描
- `2 * * * *`：自动续费
- `0 2 * * *`：汇率刷新
- `10 2 * * *`：过期状态对账

当前 Lite 版已改回 **每分钟扫描**，提醒触发逻辑与主线保持一致。

当前特性是：

- 默认每分钟触发一次提醒扫描
- 只在规则命中的那一分钟发送提醒
- 相比旧的 `*/5` 版本，提醒更实时，但不再做 5 分钟补偿命中
- 没有启用任何通知渠道时，普通 scheduled scan 会直接短路；`/notifications/scan-debug` 仍可用于排障

自动续费也做了 lite 限额：

- 历史积压会分批追赶
- 不再保证一次 cron 就补齐所有过期周期

### 6. 仪表盘 / 费用统计已按 lite 重排

仪表盘只保留轻量信息：

- 顶部摘要指标
- 全局月 / 年预算使用情况
- 即将续订列表

费用统计只保留有真实数据支撑的统计视图：

- 费用概览
- 状态分布
- 订阅币种分布
- 月订阅支出 TOP10
- AI 总结

以下功能 / 展示已从 lite 分支移除：

- 标签月预算
- 标签月度支出
- 未来 12 个月支付趋势
- 未来 30 天按日续订分布
- 自动续订占比

### 7. 登录体验

登录、记住我、默认密码修改提醒和登录失败限流继续保留；从旧 lite 版本升级后，原账号可以继续登录。

### 8. 错误提示会明确说明 Worker 限制

前端遇到：

- `503`
- `Worker exceeded CPU time limit`

会统一提示用户：

- 可能受 **Cloudflare Worker 免费版限制** 影响
- 请稍后重试并避免连续重复点击

---

## 十一、本地手动部署（开发者可选）

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

---

## 十二、本地开发（开发者可选）

如果你需要本地调试 Worker：

```bash
npm run dev:worker
```

默认本地地址：

```txt
http://127.0.0.1:8787
```

> 注意：本地 `wrangler dev` 不会自动触发 cron。
