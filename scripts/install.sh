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
DEFAULT_SCRIPT_LANG="en"
DEPLOYMENT_DOC_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/blob/main/DEPLOYMENT.md"
SCRIPT_LANG="${SUBTRACKER_LANG:-auto}"

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

effective_lang() {
  local lang_candidate="${SCRIPT_LANG:-$DEFAULT_SCRIPT_LANG}"
  case "$lang_candidate" in
    zh|en) ;;
    *) lang_candidate="$DEFAULT_SCRIPT_LANG" ;;
  esac
  printf '%s' "$lang_candidate"
}

is_en() {
  [ "$(effective_lang)" = "en" ]
}

can_prompt() {
  [ "$NON_INTERACTIVE" != "true" ] && [ -r /dev/tty ] && [ -w /dev/tty ]
}

t() {
  local lang
  lang="$(effective_lang)"
  case "$lang:$1" in
    en:mode_full) printf '%s' 'Full deployment' ;;
    zh:mode_full) printf '%s' '完整部署' ;;
    en:mode_api) printf '%s' 'API-only deployment' ;;
    zh:mode_api) printf '%s' '仅后端部署' ;;
    en:missing_cmd) printf '%s' 'Missing required command: %s' ;;
    zh:missing_cmd) printf '%s' '缺少依赖命令：%s' ;;
    en:unknown_arg) printf '%s' 'Unknown argument: %s' ;;
    zh:unknown_arg) printf '%s' '未知参数：%s' ;;
    en:invalid_mode) printf '%s' '--mode only supports api or full, got: %s' ;;
    zh:invalid_mode) printf '%s' '--mode 仅支持 api 或 full，当前是：%s' ;;
    en:invalid_lang) printf '%s' '--lang only supports zh, en, or auto, got: %s' ;;
    zh:invalid_lang) printf '%s' '--lang 仅支持 zh、en 或 auto，当前是：%s' ;;
    en:invalid_lang_choice) printf '%s' 'Invalid choice. Please enter 1, 2, zh, or en.' ;;
    zh:invalid_lang_choice) printf '%s' '输入无效，请输入 1、2、zh 或 en。' ;;
    en:prompt_install_dir) printf '%s' 'Deployment directory (compose, .env, and data will be created here)' ;;
    zh:prompt_install_dir) printf '%s' '部署目录（脚本会在这里生成 compose、.env、data）' ;;
    en:prompt_api_port) printf '%s' 'Public API port (API-only deployment)' ;;
    zh:prompt_api_port) printf '%s' 'API 对外端口（仅后端部署）' ;;
    en:prompt_web_port) printf '%s' 'Public web port (full deployment)' ;;
    zh:prompt_web_port) printf '%s' '前端对外端口（完整部署）' ;;
    en:prompt_web_origin) printf '%s' 'Final web origin for browser access / CORS, for example https://subtracker.example.com' ;;
    zh:prompt_web_origin) printf '%s' '前端最终访问地址（用于浏览器跨域/CORS，例如 https://subtracker.example.com）' ;;
    en:need_http_client) printf '%s' 'Either curl or wget is required to download deployment files' ;;
    zh:need_http_client) printf '%s' '需要 curl 或 wget 才能下载部署文件' ;;
    en:dir_exists) printf '%s' 'Directory already exists: %s. Use --force to overwrite it.' ;;
    zh:dir_exists) printf '%s' '目录已存在：%s；如需覆盖请加 --force' ;;
    en:latest_release_unresolved) printf '%s' 'Failed to resolve the tag behind the latest Release' ;;
    zh:latest_release_unresolved) printf '%s' '无法解析 latest Release 对应的 tag' ;;
    en:downloading) printf '%s' 'Downloading: %s' ;;
    zh:downloading) printf '%s' '下载文件：%s' ;;
    en:env_template_missing) printf '%s' 'API environment template not found: %s' ;;
    zh:env_template_missing) printf '%s' '未找到 API 环境变量模板：%s' ;;
    *) printf '%s' "$1" ;;
  esac
}

mode_label() {
  if [ "${1:-$MODE}" = "full" ]; then
    t mode_full
  else
    t mode_api
  fi
}

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
  if is_en; then
    cat <<'EOF'
SubTracker deployment installer

Usage:
  curl -fsSL https://raw.githubusercontent.com/Smile-QWQ/SubTracker/main/scripts/install.sh | bash
  curl -fsSL https://raw.githubusercontent.com/Smile-QWQ/SubTracker/main/scripts/install.sh | bash -s -- --mode full --dir /opt/subtracker --lang en

Options:
  --mode <api|full>        Deployment mode: api = API-only, full = full deployment
  --dir <path>             Deployment directory, default: ./subtracker-<mode>
  --release <tag|latest>   Release tag to use, default: latest
  --api-image <image>      API image, default: ghcr.io/smile-qwq/subtracker-api:latest
  --web-image <image>      Web image for full deployment, default: ghcr.io/smile-qwq/subtracker-web:latest
  --api-port <port>        Public API port; in full mode the API still defaults to internal port 3001
  --web-port <port>        Public web port for full deployment, default: 8080
  --web-origin <origin>    Final web origin for CORS, for example https://subtracker.example.com
  --log-level <level>      API log level, default: warn
  --lang <zh|en|auto>      Installer language; auto prompts first when interactive
  --force                  Overwrite the target directory if it already exists
  --yes                    Non-interactive mode, use defaults for missing values
  --help                   Show help
EOF
  else
    cat <<'EOF'
SubTracker deployment installer

Usage:
  curl -fsSL https://raw.githubusercontent.com/Smile-QWQ/SubTracker/main/scripts/install.sh | bash
  curl -fsSL https://raw.githubusercontent.com/Smile-QWQ/SubTracker/main/scripts/install.sh | bash -s -- --mode full --dir /opt/subtracker --lang zh

Options:
  --mode <api|full>        部署方式：api=仅后端部署；full=完整部署
  --dir <path>             部署目录，默认 ./subtracker-<mode>
  --release <tag|latest>   使用哪个 Release，默认 latest
  --api-image <image>      API 镜像，默认 ghcr.io/smile-qwq/subtracker-api:latest
  --web-image <image>      完整部署的前端镜像，默认 ghcr.io/smile-qwq/subtracker-web:latest
  --api-port <port>        API 端口；仅后端部署会对外暴露，完整部署默认内部使用 3001
  --web-port <port>        完整部署前端对外端口，默认 8080
  --web-origin <origin>    前端最终访问地址（用于 CORS），例如 https://subtracker.example.com
  --log-level <level>      API 日志级别，默认 warn
  --lang <zh|en|auto>      安装脚本语言；交互模式下 auto 会先询问
  --force                  若目录已存在则覆盖
  --yes                    非交互模式，缺省值直接使用默认值
  --help                   显示帮助
EOF
  fi
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "$(printf "$(t missing_cmd)" "$1")"
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
      --lang)
        SCRIPT_LANG="${2:-}"
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
        fail "$(printf "$(t unknown_arg)" "$1")"
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

  if ! can_prompt; then
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

select_language() {
  case "$SCRIPT_LANG" in
    zh|en) return 0 ;;
    auto|'') ;;
    *) fail "$(printf "$(t invalid_lang)" "$SCRIPT_LANG")" ;;
  esac

  if ! can_prompt; then
    SCRIPT_LANG="$DEFAULT_SCRIPT_LANG"
    return 0
  fi

  while true; do
    cat > /dev/tty <<'EOF'

Select installer language / 请选择安装语言:
  1) 简体中文
  2) English

EOF
    printf 'Language [1/2] (default: 2): ' > /dev/tty
    local answer=""
    IFS= read -r answer < /dev/tty || true
    case "${answer:-2}" in
      1|zh|ZH|zh-CN|zh-cn)
        SCRIPT_LANG="zh"
        return 0
        ;;
      2|en|EN|en-US|en-us)
        SCRIPT_LANG="en"
        return 0
        ;;
      *)
        printf '%s / %s\n' "$(t invalid_lang_choice)" "$(SCRIPT_LANG=zh; t invalid_lang_choice)" > /dev/tty
        ;;
    esac
  done
}

select_mode() {
  if [ -n "$MODE" ]; then
    return 0
  fi

  if ! can_prompt; then
    MODE="full"
    return 0
  fi

  if is_en; then
    cat > /dev/tty <<'EOF'

Choose a deployment mode:
  api  = API-only deployment
         You host the frontend assets yourself with Nginx, aaPanel, or another static site setup.

  full = Full deployment
         Deploy frontend and backend together with the published web image.

EOF
    printf 'Enter deployment mode [api/full] (default: full): ' > /dev/tty
  else
    cat > /dev/tty <<'EOF'

请选择部署方式：
  api  = 仅后端部署
         前端静态文件需要你自己放到 Nginx / 宝塔 / 站点目录

  full = 完整部署
         前端 + 后端一起部署，直接使用前端镜像

EOF
    printf '请输入部署方式 [api/full]（默认 full）: ' > /dev/tty
  fi
  local answer=""
  IFS= read -r answer < /dev/tty || true
  MODE="${answer:-full}"
}

normalize_inputs() {
  case "$SCRIPT_LANG" in
    auto|zh|en|'') ;;
    *) fail "$(printf "$(t invalid_lang)" "$SCRIPT_LANG")" ;;
  esac

  select_language
  select_mode
  case "$MODE" in
    api|full) ;;
    *) fail "$(printf "$(t invalid_mode)" "$MODE")" ;;
  esac

  if [ -z "$INSTALL_DIR" ]; then
    INSTALL_DIR="$(prompt_value "$(t prompt_install_dir)" "./subtracker-${MODE}" "$INSTALL_DIR")"
  fi

  if [ "$MODE" = "api" ]; then
    API_PORT="$(prompt_value "$(t prompt_api_port)" "$DEFAULT_API_PORT" "$API_PORT")"
  else
    API_PORT="${API_PORT:-$DEFAULT_API_PORT}"
    WEB_PORT="$(prompt_value "$(t prompt_web_port)" "$DEFAULT_WEB_PORT" "$WEB_PORT")"
  fi

  if [ -z "$WEB_ORIGIN" ]; then
    WEB_ORIGIN="$(prompt_value "$(t prompt_web_origin)" 'https://subtracker.example.com' "$WEB_ORIGIN")"
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
    fail "$(t need_http_client)"
  fi
}

prepare_dir() {
  if [ -e "$INSTALL_DIR" ]; then
    if [ "$FORCE" = "true" ]; then
      rm -rf "$INSTALL_DIR"
    else
      fail "$(printf "$(t dir_exists)" "$INSTALL_DIR")"
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
  [ -n "$RESOLVED_REF" ] || fail "$(t latest_release_unresolved)"
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
  info "$(printf "$(t downloading)" "$url")"
  mkdir -p "$(dirname "$target_path")"
  http_get "$url" "$target_path"
}

write_env_file() {
  local template_file="$INSTALL_DIR/api.env.example"
  local env_file="$INSTALL_DIR/.env"

  if [ ! -f "$template_file" ]; then
    fail "$(printf "$(t env_template_missing)" "$template_file")"
  fi

  cp "$template_file" "$env_file"

  upsert_env_value "$env_file" "SUBTRACKER_API_IMAGE" "$API_IMAGE"
  upsert_env_value "$env_file" "PORT" "$API_PORT"
  upsert_env_value "$env_file" "HOST" "0.0.0.0"
  upsert_env_value "$env_file" "DATABASE_URL" "file:/app/data/subtracker.db"
  upsert_env_value "$env_file" "WEB_ORIGIN" "$WEB_ORIGIN"
  upsert_env_value "$env_file" "LOG_LEVEL" "$LOG_LEVEL"

  if [ "$MODE" = "full" ]; then
    upsert_env_value "$env_file" "SUBTRACKER_WEB_IMAGE" "$WEB_IMAGE"
    upsert_env_value "$env_file" "WEB_PORT" "$WEB_PORT"
  fi
}

upsert_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"
  local tmp_file="${file}.tmp"

  awk -v key="$key" -v value="$value" '
    BEGIN { updated = 0 }
    index($0, key "=") == 1 {
      print key "=" value
      updated = 1
      next
    }
    { print }
    END {
      if (!updated) {
        print key "=" value
      }
    }
  ' "$file" > "$tmp_file"

  mv "$tmp_file" "$file"
}

write_readme() {
  local compose_file="docker-compose.yml"
  local pull_cmd='docker compose pull'
  local up_cmd='docker compose up -d'
  local logs_cmd='docker compose logs -f api'
  local mode_display
  mode_display="$(mode_label)"

  if [ "$MODE" = "full" ]; then
    compose_file='docker-compose.yml'
  fi

  if is_en; then
    cat > "$INSTALL_DIR/INSTALL-README.md" <<EOF
# SubTracker ${mode_display} directory

This directory was generated automatically by the installer.

## Prepared files

- ${compose_file}
- .env
- data/
- data/logos/
EOF

    if [ "$MODE" = "full" ]; then
      cat >> "$INSTALL_DIR/INSTALL-README.md" <<EOF
- Web image for full deployment: ${WEB_IMAGE}
EOF
    else
      cat >> "$INSTALL_DIR/INSTALL-README.md" <<EOF

## Frontend static assets

- Download and host them yourself
- Asset: subtracker-web-dist.zip
- Download URL: $(release_asset_url 'subtracker-web-dist.zip')
EOF
    fi

    cat >> "$INSTALL_DIR/INSTALL-README.md" <<EOF

## WEB_ORIGIN

Set WEB_ORIGIN to the final browser-facing address, for example:

- https://subtracker.example.com

EOF

    if [ "$MODE" = "api" ]; then
      cat >> "$INSTALL_DIR/INSTALL-README.md" <<EOF
Typical API-only deployment flow:

- Browser -> https://your-domain.example
- Outer Nginx -> http://127.0.0.1:${API_PORT} (API)
- Frontend static assets -> hosted by your own Nginx

EOF
    else
      cat >> "$INSTALL_DIR/INSTALL-README.md" <<EOF
Typical full deployment flow:

- Browser -> https://your-domain.example
- Outer Nginx -> http://127.0.0.1:${WEB_PORT}
- Built-in web container -> API container

EOF
    fi

    cat >> "$INSTALL_DIR/INSTALL-README.md" <<EOF

## Start

    cd ${INSTALL_DIR}
    ${pull_cmd}
    ${up_cmd}

## Default login

- Username: admin
- Password: admin

Change the default password after the first login. The app also reminds you to do so.

## Logs

    cd ${INSTALL_DIR}
    ${logs_cmd}

## Upgrade

    cd ${INSTALL_DIR}
    ${pull_cmd}
    ${up_cmd}
EOF

    if [ "$MODE" = "api" ]; then
      cat >> "$INSTALL_DIR/INSTALL-README.md" <<EOF

When upgrading an API-only deployment, you also need to download the latest subtracker-web-dist.zip and replace the hosted frontend files.
EOF
    fi
    return 0
  fi

  cat > "$INSTALL_DIR/INSTALL-README.md" <<EOF
# SubTracker ${mode_display}目录

此目录由安装脚本自动生成。

## 已准备好的文件

- ${compose_file}
- .env
- data/
- data/logos/
EOF

  if [ "$MODE" = "full" ]; then
    cat >> "$INSTALL_DIR/INSTALL-README.md" <<EOF
- 完整部署前端镜像：${WEB_IMAGE}
EOF
  else
    cat >> "$INSTALL_DIR/INSTALL-README.md" <<EOF

## 前端静态文件

- 需要你自行下载并放到站点目录
- 资产：subtracker-web-dist.zip
- 下载地址：$(release_asset_url 'subtracker-web-dist.zip')
EOF
  fi

  cat >> "$INSTALL_DIR/INSTALL-README.md" <<EOF

## WEB_ORIGIN

WEB_ORIGIN 请填写用户最终访问地址，例如：

- https://subtracker.example.com

EOF

  if [ "$MODE" = "api" ]; then
    cat >> "$INSTALL_DIR/INSTALL-README.md" <<EOF
仅后端部署常见链路：

- 浏览器 -> https://你的域名
- 外层 Nginx -> http://127.0.0.1:${API_PORT} （API）
- 前端静态文件 -> 由你自己的 Nginx 托管

EOF
  else
    cat >> "$INSTALL_DIR/INSTALL-README.md" <<EOF
完整部署常见链路：

- 浏览器 -> https://你的域名
- 外层 Nginx -> http://127.0.0.1:${WEB_PORT}
- 完整部署自带 Nginx -> API 容器

EOF
  fi

  cat >> "$INSTALL_DIR/INSTALL-README.md" <<EOF

## 启动

    cd ${INSTALL_DIR}
    ${pull_cmd}
    ${up_cmd}

## 默认登录

- 用户名：admin
- 密码：admin

首次登录后建议立即修改默认密码；系统会在登录后提示修改默认密码。

## 查看日志

    cd ${INSTALL_DIR}
    ${logs_cmd}

## 升级

    cd ${INSTALL_DIR}
    ${pull_cmd}
    ${up_cmd}
EOF

  if [ "$MODE" = "api" ]; then
    cat >> "$INSTALL_DIR/INSTALL-README.md" <<EOF

仅后端部署升级时，还需要把最新的 subtracker-web-dist.zip 重新下载并覆盖到站点目录。
EOF
  fi
}

download_deployment_files() {
  download_repo_file "apps/api/.env.example" "$INSTALL_DIR/api.env.example"

  if [ "$MODE" = "full" ]; then
    download_repo_file "docker-compose.full.yml" "$INSTALL_DIR/docker-compose.yml"
  else
    download_repo_file "docker-compose.yml" "$INSTALL_DIR/docker-compose.yml"
  fi
}

show_summary() {
  local compose_cmd='docker compose'

  printf '\n'
  if is_en; then
    info "Deployment directory created: $INSTALL_DIR"
    info "Deployment mode: $(mode_label)"
    info "Release version: $(resolve_repo_ref)"
    info "Next steps:"

    printf '\n'
    printf '1) Enter the deployment directory and review .env\n'
    printf '   cd %s\n' "$INSTALL_DIR"
    printf '   Edit .env as needed\n'

    printf '\n'
    printf '2) Pull images and start the stack\n'
    printf '   %s pull\n' "$compose_cmd"
    printf '   %s up -d\n' "$compose_cmd"
    printf '   On first startup, the API container initializes the SQLite schema automatically\n'

    printf '\n'
    printf '   Default login: admin / admin\n'
    printf '   Change the default password after the first login\n'

    printf '\n'
    printf '3) View logs\n'
    printf '   %s logs -f api\n' "$compose_cmd"

    if [ "$MODE" = "api" ]; then
      printf '\n'
      info "Frontend static assets: $(release_asset_url 'subtracker-web-dist.zip')"
    else
      printf '\n'
      info "Web image: $WEB_IMAGE"
    fi

    printf '\n'
    info "Detailed notes: $INSTALL_DIR/INSTALL-README.md"
    info "Online deployment guide: $DEPLOYMENT_DOC_URL"
    return 0
  fi

  info "部署目录已生成：$INSTALL_DIR"
  info "部署方式：$(mode_label)"
  info "Release 版本：$(resolve_repo_ref)"
  info "下一步："

  printf '\n'
  printf '1) 进入部署目录并检查 .env\n'
  printf '   cd %s\n' "$INSTALL_DIR"
  printf '   按需修改 .env\n'

  printf '\n'
  printf '2) 拉取镜像并启动\n'
  printf '   %s pull\n' "$compose_cmd"
  printf '   %s up -d\n' "$compose_cmd"
  printf '   首次启动时，API 容器会自动初始化 SQLite 数据库表结构\n'

  printf '\n'
  printf '   默认登录账号：admin / admin\n'
  printf '   首次登录后建议立即修改默认密码\n'

  printf '\n'
  printf '3) 查看日志\n'
  printf '   %s logs -f api\n' "$compose_cmd"

  if [ "$MODE" = "api" ]; then
    printf '\n'
    info "前端静态文件：$(release_asset_url 'subtracker-web-dist.zip')"
  else
    printf '\n'
    info "前端镜像：$WEB_IMAGE"
  fi

  printf '\n'
  info "更详细的说明见：$INSTALL_DIR/INSTALL-README.md"
  info "在线部署文档：$DEPLOYMENT_DOC_URL"
}

main() {
  parse_args "$@"
  normalize_inputs
  need_cmd mkdir
  need_cmd rm
  prepare_dir
  download_deployment_files
  write_env_file
  write_readme
  show_summary
}

main "$@"
