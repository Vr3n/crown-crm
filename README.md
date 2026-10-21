# CrownCRM

**Offline-first gym membership CRM for Windows.** Manage members, plans, billing, and check-ins from a fast native desktop app — your data stays on your machine.

CrownCRM is a desktop application for gym owners and front-desk staff who want a reliable CRM that works even without an internet connection. Everything runs locally, so there is no account to create, no cloud to depend on, and no recurring subscription just to open your front desk.

## Features

- **Organization setup & sign-in** — set up your gym and its owner account in a few minutes, then sign in from any staff member.
- **Member & membership management** — track leads, customers, plans, memberships, and their lifecycles.
- **Billing, payments & finance** — invoices, receipts, payments, allocations, refunds, and outstanding balances.
- **Role-based access control** — staff are assigned roles, and every action is checked against a permission, not a role name.
- **Multi-tenancy ready** — data is scoped per organization, so supporting multiple gyms later needs no schema rewrite.
- **Local & private** — data lives in a local database on the machine. No cloud, no telemetry.

## Built with

- [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/) — desktop shell and tooling
- [React](https://react.dev/) 19 + [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) — UI
- [TanStack Query](https://tanstack.com/query) / [TanStack Form](https://tanstack.com/form) / [TanStack Table](https://tanstack.com/table)
- [SQLite](https://www.sqlite.org/) via Node's built-in `node:sqlite` — local storage

## Prerequisites

- **Node.js** 20 or newer (recent versions include the `node:sqlite` module used for storage)
- A Windows machine (the primary supported platform)

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Start the app in development mode (with hot reload)
npm run dev
```

On first launch you'll be asked to set up your organization and its Owner account.

## Building & running a release

```bash
# Type-check then produce the build output
npm run build

# Run the built app locally (like production)
npm start

# Package installers / binaries for distribution
npm run build:win    # Windows installer
npm run build:mac    # macOS
npm run build:linux  # Linux (AppImage, snap, deb)
```

## Testing & quality

```bash
npm run typecheck   # TypeScript type checks (main + renderer)
npm run lint        # ESLint
npm test            # Run the test suite (Vitest)
```

## Project structure

```
src/
  main/     Electron main process, SQLite, application services
  preload/  Typed bridge between the renderer and the main process
  renderer/ React UI (components, pages, styles)
tests/      Automated tests (Vitest)
docs/       Technical design and architecture specifications
```

## License

**This is proprietary, closed-source software — not open source.**

CrownCRM is a commercial product. This repository is the source code for the paid application and
is provided for transparency and development purposes only. Access to this repository **does not**
grant you any right to copy, modify, distribute, sell, or use the software.

- The source code and all assets are **© 2026 Viren Patel. All Rights Reserved.**
- Unauthorized copying, reproduction, or distribution of any part of this project is prohibited.
- Using, running, or installing CrownCRM requires a separate, paid license from the author.
- No license, express or implied, is granted by mere access to this repository.

See the [`LICENSE`](./LICENSE) file for the full terms.

For licensing, purchase, or other inquiries, please contact the author.
