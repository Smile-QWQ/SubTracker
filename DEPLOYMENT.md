# SubTracker Deployment

本文档面向服务器部署，默认前提：

- 前端静态文件由 **外部 Nginx** 托管
- API 使用 Docker 镜像部署
- SQLite 与 Logo 文件通过宿主机目录持久化

## 1. API 镜像约定

当前推荐镜像名：

```text
ghcr.io/smile-qwq/subtracker-api:latest
```

`docker-compose.yml` 使用环境变量注入镜像名：

```bash
SUBTRACKER_API_IMAGE=ghcr.io/smile-qwq/subtracker-api:latest
```

如果不传，Compose 也会默认使用上面的镜像地址。

## 2. 启动 API

在服务器目录准备好：

- `docker-compose.yml`
- `data/`
- `data/logos/`

然后执行：

```bash
docker compose pull
docker compose up -d
```

## 3. 核心环境变量

Compose 中默认只保留这些部署变量：

- `SUBTRACKER_API_IMAGE`
- `PORT`
- `HOST`
- `DATABASE_URL`
- `WEB_ORIGIN`
- `LOG_LEVEL`

示例：

```bash
SUBTRACKER_API_IMAGE=ghcr.io/smile-qwq/subtracker-api:latest
PORT=3001
HOST=0.0.0.0
DATABASE_URL=file:/app/data/subtracker.db
WEB_ORIGIN=https://subtracker.example.com
LOG_LEVEL=warn
```

其余业务默认值继续由后端 `config.ts` 提供，不需要在生产环境全部展开。

## 4. 持久化目录

Compose 已挂载：

- `./data` → SQLite 数据库目录
- `./data/logos` → 本地 Logo 文件目录

请确保宿主机目录可写。

## 5. 外部 Nginx 反代示例

```nginx
server {
    listen 80;
    server_name subtracker.example.com;

    root /var/www/subtracker;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /static/logos/ {
        proxy_pass http://127.0.0.1:3001/static/logos/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 6. 前端部署

前端不进入 Docker。

推荐流程：

```bash
npm install
npm run build -w apps/web
```

然后把 `apps/web/dist` 发布到外部 Nginx 静态目录。

## 7. GitHub Actions 与镜像发布

仓库已预置两个 workflow：

- `CI`：在 `main` 和 PR 上执行安装、Prisma Generate、Lint、Build
- `Docker Publish`：在 `main`、`v*` tag 或手动触发时发布 API 镜像到 GHCR

默认镜像发布地址：

```text
ghcr.io/smile-qwq/subtracker-api
```

## 8. 升级流程

当 API 镜像发布完成后，服务器只需：

```bash
docker compose pull
docker compose up -d
```

前端静态资源单独更新到 Nginx 目录即可。
