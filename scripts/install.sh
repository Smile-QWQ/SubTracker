#!/usr/bin/env bash
set -euo pipefail

REPO_OWNER="Smile-QWQ"
REPO_NAME="SubTracker"
DEFAULT_RELEASE_TAG="latest"
DEFAULT_API_IMAGE="ghcr.io/smile-qwq/subtracker-api:latest"
DEFAULT_WEB_IMAGE="ghcr.io/smile-qwq/subtracker-web:latest"
DEFAULT_API_PORT="3001"
DEFAULT_WEB_PORT="8080"
DEFAULT_LOG_LEVEL="warn"
DEPLOYMENT_DOC_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/blob/main/DEPLOYMENT.md"

MODE=""
INSTALL_DIR=""
RELEASE_TAG="${DEFAULT_RELEASE_TAG}"
API_IMAGE="${DEFAULT_API_IMAGE}"
WEB_IMAGE="${DEFAULT_WEB_IMAGE}"
API_PORT=""
WEB_PORT=""
WEB_ORIGIN=""
LOG_LEVEL="${DEFAULT_LOG_LEVEL}"
NON_INTERACTIVE="false"
FORCE="false"
RESOLVED_REF=""

info() {
  printf '[INFO] %s\n' "$*"
}

warn() {
  printf '[WARN] %s\n' "$*" >&2
}

fail() {
  printf '[ERROR] %s\n' "$*" >&2
  exit 1
}

print_help() {
  cat <<'EOF'
SubTracker deployment installer

Usage:
  curl -fsSL https://raw.githubusercontent.com/Smile-QWQ/SubTracker/main/scripts/install.sh | bash
  curl -fsSL https://raw.githubusercontent.com/Smile-QWQ/SubTracker/main/scripts/install.sh | bash -s -- --mode full --dir /opt/subtracker

Options:
  --mode <api|full>        部署方式：api=只部署后端；full=前端+后端一起部署
  --dir <path>             部署目录，默认 ./subtracker-<mode>
  --release <tag|latest>   使用哪个 Release，默认 latest
  --api-image <image>      API 镜像，默认 ghcr.io/smile-qwq/subtracker-api:latest
  --web-image <image>      Full 模式前端镜像，默认 ghcr.io/smile-qwq/subtracker-web:latest
  --api-port <port>        API 端口；api 模式会对外暴露，full 模式默认内部使用 3001
  --web-port <port>        Full 模式前端对外端口，默认 8080
  --web-origin <origin>    前端最终访问地址（用于 CORS），例如 https://subtracker.example.com
  --log-level <level>      API 日志级别，默认 warn
  --force                  若目录已存在则覆盖
  --yes                    非交互模式，缺省值直接使用默认值
  --help                   显示帮助
EOF
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "缺少依赖命令：$1"
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --mode)
        MODE="${2:-}"
        shift 2
        ;;
      --dir)
        INSTALL_DIR="${2:-}"
        shift 2
        ;;
      --release)
        RELEASE_TAG="${2:-}"
        shift 2
        ;;
      --api-image)
        API_IMAGE="${2:-}"
        shift 2
        ;;
      --web-image)
        WEB_IMAGE="${2:-}"
        shift 2
        ;;
      --api-port)
        API_PORT="${2:-}"
        shift 2
        ;;
      --web-port)
        WEB_PORT="${2:-}"
        shift 2
        ;;
      --web-origin)
        WEB_ORIGIN="${2:-}"
        shift 2
        ;;
      --log-level)
        LOG_LEVEL="${2:-}"
        shift 2
        ;;
      --force)
        FORCE="true"
        shift
        ;;
      --yes)
        NON_INTERACTIVE="true"
        shift
        ;;
      --help|-h)
        print_help
        exit 0
        ;;
      *)
        fail "未知参数：$1"
        ;;
    esac
  done
}

prompt_value() {
  local label="$1"
  local default_value="$2"
  local current_value="${3:-}"

  if [ -n "$current_value" ]; then
    printf '%s' "$current_value"
    return 0
  fi

  if [ "$NON_INTERACTIVE" = "true" ] || [ ! -r /dev/tty ]; then
    printf '%s' "$default_value"
    return 0
  fi

  local answer
  printf '%s [%s]: ' "$label" "$default_value" > /dev/tty
  IFS= read -r answer < /dev/tty || true
  if [ -z "$answer" ]; then
    printf '%s' "$default_value"
  else
    printf '%s' "$answer"
  fi
}

select_mode() {
  if [ -n "$MODE" ]; then
    return 0
  fi

  if [ "$NON_INTERACTIVE" = "true" ] || [ ! -r /dev/tty ]; then
    MODE="full"
    return 0
  fi

  cat > /dev/tty <<'EOF'

请选择部署方式：
  api  = 只部署后端 API
         前端静态文件需要你自己放到 Nginx / 宝塔 / 站点目录

  full = 前端 + 后端一起部署
         直接使用前端镜像，不需要手工准备 web-dist

EOF
  printf '请输入部署方式 [api/full]（默认 full）: ' > /dev/tty
  local answer=""
  IFS= read -r answer < /dev/tty || true
  MODE="${answer:-full}"
}

normalize_inputs() {
  select_mode
  case "$MODE" in
    api|full) ;;
    *) fail "--mode 仅支持 api 或 full，当前是：$MODE" ;;
  esac

  if [ -z "$INSTALL_DIR" ]; then
    INSTALL_DIR="$(prompt_value '部署目录（脚本会在这里生成 compose、.env、data）' "./subtracker-${MODE}" "$INSTALL_DIR")"
  fi

  if [ "$MODE" = "api" ]; then
    API_PORT="$(prompt_value 'API 对外端口（API-only 模式）' "$DEFAULT_API_PORT" "$API_PORT")"
  else
    API_PORT="${API_PORT:-$DEFAULT_API_PORT}"
    WEB_PORT="$(prompt_value '前端对外端口（Full 模式）' "$DEFAULT_WEB_PORT" "$WEB_PORT")"
  fi

  if [ -z "$WEB_ORIGIN" ]; then
    WEB_ORIGIN="$(prompt_value '前端最终访问地址（用于浏览器跨域/CORS，例如 https://subtracker.example.com）' 'https://subtracker.example.com' "$WEB_ORIGIN")"
  fi
}

http_get() {
  local url="$1"
  local output="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$output"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$output" "$url"
  else
    fail '需要 curl 或 wget 才能下载部署文件'
  fi
}

prepare_dir() {
  if [ -e "$INSTALL_DIR" ]; then
    if [ "$FORCE" = "true" ]; then
      rm -rf "$INSTALL_DIR"
    else
      fail "目录已存在：$INSTALL_DIR；如需覆盖请加 --force"
    fi
  fi

  mkdir -p "$INSTALL_DIR/data/logos"
}

release_asset_url() {
  local asset_name="$1"
  if [ "$RELEASE_TAG" = "latest" ]; then
    printf 'https://github.com/%s/%s/releases/latest/download/%s' "$REPO_OWNER" "$REPO_NAME" "$asset_name"
  else
    printf 'https://github.com/%s/%s/releases/download/%s/%s' "$REPO_OWNER" "$REPO_NAME" "$RELEASE_TAG" "$asset_name"
  fi
}

resolve_repo_ref() {
  if [ -n "$RESOLVED_REF" ]; then
    printf '%s' "$RESOLVED_REF"
    return 0
  fi

  if [ "$RELEASE_TAG" != "latest" ]; then
    RESOLVED_REF="$RELEASE_TAG"
    printf '%s' "$RESOLVED_REF"
    return 0
  fi

  local metadata_url="https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest"
  local metadata_file="$INSTALL_DIR/.release.json"
  http_get "$metadata_url" "$metadata_file"

  if command -v python3 >/dev/null 2>&1; then
    RESOLVED_REF="$(python3 - <<PY
import json
from pathlib import Path
data = json.loads(Path(r'''$metadata_file''').read_text(encoding='utf-8'))
print(data.get('tag_name', ''))
PY
)"
  elif command -v python >/dev/null 2>&1; then
    RESOLVED_REF="$(python - <<PY
import json
from pathlib import Path
data = json.loads(Path(r'''$metadata_file''').read_text(encoding='utf-8'))
print(data.get('tag_name', ''))
PY
)"
  else
    RESOLVED_REF="$(sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$metadata_file" | head -n 1)"
  fi

  rm -f "$metadata_file"
  [ -n "$RESOLVED_REF" ] || fail '无法解析 latest Release 对应的 tag'
  printf '%s' "$RESOLVED_REF"
}

raw_file_url() {
  local file_path="$1"
  local ref
  ref="$(resolve_repo_ref)"
  printf 'https://raw.githubusercontent.com/%s/%s/%s/%s' "$REPO_OWNER" "$REPO_NAME" "$ref" "$file_path"
}

download_repo_file() {
  local repo_path="$1"
  local target_path="$2"
  local url
  url="$(raw_file_url "$repo_path")"
  info "下载文件：$url"
  mkdir -p "$(dirname "$target_path")"
  http_get "$url" "$target_path"
}

write_env_file() {
  {
    printf 'SUBTRACKER_API_IMAGE=%s\n' "$API_IMAGE"
    printf 'PORT=%s\n' "$API_PORT"
    printf 'HOST=0.0.0.0\n'
    printf 'DATABASE_URL=file:/app/data/subtracker.db\n'
    printf 'WEB_ORIGIN=%s\n' "$WEB_ORIGIN"
    printf 'LOG_LEVEL=%s\n' "$LOG_LEVEL"
    if [ "$MODE" = "full" ]; then
      printf 'SUBTRACKER_WEB_IMAGE=%s\n' "$WEB_IMAGE"
      printf 'WEB_PORT=%s\n' "$WEB_PORT"
    fi
  } > "$INSTALL_DIR/.env"
}

write_readme() {
  local compose_file="docker-compose.yml"
  local pull_cmd='docker compose pull'
  local up_cmd='docker compose up -d'
  local logs_cmd='docker compose logs -f api'

  if [ "$MODE" = "full" ]; then
    compose_file='docker-compose.full.yml'
    pull_cmd='docker compose -f docker-compose.full.yml pull'
    up_cmd='docker compose -f docker-compose.full.yml up -d'
    logs_cmd='docker compose -f docker-compose.full.yml logs -f api'
  fi

  cat > "$INSTALL_DIR/INSTALL-README.md" <<EOF
# SubTracker ${MODE} 部署目录

此目录由 install.sh 自动生成。

## 已准备好的内容

- ${compose_file}
- .env
- data/
- data/logos/
EOF

  if [ "$MODE" = "full" ]; then
    cat >> "$INSTALL_DIR/INSTALL-README.md" <<EOF
- Full 模式前端镜像：${WEB_IMAGE}
EOF
  else
    cat >> "$INSTALL_DIR/INSTALL-README.md" <<EOF

## 你还需要自行处理的内容

当前是 API-only 模式，脚本**不会**帮你托管前端静态文件。
请把 SubTracker 前端静态文件部署到你自己的 Nginx：

- Release 资产：subtracker-web-dist.zip
- 下载地址：$(release_asset_url 'subtracker-web-dist.zip')

你可以把它解压到你的 Nginx 网站根目录，然后按在线部署文档里的反代配置把 /api/ 和 /static/logos/ 转给 API：

- ${DEPLOYMENT_DOC_URL}
EOF
  fi

  cat >> "$INSTALL_DIR/INSTALL-README.md" <<EOF

## 反代 / SSL 说明

- 如果你外层还会再套一层 Nginx / 宝塔 / HTTPS 证书：
  - WEB_ORIGIN 请填写用户最终访问地址
  - 例如：https://subtracker.example.com
- 不要把 WEB_ORIGIN 填成：
  - http://127.0.0.1:${API_PORT}
  - http://api:${API_PORT}
  - 容器内部地址

EOF

  if [ "$MODE" = "api" ]; then
    cat >> "$INSTALL_DIR/INSTALL-README.md" <<EOF
API-only 模式常见链路：

- 浏览器 -> https://你的域名
- 外层 Nginx -> http://127.0.0.1:${API_PORT} （API）
- 前端静态文件 -> 由你自己的 Nginx 托管

EOF
  else
    cat >> "$INSTALL_DIR/INSTALL-README.md" <<EOF
Full 模式常见链路：

- 浏览器 -> https://你的域名
- 外层 Nginx -> http://127.0.0.1:${WEB_PORT}
- Full 自带 Nginx -> API 容器

EOF
  fi

  cat >> "$INSTALL_DIR/INSTALL-README.md" <<EOF

## 启动

    cd ${INSTALL_DIR}
    ${pull_cmd}
    ${up_cmd}

## 查看日志

    cd ${INSTALL_DIR}
    ${logs_cmd}
EOF
}

download_deployment_files() {
  download_repo_file "apps/api/.env.example" "$INSTALL_DIR/api.env.example"

  if [ "$MODE" = "full" ]; then
    download_repo_file "docker-compose.full.yml" "$INSTALL_DIR/docker-compose.full.yml"
  else
    download_repo_file "docker-compose.yml" "$INSTALL_DIR/docker-compose.yml"
  fi
}

show_summary() {
  local compose_cmd='docker compose'

  if [ "$MODE" = "full" ]; then
    compose_cmd='docker compose -f docker-compose.full.yml'
  fi

  printf '\n'
  info "部署目录已生成：$INSTALL_DIR"
  info "部署模式：$MODE"
  info "Release 版本：$(resolve_repo_ref)"
  info "安装脚本已执行完成，建议按下面步骤继续："

  printf '\n'
  printf '1) 进入部署目录并检查环境变量\n'
  printf '   cd %s\n' "$INSTALL_DIR"
  printf '   查看并按需修改 .env\n'

  printf '\n'
  printf '2) 拉取镜像并启动\n'
  printf '   %s pull\n' "$compose_cmd"
  printf '   %s up -d\n' "$compose_cmd"
  printf '   首次启动时，API 容器会自动初始化 SQLite 数据库表结构\n'

  printf '\n'
  printf '3) 查看日志\n'
  printf '   %s logs -f api\n' "$compose_cmd"

  if [ "$MODE" = "api" ]; then
    printf '\n'
    warn '当前是 API-only 模式：前端静态文件需要你自己放到 Nginx。'
    warn "可直接下载：$(release_asset_url 'subtracker-web-dist.zip')"
    warn '你还需要做这两件事：'
    warn '  1. 把 subtracker-web-dist.zip 解压到你的 Nginx 网站根目录'
    warn "  2. 按部署文档的示例，把 /api/ 和 /static/logos/ 反代到 API：$DEPLOYMENT_DOC_URL"
  else
    printf '\n'
    info "Full 模式会直接使用前端镜像：$WEB_IMAGE"
    info "如果你外层还会再套一层 Nginx / HTTPS，请把它反代到 http://127.0.0.1:$WEB_PORT"
  fi

  printf '\n'
  info "如果使用反向代理 / SSL，WEB_ORIGIN 应填写用户最终访问地址，例如 https://subtracker.example.com"
  info "更详细的说明见：$INSTALL_DIR/INSTALL-README.md"
  info "在线部署文档：$DEPLOYMENT_DOC_URL"
}

main() {
  parse_args "$@"
  need_cmd mkdir
  need_cmd rm
  normalize_inputs
  prepare_dir
  download_deployment_files
  write_env_file
  write_readme
  show_summary
}

main "$@"
