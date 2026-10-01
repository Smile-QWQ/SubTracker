# SubTracker 部署说明

本项目目前提供的部署方式为 **Docker / Docker Compose**。如果你已经有可用的 Nginx，也可以直接复用它来托管前端静态文件并反代 API。

发布页已提供可直接部署的产物：

- `subtracker-web-dist.zip`：前端静态文件
- `ghcr.io/smile-qwq/subtracker-api`：API Docker 镜像
- `ghcr.io/smile-qwq/subtracker-web`：完整部署使用的前端 Docker 镜像

API 容器首次启动时会自动执行 Prisma `db push`，自动初始化或补齐 SQLite 表结构。

以上 Docker 镜像均支持 x86 / ARM 双架构，镜像名称与 tag 不需要区分；Docker 会根据宿主机架构自动拉取对应变体。

建议直接使用安装脚本：

```bash
curl -fsSL https://raw.githubusercontent.com/Smile-QWQ/SubTracker/main/scripts/install.sh | bash
```

脚本启动后会先询问使用 **中文** 还是 **English**；如果你希望跳过这一步，也可以用 `--lang zh` 或 `--lang en` 显式指定。

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
--lang <zh|en|auto>      安装脚本语言；交互模式下默认会先询问
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
        client_max_body_size 30m;
        proxy_read_timeout 120s;
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /api/v1/import/subtracker/inspect {
        # API enforces the configurable ZIP size limit; do not buffer uploads twice.
        client_max_body_size 0;
        client_body_timeout 300s;
        proxy_request_buffering off;
        proxy_read_timeout 1800s;
        proxy_send_timeout 300s;
        proxy_pass http://127.0.0.1:3001/api/v1/import/subtracker/inspect;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /api/v1/import/subtracker/commit {
        client_max_body_size 1m;
        proxy_read_timeout 1800s;
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/v1/settings/export/backup {
        access_log off;
        client_max_body_size 1m;
        proxy_buffering off;
        proxy_read_timeout 1800s;
        send_timeout 300s;
        proxy_pass http://127.0.0.1:3001;
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

图片备注单张上限仍为 20 MiB。原生备份直接上传 ZIP，不经过 base64；压缩包和解压总量默认分别限 2 GiB，可用下方环境变量调整。原生备份上传端点由 API 流式限长，其他图片 JSON 上传仍保留 30 MiB 的反代限制。完整部署的内置 Nginx 已配置；自建或外层反代也需同步上传限制、超时和关闭备份缓冲，避免在代理层重复暂存大文件。下载使用 60 秒有效、单次使用的票据，外层反代也应关闭 `/api/v1/settings/export/backup` 路径的访问日志，避免记录票据。生产环境应使用 HTTPS。

Docker 镜像将图片备注保存在 `/app/data/subscription-images`，沿用已有 `data/` 持久化挂载，不与公开 Logo 目录混放。本地开发默认保存在 `apps/api/storage/subscription-images`，如需自定义可设置 `SUBSCRIPTION_IMAGE_STORAGE_DIR`。Logo 默认位于固定的 `apps/api/storage/logos`（可通过 `LOGO_STORAGE_DIR` 覆盖），不受启动目录影响；Docker 中原有 Logo 挂载路径不变。

备份临时文件在 Docker 内使用 `/app/data/backup-temp`，无需新增挂载；开发默认使用 `apps/api/storage/backup-temp`。取消、恢复完成或预览过期（15 分钟）后会清理，重启后也会清扫过期残留。默认最多保留 2 个预览，临时 ZIP 总额度为单包上限的两倍；恢复还需为新图片预留磁盘空间，建议按“待恢复 ZIP + 解压后的资源”预留，原文件会在数据库事务成功后才删除。导出默认包含图片备注；取消勾选会生成明确标记的轻量包，不可替代完整备份。旧版 schema 1/2 ZIP 仍可恢复。

若本地 Logo 或图片备注文件缺失，导出会列出文件和关联订阅，需明确确认才能排除。仅导出副本中的缺失文件及引用会被移除，源数据不变；ZIP 文件名带 `incomplete`，新版恢复预览也会提示不完整。应优先检查挂载或补回文件；覆盖恢复不完整备份会删除目标实例原有的 Logo 和图片备注。

需要将数据恢复到 v0.11.0～v0.11.1 时，可选择「兼容旧版本导入」并确认提示。该模式导出 schema 1，保留订阅、文字备注、标签、付款、Logo、业务设置和排序，排除图片备注以及新版付款来源、账单备注等记录元数据，不修改当前数据。新增 AI 厂商预设映射为自定义；非 Chat Completions 协议的 AI 配置会在兼容副本中停用、清除 API Key 并还原默认连接配置，旧版恢复后需要重新配置。标准备份保留完整 AI 设置及付款元数据。旧版仅恢复被订阅引用的 Logo，不会恢复图库中未使用的 Logo。由于旧版 Base64 上传接口的请求体上限为 1 MiB，兼容 ZIP 保守限制为 750 KiB，超限会阻止导出；新版容量环境变量不能提高旧版接收能力。更早版本不保证兼容，建议另外保留包含图片的标准备份。

## 5. 核心环境变量

脚本会自动生成 `.env`，常见需要调整的字段如下：

```bash
SUBTRACKER_API_IMAGE=ghcr.io/smile-qwq/subtracker-api:latest
PORT=3001
HOST=0.0.0.0
DATABASE_URL=file:/app/data/subtracker.db
WEB_ORIGIN=https://subtracker.example.com
LOG_LEVEL=warn
DEFAULT_APP_LOCALE=zh-CN
```

说明：

- 以上列的是常见需要调整的字段；其余带默认值的配置通常保持默认即可
- 可选原生备份配置（单位均为 MiB；修改后重建容器）：

```bash
BACKUP_MAX_ARCHIVE_MIB=2048
BACKUP_MAX_EXPANDED_MIB=2048
# 留空时默认是压缩包上限的两倍
BACKUP_TEMP_MAX_MIB=
```

自定义临时目录使用 API 环境变量 `BACKUP_TEMP_DIR`，并自行确保该目录有足够空间和合适的访问权限；官方镜像默认目录无需改动。

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

## 6. 可选：部署 Apprise API

SubTracker 的 Apprise 通道依赖一个**独立部署的 Apprise API 服务**。它不是默认 compose 的强依赖，按需额外部署即可。

典型做法是单独准备一个目录，例如：

```text
apprise/
  ├─ docker-compose.yml
  └─ config/
```

一个最小可用的 `docker-compose.yml` 可以类似这样：

```yaml
services:
  apprise:
    image: caronc/apprise:latest
    container_name: apprise
    ports:
      - "8000:8000"
    environment:
      APPRISE_STATEFUL_MODE: simple
      APPRISE_WORKER_COUNT: "1"
      APPRISE_ADMIN: "y"
      TZ: Asia/Shanghai
    volumes:
      - ./config:/config
      - ./plugin:/plugin
      - ./attach:/attach
```

启动：

```bash
cd apprise
docker compose pull
docker compose up -d
```

然后在 SubTracker 的 **系统设置 → 通知设置 → Apprise** 中填写：

- `Apprise API Base URL`：
  - 如果 Apprise 和 SubTracker API 在**同一个 Docker Compose 网络**里，优先填服务名，例如 `http://apprise:8000`
  - 如果 Apprise 走的是外部反代 / 内网域名，就填 API 容器**实际能访问到**的地址，例如 `https://apprise.example.com`
  - **不要直接填 `127.0.0.1` / `localhost`**，因为对 Docker 里的 SubTracker API 来说，这只会指向 API 容器自己，不是宿主机或别的容器
- `Apprise Key`：你希望 SubTracker 使用的 stateful key
- `Ignore SSL`：仅在自签名 HTTPS 场景下按需开启

当前 Apprise 接入边界：

- SubTracker 维护 **通知地址列表**，并把配置同步到 Apprise API 的 stateful `KEY`
- 支持多个通知地址、每个地址单独启停、单地址测试和整体验证

---

## 7. 反向代理 / SSL 说明

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

## 8. 升级

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
