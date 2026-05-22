<p align="center">
  <img src="./apps/web/src/assets/brand-logo.png" alt="SubTracker Logo" width="112" />
</p>

<h1 align="center">SubTracker</h1>

<p align="center">
  一个现代化的自托管订阅管理工具，用来统一管理订阅、提醒、预算、Logo 资源和 Wallos 数据迁移。
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="#本地开发">本地开发</a> ·
  <a href="#部署">部署</a> ·
  <a href="./DEPLOYMENT.md">部署文档</a>
</p>

> 当前 `main` 分支提供 **Docker / Docker Compose** 部署；如果你需要 **Cloudflare Worker 无服务器部署**，请前往 [`lite`](https://github.com/Smile-QWQ/SubTracker/tree/lite) 分支，对应的部署说明、工作流与 Worker 适配实现都维护在该分支。

## 功能亮点

- **订阅管理**：支持新增、编辑、续订、暂停、停用、恢复和续订记录查看，并提供标签分类、多标签筛选、自定义排序、搜索、批量状态调整和批量删除。
- **提醒规则**：支持到期前、到期当天和过期提醒，使用 `天数&时间;` 格式配置；可按订阅覆盖默认规则，并提供提醒规则预览。
- **统计与预算**：支持多币种统一换算到基准货币，提供费用统计、趋势图表、标签统计、未来 30 天续订分布、状态分布和自动续订占比，并支持月预算、年预算和标签预算。
- **AI 能力**：支持通过文本或图片识别订阅信息并回填表单，统计页支持生成 AI 总结。
- **日历与总览**：提供订阅日历、即将续订列表和仪表盘总览。
- **通知通道**：支持 Webhook、SMTP / Resend 邮件、PushPlus、Telegram Bot、Server 酱和 Gotify。
- **Logo 与资源管理**：支持 Logo 上传、本地复用、网络搜索，并在导入 Wallos ZIP 时尽量匹配已有 Logo。
- **备份与迁移**：支持导入 Wallos 的 JSON、SQLite、ZIP 数据，并提供 SubTracker 原生 ZIP 备份的导出、检查、导入和恢复。
- **多币种工具**：提供汇率数据管理、基准货币换算和内置货币转换器。
- **登录与会话控制**：支持记住我、登录保留时长、默认密码修改提醒和登录失败限流。
- **界面体验**：支持简体中文和英文，以及浅色、深色和跟随系统主题，桌面端提供固定侧边栏和独立内容滚动。

## 快速开始

### 直接部署

```bash
curl -fsSL https://raw.githubusercontent.com/Smile-QWQ/SubTracker/main/scripts/install.sh | bash
```

- 安装脚本启动后会先询问使用 **中文** 还是 **English**，也可以通过 `--lang zh` 或 `--lang en` 直接指定。

### 本地开发

```bash
npm install
npm run prisma:generate
npm run prisma:push
npm run prisma:seed
npm run dev
```

默认地址：

- Web：`http://127.0.0.1:5173`
- API：`http://127.0.0.1:3001`

默认账户：

- 用户名：`admin`
- 密码：`admin`

## 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 复制环境变量

```bash
cp apps/api/.env.example apps/api/.env
```

### 3. 初始化数据库

```bash
npm run prisma:generate
npm run prisma:push
npm run prisma:seed
```

### 4. 启动开发环境

```bash
npm run dev
```

首次登录后建议尽快修改默认密码；登录失败过多时会触发限流保护。

## 常用命令

```bash
npm run dev
npm run build
npm run lint
npm test
```

## 部署

推荐直接使用安装脚本：

```bash
curl -fsSL https://raw.githubusercontent.com/Smile-QWQ/SubTracker/main/scripts/install.sh | bash
```

可选模式：

- **完整部署（full）**：前端 + 后端一起部署
- **仅后端部署（api）**：只部署 API，前端静态文件自行托管

推荐优先使用**完整部署**。更多细节见 [`DEPLOYMENT.md`](./DEPLOYMENT.md)。

## 技术栈

- **前端**：Vue 3、Vite、TypeScript、Naive UI、Pinia、TanStack Query、ECharts
- **后端**：Fastify、Prisma、SQLite、Zod、node-cron

## 许可证

本项目采用 **GNU General Public License v3.0（GPLv3）** 许可证发布。
