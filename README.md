# SubTracker

一个现代化的自托管订阅管理工具，用来统一管理多币种订阅、续订提醒、预算分析、Logo 资源，以及 Wallos 数据迁移。

## 功能亮点

- **订阅管理**：新增、编辑、续订、暂停、停用、记录查看、自定义排序
- **标签系统**：多标签归类、筛选、预算分析
- **预算能力**：总月预算、总年预算、标签月预算、独立的预算统计页
- **统计分析**：未来 12 个月支付趋势、标签支出占比、状态分布、自动续订占比、未来 30 天续订分布
- **多币种支持**：基准货币换算、汇率快照、货币转换器
- **通知能力**：Webhook、SMTP 邮件、PushPlus
- **Logo 能力**：上传、本地复用、网络搜索、Wallos ZIP 导入匹配
- **AI 识别**：支持文本 / 图片识别后自动填充订阅信息
- **Wallos 导入**：兼容 JSON、SQLite、ZIP
- **登录体验**：支持“记住我”和可配置的登录保留时长

## 技术栈

- **前端**：Vue 3、Vite、TypeScript、Naive UI、Pinia、TanStack Query、ECharts
- **后端**：Fastify、Prisma、SQLite、Zod、node-cron

## 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 复制开发环境变量

```bash
cp apps/api/.env.example apps/api/.env
```

如果你在 Windows PowerShell 下，也可以使用：

```powershell
Copy-Item apps/api/.env.example apps/api/.env
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

默认地址：

- Web：`http://127.0.0.1:5173`
- API：`http://127.0.0.1:3001`

默认登录：

- 用户名：`admin`
- 密码：`admin`

## 常用命令

```bash
npm run dev
npm run build
npm run lint
npm test
```

## 部署

如果你只是想快速部署，不需要自己编译源码，直接用安装脚本即可：

```bash
curl -fsSL https://raw.githubusercontent.com/Smile-QWQ/SubTracker/main/scripts/install.sh | bash
```

脚本会按你选择的模式自动下载 Release 产物并生成部署目录：

- `api`：只部署后端 API，前端静态文件由你自己的 Nginx 托管
- `full`：前端 + 后端一起部署，自动准备 `web-dist`

详细部署说明见：

- [DEPLOYMENT.md](./DEPLOYMENT.md)

当前提供两种方式：

1. **推荐**：外部 Nginx 托管前端静态文件，Docker 仅部署 API
2. **完整部署**：使用 `docker-compose.full.yml` 同时启动前端 Nginx + API

## Release 产物

仓库的 `Build and Release` workflow 会在打 tag 时自动发布：

- `subtracker-web-dist.zip`：前端静态文件
- `subtracker-deploy-bundle.zip`：部署所需配置与说明文档
- `ghcr.io/smile-qwq/subtracker-api`：API Docker 镜像

适合直接用于服务器部署。
