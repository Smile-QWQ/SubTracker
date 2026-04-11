# SubTracker

SubTracker 是一个简洁但功能完整的个人订阅管理系统，用来统一管理多币种订阅、续费提醒、预算统计、Logo 与 AI 辅助录入。

## 功能亮点

- 订阅管理：新增、编辑、续费、暂停、停用、删除、拖拽排序
- 多币种支持：自动汇率换算、基准货币切换、汇率转换器
- 预算统计：月预算、年预算、分类预算、仪表盘总览
- 通知能力：Webhook、SMTP 邮件、PushPlus
- Logo 能力：上传、本地复用、网络搜索并保存到本地
- AI 识别：支持文本或图片识别后自动填充订阅信息

## 技术栈

- 前端：Vue 3、Vite、TypeScript、Naive UI、Pinia、Vue Router、TanStack Query、ECharts
- 后端：Fastify、Prisma、SQLite、Zod、node-cron

## 本地开发

```bash
npm install
npm run prisma:generate
npm run prisma:push
npm run prisma:seed
npm run dev
```

默认地址：

- Web：`http://127.0.0.1:5173`
- API：`http://localhost:3001`

默认账号：

- 用户名：`admin`
- 密码：`admin`

## 部署

- 详细部署文档见：[DEPLOYMENT.md](./DEPLOYMENT.md)
- 推荐方式：
  - 前端静态文件由外部 Nginx 托管
  - API 使用 Docker 镜像部署
  - Nginx 反代 `/api/` 和 `/static/logos/` 到 API

## 常用命令

```bash
npm run dev
npm run build
npm run lint
npm test
```
