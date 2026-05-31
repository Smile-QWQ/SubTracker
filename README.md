<p align="center">
  <img src="./apps/web/src/assets/brand-logo.png" alt="SubTracker Lite" width="112" />
</p>

<h1 align="center">SubTracker Lite</h1>

<p align="center">
  A self-hosted subscription manager for multi-currency subscriptions, renewal reminders, budget overviews, logo assets, and Wallos migrations on Cloudflare Workers.
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

> The current `lite` branch targets **Cloudflare Workers only**. If you need **Docker / Docker Compose** deployment, use the [`main`](https://github.com/Smile-QWQ/SubTracker/tree/main) branch, where the Node/SQLite runtime, workflows, and deployment notes are maintained.

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

- **Subscription management**: create, edit, renew, pause, disable, review records, and reorder subscriptions.
- **Reminder rules**: define flexible `days&time;` rules for upcoming, due-today, and overdue reminders, with minute-level scans.
- **Tags**: classify subscriptions with multiple tags, filter by tags, and manage tag ordering.
- **Budgets**: track global monthly and yearly budgets from the dashboard.
- **Statistics**: review spending overview, status distribution, currency distribution, top subscriptions, and AI summaries.
- **Multi-currency support**: maintain exchange-rate snapshots, normalize into a base currency, and use the built-in currency converter.
- **Notifications**: send reminders through Webhook, SMTP / Resend email, PushPlus, Telegram Bot, ServerChan, Gotify, Bark, NotifyX, and Apprise.
- **Logo handling**: upload logos to R2, reuse remote references, and search for logos online.
- **AI recognition**: extract subscription details from text or images and fill the form automatically.
- **Wallos import**: import Wallos JSON, SQLite, and ZIP backups; SQLite / ZIP files are parsed in the browser before being persisted by the Worker.
- **Login experience**: support remember-me sessions, configurable session retention, default-password change reminders, and login rate limiting.

## Lite Branch Notes

This branch is optimized for **Cloudflare Worker Free**, so a few features are intentionally trimmed or adapted:

- Hot statistics and calendar endpoints use D1-backed caching to reduce Worker CPU time.
- **KV is not used**.
- Email notifications support **SMTP / Resend**, but **SMTP port 25 is not supported**.
- Tag-level monthly budgets and the dedicated budgets page are removed.
- The dashboard keeps lightweight overview metrics, global budgets, and upcoming renewals.
- Spending statistics keep overview charts, status distribution, currency distribution, TOP 10 subscriptions, and AI summaries.
- Wallos / SubTracker backup import, logo search, cron jobs, and auto-renew flows are adapted for the Worker runtime.
- When the free Worker tier hits `503` or CPU limits, the UI shows an explicit warning instead of a silent failure.

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for deployment details, feature boundaries, and runtime notes.

## Tech Stack

- **Frontend**: Vue 3, Vite, TypeScript, Naive UI, Pinia, TanStack Query, ECharts
- **Backend**: Cloudflare Worker, Hono, Prisma D1 Adapter, D1, optional R2

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Start the local Worker

```bash
npm run dev:worker
```

Default address:

- `http://127.0.0.1:8787`

Default credentials:

- Username: `admin`
- Password: `admin`

After the first login, changing the default password is strongly recommended. Repeated login failures trigger rate limiting.

## Useful Commands

```bash
npm run dev:worker
npm run build
npm run lint
npm test
```

## Deployment

The recommended path is **GitHub Actions + Cloudflare**.

The full deployment flow is documented in:

- [DEPLOYMENT.md](./DEPLOYMENT.md)

In short:

1. Fork this repository.
2. Configure the required Cloudflare Secrets / Variables.
3. When forking, do not enable **Copy the main branch only**, or the `lite` branch will be missing.
4. Run **Lite CI and Deploy** in GitHub Actions, and set **Use workflow from** to **`lite`**.
5. Keep your fork updated with **Sync fork**.

Common repository Variables:

- `WORKER_NAME_PREFIX`
- `ENABLE_R2` (disabled by default; enable it if you want ZIP-imported logos to be persisted)

## Workflow

- `Lite CI and Deploy`: runs lint / test / build first, then deploys to Cloudflare only if verification succeeds.

## License

This project is released under the **GNU General Public License v3.0 (GPLv3)**.

## Acknowledgements

Thanks to the following projects and ecosystems:

- [Wallos](https://github.com/ellite/Wallos) — migration reference and compatibility direction
- [Vue 3](https://vuejs.org/) and [Vite](https://vitejs.dev/) — frontend foundation
- [Naive UI](https://www.naiveui.com/) — UI components
- [Hono](https://hono.dev/) and [Prisma](https://www.prisma.io/) — Worker backend and data access
- [Pinia](https://pinia.vuejs.org/), [TanStack Query](https://tanstack.com/query/latest), and [ECharts](https://echarts.apache.org/) — state, data fetching, and charts

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Smile-QWQ/SubTracker&type=Date)](https://www.star-history.com/?repos=Smile-QWQ%2FSubTracker&type=date&legend=top-left)
