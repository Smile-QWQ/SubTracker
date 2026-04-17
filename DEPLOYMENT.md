# SubTracker Deployment

本文档面向服务器部署，提供两种方式：

1. **推荐方式**：外部 Nginx 托管前端，Docker 仅部署 API
2. **完整方式**：使用 `docker-compose.full.yml` 同时启动前端 Nginx + API

---

## 1. API 镜像

默认镜像地址：

```text
ghcr.io/smile-qwq/subtracker-api:latest
```

`docker-compose.yml` 默认会使用：

```bash
SUBTRACKER_API_IMAGE=ghcr.io/smile-qwq/subtracker-api:latest
```

---

## 2. 推荐方式：外部 Nginx + API Docker

适合：

- 前端静态文件已经由 GitHub Release 或 CI 构建好
- 服务器已有外部 Nginx
- 你希望前后端职责分离

### 启动 API

准备：

- `docker-compose.yml`
- `data/`
- `data/logos/`

执行：

```bash
docker compose pull
docker compose up -d
```

### 核心环境变量

```bash
SUBTRACKER_API_IMAGE=ghcr.io/smile-qwq/subtracker-api:latest
PORT=3001
HOST=0.0.0.0
DATABASE_URL=file:/app/data/subtracker.db
WEB_ORIGIN=https://subtracker.example.com
LOG_LEVEL=warn
```

### 持久化目录

- `./data` -> SQLite 数据库
- `./data/logos` -> 本地 Logo 文件

### 外部 Nginx 示例

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

### 前端静态文件部署

前端不进入 API 镜像。

你可以：

1. 从 Release 下载 `subtracker-web-dist.zip`
2. 解压后部署到外部 Nginx 静态目录

或者在本地自行构建：

```bash
npm install
npm run build -w apps/web
```

然后将 `apps/web/dist` 发布到外部 Nginx 根目录。

---

## 3. 完整方式：docker-compose.full.yml

适合：

- 想用 Compose 一次性启动前端和 API
- 不想单独维护外部 Nginx

### 前提

需要先准备前端静态文件目录：

```text
./web-dist
```

你可以通过两种方式获得它：

#### 方式 A：从 Release 解压

把 `subtracker-web-dist.zip` 解压到：

```text
./web-dist
```

#### 方式 B：本地构建

```bash
npm install
npm run build -w apps/web
```

然后把：

```text
apps/web/dist
```

拷贝到：

```text
./web-dist
```

### 启动完整部署

```bash
docker compose -f docker-compose.full.yml up -d
```

默认访问：

- Web：`http://localhost:8080`
- API：由前端 Nginx 反代到内部 `api:3001`

### 完整部署持久化目录

- `./data`
- `./data/logos`
- `./web-dist`

---

## 4. Release 与镜像发布

仓库的 `Build and Release` workflow 会在发布 tag 时自动生成：

- API 镜像：`ghcr.io/smile-qwq/subtracker-api`
- 前端静态包：`subtracker-web-dist.zip`

因此服务端升级通常只需要：

### API-only 模式

```bash
docker compose pull
docker compose up -d
```

### Full compose 模式

1. 更新 `web-dist`
2. 更新 API 镜像

```bash
docker compose -f docker-compose.full.yml pull
docker compose -f docker-compose.full.yml up -d
```

---

## 5. 开发环境变量

本地开发前请先复制：

```bash
cp apps/api/.env.example apps/api/.env
```

PowerShell：

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```
