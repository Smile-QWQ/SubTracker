# SubTracker 部署说明

本项目目前提供的部署方式为 **Docker / Docker Compose**。如果你已经有可用的 Nginx，也可以直接复用它来托管前端静态文件并反代 API。

发布页已提供可直接部署的产物：

- `subtracker-web-dist.zip`：前端静态文件
- `ghcr.io/smile-qwq/subtracker-api`：API Docker 镜像
- `ghcr.io/smile-qwq/subtracker-web`：完整部署使用的前端 Docker 镜像

API 容器首次启动时会自动执行 Prisma `db push`，自动初始化或补齐 SQLite 表结构。

建议直接使用安装脚本：

```bash
curl -fsSL https://raw.githubusercontent.com/Smile-QWQ/SubTracker/main/scripts/install.sh | bash
```

它会根据你选择的部署方式，自动把需要的文件下载到本地目录。

---

## 1. 两种部署方式怎么选

如果没有前后端分离部署需求，推荐使用**完整部署（full）**：

- 不需要自己准备 `web-dist/`
- 不需要单独托管前端静态文件
- 更适合直接 `docker compose pull && up -d` 更新

**仅后端部署（api）**更适合已经有自己 Nginx / 宝塔 / 静态站点目录的用户。

### 方式 A：仅后端部署
适合你已经有自己的 Nginx / 宝塔 / 现成网站目录：

- 脚本会下载当前 Release 对应版本的原始部署文件
- 会为你准备：
  - `docker-compose.yml`
  - `.env`
  - `data/`
  - `data/logos/`
- **不会**自动托管前端静态文件

这时你只需要：

1. 用脚本准备 API 部署目录
2. 把 `subtracker-web-dist.zip` 解压到你自己的 Nginx 网站根目录
3. 按下面的反代配置把 `/api/`、`/static/logos/` 转给 API

### 方式 B：完整部署
适合你想直接用 Docker Compose 同时跑前端和 API：

- 脚本会下载当前 Release 对应版本的原始部署文件
- 会为你准备：
  - `docker-compose.yml`
  - `.env`
  - `data/`
  - `data/logos/`
  - `SUBTRACKER_WEB_IMAGE` 配置

这种方式不需要手工准备 `web-dist/`，直接拉前端镜像即可。

---

## 2. 一键安装脚本

### 2.1 最简单用法

```bash
curl -fsSL https://raw.githubusercontent.com/Smile-QWQ/SubTracker/main/scripts/install.sh | bash
```

脚本会询问：

- 部署方式：`仅后端部署（api）` 或 `完整部署（full）`
- 部署目录
- `WEB_ORIGIN`（前端访问地址）
- 仅后端部署会问：**API 对外端口**
- 完整部署会问：**前端对外端口 `WEB_PORT`**

然后自动下载对应 Release 资产并生成部署目录。

> 如果外层还有 Nginx / 宝塔 / HTTPS，`WEB_ORIGIN` 请填写用户最终访问地址，例如 `https://subtracker.example.com`。

---

### 2.2 指定参数运行

#### 仅后端部署

```bash
curl -fsSL https://raw.githubusercontent.com/Smile-QWQ/SubTracker/main/scripts/install.sh | bash -s -- \
  --mode api \
  --dir /opt/subtracker-api \
  --web-origin https://subtracker.example.com
```

#### 完整部署

```bash
curl -fsSL https://raw.githubusercontent.com/Smile-QWQ/SubTracker/main/scripts/install.sh | bash -s -- \
  --mode full \
  --dir /opt/subtracker-full \
  --web-origin https://subtracker.example.com \
  --web-port 8080
```

---

### 2.3 常用参数

```text
--mode <api|full>        部署方式
--dir <path>             输出目录，默认 ./subtracker-<mode>
--release <tag|latest>   下载哪个 Release，默认 latest
--api-image <image>      API 镜像，默认 ghcr.io/smile-qwq/subtracker-api:latest
--api-port <port>        API 端口；仅后端部署会对外暴露，完整部署默认内部使用 3001
--web-port <port>        完整部署前端端口，默认 8080
--web-origin <origin>    WEB_ORIGIN
--log-level <level>      LOG_LEVEL，默认 warn
--force                  若目录已存在则覆盖
--yes                    非交互模式，直接使用默认值
```

---

## 3. 脚本执行后会得到什么

### 3.1 仅后端部署

典型目录：

```text
subtracker-api/
  ├─ docker-compose.yml
  ├─ .env
  ├─ INSTALL-README.md
  ├─ data/
  │  └─ logos/
  └─ api.env.example
```

启动：

```bash
cd subtracker-api
docker compose pull
docker compose up -d
```

首次启动时，API 容器会自动初始化数据库表结构。

> 注意：仅后端部署下，前端静态文件需要你自己放到 Nginx。

---

### 3.2 完整部署

典型目录：

```text
subtracker-full/
  ├─ docker-compose.yml
  ├─ .env
  ├─ INSTALL-README.md
  ├─ data/
  │  └─ logos/
  └─ api.env.example
```

启动：

```bash
cd subtracker-full
docker compose pull
docker compose up -d
```

首次启动时，API 容器会自动初始化数据库表结构。

默认访问：

- Web：`http://localhost:8080`
- API：由前端镜像内置 Nginx 反代到内部 `api:3001`

- `.env` 里的 `WEB_PORT` 代表**宿主机对外暴露的前端端口**
- 脚本生成的 `docker-compose.yml` 里容器内部仍然是 Nginx 默认监听的 `80`
- 也就是说：
  - `WEB_PORT=8080` -> 映射为 `8080:80`
  - `WEB_PORT=9000` -> 映射为 `9000:80`

---

## 4. 仅后端部署下的前端静态文件

如果你选的是仅后端部署，前端需要你自己放到外部 Nginx。

静态文件来源：

- 发布页资产：`subtracker-web-dist.zip`

把它解压到你的站点目录，例如：

```text
/var/www/subtracker
```

然后使用类似下面的 Nginx 配置：

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

---

## 5. 核心环境变量

脚本会自动生成 `.env`，常见需要调整的字段如下：

```bash
SUBTRACKER_API_IMAGE=ghcr.io/smile-qwq/subtracker-api:latest
PORT=3001
HOST=0.0.0.0
DATABASE_URL=file:/app/data/subtracker.db
WEB_ORIGIN=https://subtracker.example.com
LOG_LEVEL=warn
```

说明：

- 以上列的是常见需要调整的字段；其余带默认值的配置通常保持默认即可

完整部署还会多一个：

```bash
WEB_PORT=8080
```

### `WEB_ORIGIN` 怎么填

这个值用于浏览器跨域校验（CORS），请填写前端最终访问地址。

例如：

```bash
WEB_ORIGIN=https://subtracker.example.com
```

---

## 6. 反向代理 / SSL 说明

生产环境通常会在最外层再套一层 Nginx 处理：

- HTTPS 证书
- 域名访问
- 统一反向代理

这时可以按下面理解：

### 仅后端部署

- 前端静态文件：由外部 Nginx 托管
- API：反代到 `http://127.0.0.1:3001`
- `WEB_ORIGIN`：填外部 HTTPS 域名，例如 `https://subtracker.example.com`

### 完整部署

- 用户访问：`https://subtracker.example.com`
- 外层 Nginx：反代到内部 `http://127.0.0.1:8080`
- 完整部署前端镜像内置 Nginx：再转发给 API 容器
- `WEB_ORIGIN`：仍然填 `https://subtracker.example.com`

如果你把 `WEB_PORT` 改成别的值，比如 `9000`，那外层 Nginx 就应该反代到：

```text
http://127.0.0.1:9000
```

---

## 7. 升级

### 仅后端部署

```bash
cd /你的部署目录
docker compose pull
docker compose up -d
```

同时请把发布页最新的 `subtracker-web-dist.zip` 重新下载并覆盖到你的 Nginx 站点目录。  
仅后端部署的前端静态文件是独立托管的，升级时需要同时更新后端镜像和前端静态文件。

### 完整部署

```bash
cd /你的部署目录
docker compose pull
docker compose up -d
```

日常升级通常不需要重新运行安装脚本；完整部署直接更新镜像即可，仅后端部署仍需手动覆盖前端静态文件。

只有在这些场景下，才需要重新运行安装脚本：

- 首次部署
- 想重建部署目录
- 想切换部署方式（`仅后端部署 / 完整部署`）
- 部署模板或 `.env` 模板有明显变化

例如你要重建完整部署目录时，可以执行：

```bash
curl -fsSL https://raw.githubusercontent.com/Smile-QWQ/SubTracker/main/scripts/install.sh | bash -s -- --mode full --force
```

---
