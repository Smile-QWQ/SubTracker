# SubTracker 部署说明

SubTracker 现在**不需要用户自己编译**。发布页已经提供了两个现成资产：

- `subtracker-web-dist.zip`：前端静态文件
- `ghcr.io/smile-qwq/subtracker-api`：API Docker 镜像
- `ghcr.io/smile-qwq/subtracker-web`：Full 模式前端 Docker 镜像

另外，从 `v0.4.2` 之后开始，API 容器在启动时会自动执行一次 Prisma `db push`，用于初始化或补齐 SQLite 表结构，因此 fresh deploy 不再需要你手工执行数据库初始化命令。

如果你只是想尽快把它跑起来，优先用下面这个脚本：

```bash
curl -fsSL https://raw.githubusercontent.com/Smile-QWQ/SubTracker/main/scripts/install.sh | bash
```

它会根据你选择的部署方式，自动把需要的文件下载到本地目录。

---

## 0. 本次部署文档更新说明

这版部署文档相对之前做了几处收敛，避免用户还要自己从源码编译：

- 改为以 **GitHub Release 现成产物** 为主，不再把“本地自行编译前端”当默认路径
- 增加 `install.sh` 一键辅助部署入口，脚本会自动下载所需部署文件
- 明确区分两种模式：
  - `api`：只部署后端，前端静态文件由你自己的 Nginx 托管
  - `full`：前端和后端一起部署，直接使用前端镜像
- 明确补充了 **反向代理 / SSL** 的实际用法，尤其是 `WEB_ORIGIN` 应该填写用户最终访问的 HTTPS 域名

如果你只是想快速部署给别人试用，建议直接按本文的 `install.sh` 方式走。

---

## 1. 两种部署方式怎么选

### 方式 A：API-only（推荐）
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

### 方式 B：Full
适合你想直接用 Docker Compose 同时跑前端和 API：

- 脚本会下载当前 Release 对应版本的原始部署文件
- 会为你准备：
  - `docker-compose.full.yml`
  - `.env`
  - `data/`
  - `data/logos/`
  - `SUBTRACKER_WEB_IMAGE` 配置

这种方式不需要你手工准备 `web-dist/`，直接拉前端镜像即可。

---

## 2. 一键安装脚本

### 2.1 最简单用法

```bash
curl -fsSL https://raw.githubusercontent.com/Smile-QWQ/SubTracker/main/scripts/install.sh | bash
```

脚本会交互式询问：

- 部署模式：`api` 或 `full`
- 部署目录
- `WEB_ORIGIN`
- 端口

然后自动下载对应 Release 资产并生成部署目录。

> 如果你外面还会再套一层 Nginx / 宝塔 / HTTPS 证书，`WEB_ORIGIN` 请填写**用户最终访问的地址**，例如：`https://subtracker.example.com`，不要填 `127.0.0.1` 或容器内部地址。

---

### 2.2 指定参数运行

#### API-only

```bash
curl -fsSL https://raw.githubusercontent.com/Smile-QWQ/SubTracker/main/scripts/install.sh | bash -s -- \
  --mode api \
  --dir /opt/subtracker-api \
  --web-origin https://subtracker.example.com
```

#### Full

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
--mode <api|full>        部署模式
--dir <path>             输出目录，默认 ./subtracker-<mode>
--release <tag|latest>   下载哪个 Release，默认 latest
--api-image <image>      API 镜像，默认 ghcr.io/smile-qwq/subtracker-api:latest
--api-port <port>        API 端口，默认 3001
--web-port <port>        Full 模式前端端口，默认 8080
--web-origin <origin>    WEB_ORIGIN
--log-level <level>      LOG_LEVEL，默认 warn
--force                  若目录已存在则覆盖
--yes                    非交互模式，直接使用默认值
```

---

## 3. 脚本执行后会得到什么

### 3.1 API-only

典型目录：

```text
subtracker-api/
  ├─ docker-compose.yml
  ├─ .env
  ├─ DEPLOYMENT.md
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

首次启动时，API 容器会自动检查并初始化数据库表结构。

> 注意：API-only 模式下，前端静态文件需要你自己放到 Nginx。

---

### 3.2 Full

典型目录：

```text
subtracker-full/
  ├─ docker-compose.full.yml
  ├─ .env
  ├─ DEPLOYMENT.md
  ├─ INSTALL-README.md
  ├─ data/
  │  └─ logos/
  └─ api.env.example
```

启动：

```bash
cd subtracker-full
docker compose -f docker-compose.full.yml pull
docker compose -f docker-compose.full.yml up -d
```

首次启动时，API 容器会自动检查并初始化数据库表结构。

默认访问：

- Web：`http://localhost:8080`
- API：由前端镜像内置 Nginx 反代到内部 `api:3001`

---

## 4. API-only 模式下的前端静态文件

如果你选的是 API-only，前端需要你自己放到外部 Nginx。

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

脚本会自动生成 `.env`，常见需要改的主要是这些：

```bash
SUBTRACKER_API_IMAGE=ghcr.io/smile-qwq/subtracker-api:latest
PORT=3001
HOST=0.0.0.0
DATABASE_URL=file:/app/data/subtracker.db
WEB_ORIGIN=https://subtracker.example.com
LOG_LEVEL=warn
```

Full 模式还会多一个：

```bash
WEB_PORT=8080
```

### `WEB_ORIGIN` 怎么填

这个值用于浏览器跨域校验（CORS），**应该填写前端最终访问地址**。

常见情况：

- 外层 Nginx + HTTPS 域名：

```bash
WEB_ORIGIN=https://subtracker.example.com
```

- 本机临时测试 Full 模式：

```bash
WEB_ORIGIN=http://localhost:8080
```

不要填这些：

- `http://127.0.0.1:3001`
- `http://api:3001`
- 容器内部地址
- 只给后端的监听地址

---

## 6. 反向代理 / SSL 说明

生产环境里，通常建议最外层再套一层 Nginx 处理：

- HTTPS 证书
- 域名访问
- 统一反向代理

这时可以按下面理解：

### API-only

- 前端静态文件：由外部 Nginx 托管
- API：反代到 `http://127.0.0.1:3001`
- `WEB_ORIGIN`：填外部 HTTPS 域名，例如 `https://subtracker.example.com`

### Full

- 用户访问：`https://subtracker.example.com`
- 外层 Nginx：反代到内部 `http://127.0.0.1:8080`
- Full 前端镜像内置 Nginx：再转发给 API 容器
- `WEB_ORIGIN`：仍然填 `https://subtracker.example.com`

一句话：**`WEB_ORIGIN` 永远填用户浏览器里真正打开的那个地址。**

---

## 7. 升级

### API-only

```bash
cd /你的部署目录
docker compose pull
docker compose up -d
```

### Full

```bash
cd /你的部署目录
docker compose -f docker-compose.full.yml pull
docker compose -f docker-compose.full.yml up -d
```

如果你升级的是 Full 模式，并且前端资源有变化，重新运行安装脚本覆盖目录即可：

```bash
curl -fsSL https://raw.githubusercontent.com/Smile-QWQ/SubTracker/main/scripts/install.sh | bash -s -- --mode full --force
```

---

## 8. 说明

- 这套部署流程是基于 **GitHub Release 现成产物**，不是源码编译部署
- 如果你只是想给别人快速试用，优先推荐：
  - 有自己 Nginx：用 `api`
  - 想少折腾：用 `full`
- 脚本只负责**下载并准备部署目录**，真正启动服务仍然需要你本机/服务器已安装 Docker / Docker Compose
