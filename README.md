<p align="center">
  <img src="./screenshot/brand.png" alt="SubTracker Lite" width="220" />
</p>

<p align="center">
  <a href="https://github.com/Smile-QWQ/SubTracker/releases"><img src="https://img.shields.io/github/v/release/Smile-QWQ/SubTracker?style=flat-square" alt="GitHub release" /></a>
  <a href="https://github.com/Smile-QWQ/SubTracker/stargazers"><img src="https://img.shields.io/github/stars/Smile-QWQ/SubTracker?style=flat-square" alt="GitHub stars" /></a>
  <a href="https://www.gnu.org/licenses/gpl-3.0"><img src="https://img.shields.io/badge/License-GPLv3-blue.svg?style=flat-square" alt="License: GPL v3" /></a>
</p>

<p align="center">
  现代化的自托管订阅管理工具，统一管理多币种订阅、续订提醒、预算分析、Logo 资源，以及 Wallos 数据迁移。
</p>

<p align="center">
  当前分支仅保留 <strong>Cloudflare Worker</strong> 部署路线 · <a href="./DEPLOYMENT.md">查看部署文档</a>
</p>

## 界面预览

### 仪表盘

![仪表盘](./screenshot/仪表盘.png)

### 更多截图

| 订阅管理 | 费用统计 |
| --- | --- |
| ![订阅管理](./screenshot/订阅管理.png) | ![费用统计](./screenshot/费用统计.png) |

| AI 识别 | Wallos 导入 |
| --- | --- |
| ![AI识别](./screenshot/AI识别.png) | ![导入Wallos](./screenshot/导入Wallos.png) |

## 功能亮点

- **订阅管理**：新增、编辑、续订、暂停、停用、记录查看、自定义排序
- **提醒规则**：支持 `天数&时间;` 格式的灵活提醒规则，覆盖到期前、到期当天与过期提醒，并支持分钟级扫描
- **标签系统**：多标签归类、筛选、预算分析
- **预算能力**：总月预算、总年预算、标签月预算、独立的预算统计页
- **统计分析**：未来 12 个月支付趋势、标签支出占比、状态分布、自动续订占比、未来 30 天续订分布
- **多币种支持**：基准货币换算、汇率快照、货币转换器
- **通知能力**：Webhook、Resend 邮件、PushPlus、Telegram Bot
- **Logo 能力**：上传（R2）、远程引用、网络搜索
- **AI 识别**：支持文本 / 图片识别后自动填充订阅信息
- **Wallos 导入**：支持 JSON、SQLite 数据库与 ZIP 备份导入；SQLite / ZIP 会在浏览器端解析，再交给 Worker 持久化
- **登录体验**：支持“记住我”、可配置的登录保留时长、默认密码修改提醒，以及登录失败限流保护

## Lite 版说明

这个分支面向 **Cloudflare Worker Free**，因此会做一些 Lite 化取舍：

- 热点统计 / 日历接口会使用 D1 缓存来降低 Worker CPU 压力
- **不使用 KV**
- Wallos 导入、Logo 搜索、Cron 等能力都做了 Worker 适配
- 遇到 `503` / CPU 超限时，前端会明确提示可能受 Worker 免费版限制影响

更详细的部署、能力边界与性能说明见：

- [`DEPLOYMENT.md`](./DEPLOYMENT.md)

## 技术栈

- **前端**：Vue 3、Vite、TypeScript、Naive UI、Pinia、TanStack Query、ECharts
- **后端**：Cloudflare Worker、Hono、Prisma D1 Adapter、D1、可选 R2

## 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 启动本地 Worker

```bash
npm run dev:worker
```

默认地址：`http://127.0.0.1:8787`

默认账户：

- 用户名：`admin`
- 密码：`admin`

首次登录后建议立即修改默认密码；登录接口在连续失败过多时会触发限流保护。

## 常用命令

```bash
npm run dev:worker
npm run build
npm run lint
npm test
```

## 部署

当前推荐通过 **GitHub Actions + Cloudflare** 部署。

部署流程已经整理到：

- [DEPLOYMENT.md](./DEPLOYMENT.md)

大致流程：

1. fork 仓库
2. 配置 Cloudflare Secrets / Variables
3. 在 GitHub Actions 中运行 **Lite CI and Deploy**
4. 后续通过 **Sync fork** 自动更新

常用仓库 Variables：

- `WORKER_NAME_PREFIX`
- `ENABLE_R2`（默认关闭；开启后可持久化 ZIP 导入的 Logo）

## 工作流

- `Lite CI and Deploy`：同一个 workflow 里先跑 lint / test / build，验证通过后再部署到 Cloudflare

## 许可证

本项目采用 **GNU General Public License v3.0（GPLv3）** 许可证发布。

## 致谢

感谢以下项目和生态为 SubTracker 提供支持：

- [Wallos](https://github.com/ellite/Wallos) —— 提供了导入兼容方向与迁移参考
- [Vue 3](https://vuejs.org/) 与 [Vite](https://vitejs.dev/) —— 提供前端开发基础
- [Naive UI](https://www.naiveui.com/) —— 提供界面组件支持
- [Fastify](https://fastify.dev/) 与 [Prisma](https://www.prisma.io/) —— 提供后端与数据访问能力
- [Pinia](https://pinia.vuejs.org/)、[TanStack Query](https://tanstack.com/query/latest) 与 [ECharts](https://echarts.apache.org/) —— 提供状态管理、数据请求与图表展示能力

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Smile-QWQ/SubTracker&type=Date)](https://www.star-history.com/?repos=Smile-QWQ%2FSubTracker&type=date&legend=top-left)
