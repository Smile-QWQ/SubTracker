# SubTracker

一个现代化的自托管订阅管理工具，用来统一管理多币种订阅、预算、续订提醒、Logo 资源和 Wallos 数据迁移。

## 功能亮点

- **订阅管理**：新增、编辑、续订、暂停、停用、记录查看、拖拽排序
- **标签系统**：多标签归类、筛选、预算统计
- **多币种支持**：基准货币换算、汇率快照、货币转换器
- **预算与统计**：月/年预算、标签占比、未来 12 个月支付趋势
- **通知能力**：Webhook、SMTP 邮件、PushPlus
- **Logo 能力**：上传、本地复用、网络搜索、Wallos ZIP 导入匹配
- **AI 识别**：支持文本/图片识别后自动填充订阅信息
- **Wallos 导入**：兼容 JSON、SQLite、ZIP

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

如果你在 Windows PowerShell 下，也可以用：

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

详细部署说明见：

- [DEPLOYMENT.md](./DEPLOYMENT.md)

当前提供两种方式：

1. **推荐**：外部 Nginx 托管前端静态文件，Docker 仅部署 API
2. **完整部署**：使用 `docker-compose.full.yml` 同时启动前端 Nginx + API

## Release 产物

仓库的 `Build and Release` workflow 会在 tag 发布时自动产出：

- `subtracker-web-dist.zip`：前端静态文件
- `ghcr.io/smile-qwq/subtracker-api`：API Docker 镜像

适合直接用于服务器部署。
