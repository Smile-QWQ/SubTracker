<p align="center">
  <img src="./apps/web/src/assets/brand-logo.png" alt="SubTracker Logo" width="112" />
</p>

<h1 align="center">SubTracker</h1>

<p align="center">
  Manage subscriptions, renewal reminders, budgets, logos, and Wallos migrations in one self-hosted dashboard.
</p>

<p align="center">
  <img src="https://img.shields.io/github/v/release/Smile-QWQ/SubTracker?style=flat-square" alt="GitHub release" />
  <img src="https://img.shields.io/github/stars/Smile-QWQ/SubTracker?style=flat-square" alt="GitHub stars" />
  <img src="https://img.shields.io/badge/License-GPLv3-blue.svg?style=flat-square" alt="License: GPL v3" />
</p>

<p align="center">
  <a href="./README.zh-CN.md">简体中文</a> ·
  <a href="#local-development">Local development</a> ·
  <a href="#deployment">Deployment</a> ·
  <a href="./DEPLOYMENT.md">Deployment guide</a> ·
  <a href="https://github.com/Smile-QWQ/SubTracker/releases">Releases</a>
</p>

> The current `main` branch ships with **Docker / Docker Compose** deployment. If you need **Cloudflare Worker serverless deployment**, use the [`lite`](https://github.com/Smile-QWQ/SubTracker/tree/lite) branch, where the Worker-specific workflows, deployment notes, and runtime adaptations are maintained.

## Quick Start

### Deploy with the install script

```bash
curl -fsSL https://raw.githubusercontent.com/Smile-QWQ/SubTracker/main/scripts/install.sh | bash
```

- **Full mode** is recommended for most users.
- The installer now asks you to choose **Simplified Chinese** or **English** at the start. You can still force it with `--lang zh` or `--lang en`.
- Release artifacts support both **x86** and **ARM**.
- See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for the full deployment flow.

### Run locally

```bash
npm install
npm run prisma:generate
npm run prisma:push
npm run prisma:seed
npm run dev
```

Default addresses:

- Web: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:3001`

Default credentials:

- Username: `admin`
- Password: `admin`

## Screenshots

### Dashboard

![Dashboard](./screenshot/仪表盘.png)

### More views

| Subscriptions | Spending |
| --- | --- |
| ![Subscriptions](./screenshot/订阅管理.png) | ![Spending](./screenshot/费用统计.png) |

| AI recognition | Wallos import |
| --- | --- |
| ![AI recognition](./screenshot/AI识别.png) | ![Wallos import](./screenshot/导入Wallos.png) |

## Features

- **Subscription management**: create, edit, renew, pause, disable, and restore subscriptions; review renewal history; and manage larger collections with tags, multi-tag filtering, custom ordering, search, bulk status updates, and bulk deletion.
- **Reminder rules**: define reminders before renewal, on the renewal day, and after expiration with the `days&time;` format; override defaults per subscription; and preview the resulting trigger schedule before saving.
- **Statistics and budgets**: normalize multi-currency subscriptions into a base currency, track spending totals and trends, inspect tag and status breakdowns, review the next 30 days of renewals, compare auto-renew ratios, and configure monthly, yearly, or per-tag budgets.
- **AI assistance**: extract subscription details from text or images into the form, and generate an AI summary on the statistics page.
- **Calendar and overview**: view subscriptions in a calendar, track upcoming renewals from a dedicated list, and use the dashboard for a consolidated overview.
- **Notifications**: send reminders through Webhook, SMTP / Resend email, PushPlus, Telegram Bot, ServerChan, Gotify, Bark, and NotifyX.
- **Logos and assets**: upload logos, reuse saved local logos, search online, and preserve or match logos during Wallos ZIP imports when possible.
- **Backup and migration**: import Wallos JSON, SQLite, and ZIP backups, and export, inspect, import, or restore native SubTracker ZIP backups.
- **Multi-currency tools**: maintain exchange-rate data, convert values into the base currency, and use the built-in currency converter.
- **Login and session controls**: support remember-me sessions, default-password change reminders, and rate limiting after repeated login failures.
- **Interface**: support Simplified Chinese and English, light, dark, and system themes, with a sticky desktop sidebar and independently scrollable content.

## Tech Stack

- **Frontend**: Vue 3, Vite, TypeScript, Naive UI, Pinia, TanStack Query, ECharts
- **Backend**: Fastify, Prisma, SQLite, Zod, node-cron

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Copy the API environment template

```bash
cp apps/api/.env.example apps/api/.env
```

### 3. Initialize the database

```bash
npm run prisma:generate
npm run prisma:push
npm run prisma:seed
```

### 4. Start the dev environment

```bash
npm run dev
```

After the first login, changing the default admin password is strongly recommended. Login attempts are rate-limited after too many failures.

## Useful Commands

```bash
npm run dev
npm run build
npm run lint
npm test
```

## Deployment

Use the install script for the smoothest setup:

```bash
curl -fsSL https://raw.githubusercontent.com/Smile-QWQ/SubTracker/main/scripts/install.sh | bash
```

The script downloads release artifacts, prepares the deployment directory, and lets you choose between:

- **Full deployment (`full`)**: deploy web and API together with the published frontend image
- **API-only deployment (`api`)**: deploy only the API container and host the web assets yourself

**Full deployment** is the recommended default.

On first startup, the API container initializes the SQLite schema automatically.

### Updating

For routine upgrades:

```bash
docker compose pull
docker compose up -d
```

If you use API-only mode, you also need to download and replace the extracted contents of `subtracker-web-dist.zip`.

You only need to rerun the install script when:

- deploying for the first time
- rebuilding the deployment directory
- switching between `api` and `full`
- adopting a newer deployment template or updated `.env` defaults

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for the complete guide.

## Release Artifacts

Each release currently provides:

- `subtracker-web-dist.zip`: frontend static assets
- `ghcr.io/smile-qwq/subtracker-api`: API Docker image
- `ghcr.io/smile-qwq/subtracker-web`: frontend image used in full deployment

All published images support both x86 and ARM architectures.

## License

This project is released under the **GNU General Public License v3.0 (GPLv3)**.

## Acknowledgements

Thanks to the following projects and ecosystems:

- [Wallos](https://github.com/ellite/Wallos) — migration reference and compatibility direction
- [Vue 3](https://vuejs.org/) and [Vite](https://vitejs.dev/) — frontend foundation
- [Naive UI](https://www.naiveui.com/) — UI components
- [Fastify](https://fastify.dev/) and [Prisma](https://www.prisma.io/) — backend and data access
- [Pinia](https://pinia.vuejs.org/), [TanStack Query](https://tanstack.com/query/latest), and [ECharts](https://echarts.apache.org/) — state, data fetching, and charts

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Smile-QWQ/SubTracker&type=Date)](https://www.star-history.com/?repos=Smile-QWQ%2FSubTracker&type=date&legend=top-left)
