# Pronghorn (Alpha)

**Build Software with AI-Powered Precision**

A standards-first, agentic AI platform that transforms unstructured requirements into production-ready code with complete traceability. From idea to deployment, Pronghorn orchestrates multi-agent AI teams to design, build, and ship software autonomously.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Powered by Azure](https://img.shields.io/badge/Powered%20by-Azure-0078D4)](https://azure.microsoft.com)

**Live Application**: [https://pronghorn.blue](https://pronghorn.blue)

> Part of [The Velocity White Papers](https://thevelocitywhitepapers.com), an open collection on building software in the AI era. The design and ideation approach behind Pronghorn is described in [The AI Factory: Design and Ideation](https://thevelocitywhitepapers.com/paper/qthji).

> **Which Pronghorn is this?** This is the current Pronghorn platform, aligned with Azure and integrated with the Microsoft Agent Factory. The original React + Supabase version is [Pronghorn Red](https://github.com/GovAlta/PRONGHORN-RED).

---

## Overview

Pronghorn is an open-source AI-powered software development platform created by the **Government of Alberta, Ministry of Technology and Innovation**. It enables teams to take an idea from design through to deployment using coordinated AI agents.

The platform operates in four modes:

| Mode        | Description                                                  |
| ----------- | ------------------------------------------------------------ |
| **Design**  | Visual specification building with an interactive canvas     |
| **Audit**   | Multi-agent cross-comparison between project datasets        |
| **Build**   | Autonomous code generation with real-time monitoring         |
| **Present** | AI-generated project presentations                           |

---

## Frontend

The frontend lives in `app/frontend-new/` (the spec 007 redesign, built to the layout contract in `specs/007-frontend-new/contracts/design-system.md`). It is the only frontend: the former legacy frontend (`app/frontend-new/`) was removed in T074. Legacy URLs are mapped to their new equivalents by redirects (T072).

---

## Features

- **AI-Powered Requirements & Standards** — Decompose ideas into Epics, Features, User Stories, and Acceptance Criteria linked to a reusable global standards library and organizational build books
- **Visual Architecture Design** — Interactive React Flow canvas with 24+ node types, layer management, and lasso selection
- **Multi-Agent AI Teams** — Orchestrated specialists (Architect, Developer, DBA, Security, QA, DevOps, UX, and more) collaborate on the canvas and generate production code with full Git workflow
- **Audit & Analysis** — Cognitive cross-comparison between project datasets with Evidence Grid, Knowledge Graph, and Venn Diagram outputs
- **Collaborative Editing & Sharing** — Real-time AI-assisted document editing, a project gallery with one-click cloning, and token-based sharing (Owner / Editor / Viewer) with no login required
- **Database Management** — PostgreSQL lifecycle tooling with schema explorer, Monaco SQL editor, and AI-powered data import

---

## Tech Stack

| Layer              | Technologies                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend**       | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Flow, Monaco Editor, TanStack Query, React Router                       |
| **Backend**        | Express.js, TypeScript, PostgreSQL (`pg`), WebSocket (`ws`), Swagger/OpenAPI                                                        |
| **Infrastructure** | Terraform, Docker, GitHub Actions CI/CD                                                                                             |
| **Azure Services** | Container Apps, API Management, PostgreSQL Flexible Server, Blob Storage, AI Foundry, Key Vault, Container Registry, Log Analytics |
| **AI Models**      | Azure AI Foundry — GPT-4.1, GPT-4.1-mini, GPT-4o, GPT-4o-mini, o3, o4-mini                                                        |

---

## Getting Started

### Prerequisites

- **Node.js 18+** and **npm**
- **Docker Desktop** (for local PostgreSQL databases)
- **Git**

> For Azure deployment you will also need: Azure CLI, Terraform, and PowerShell 7+. See the [Infrastructure README](./infra/README.md) and the deployment guides under [`docs/`](./docs).

### Run locally without Entra

No Microsoft Entra ID app registration needed. Development only.

```bash
cp .env.example .env                                  # root: uncomment AUTH_MODE=local + AZURE_STORAGE_ACCOUNT_NAME, set your own JWT_SECRET (openssl rand -hex 32)
cp app/frontend-new/.env.example app/frontend-new/.env   # VITE_AUTH_MODE=mock, VITE_API_BASE_URL=http://localhost:3001
npm run dev:db          # Postgres on 5432/5433; migrations run on the first `docker compose up`
npm run dev:api         # API on http://localhost:3001 (logs "AUTH_MODE=local: dev sign-in enabled")
npm run dev:frontend    # http://localhost:8080
```

Open http://localhost:8080/auth and sign in (defaults `dev@local.test` /
`Local Developer`). The API creates the user, an app admin role and a "Local
Dev" organization on first use. If the database volume predates newer
migrations, run `npm run dev:reset` (this wipes the local DB volumes).
`AUTH_MODE=local` is refused with `NODE_ENV=production`; the sign-in form is
only active in the Vite dev server with `VITE_AUTH_MODE=mock` and no
`VITE_ENTRA_CLIENT_ID`.

### Quick Start

```bash
# 1. Install root dependencies (one-time)
npm install

# 2. Install frontend and backend dependencies
npm install --prefix app/frontend-new
npm install --prefix app/backend

# 3. Configure environment variables
cp app/frontend-new/.env.example app/frontend-new/.env
cp app/backend/.env.example app/backend/.env

# 4. Start everything (databases + API + frontend)
npm run dev
```

This launches the full stack: **PostgreSQL** databases via Docker Compose, the **Express API** on port 3001, and the **Vite dev server** on port 8080.

Other useful commands:

| Command            | Description                             |
| ------------------ | --------------------------------------- |
| `npm run dev:stop` | Stop database containers                |
| `npm run dev:reset`| Wipe database volumes and recreate      |
| `npm run build`    | Build backend then frontend             |
| `npm run test`     | Run Jest (API) + Vitest (frontend)      |
| `npm run lint`     | Lint the frontend                       |

For the complete local development walkthrough — including auth modes, environment variables, and AI model setup — see [Local Development](./docs/LOCAL_DEVELOPMENT.md).

---

## Configuration: placeholders to replace

This repository ships with **placeholder values** in place of any organization-specific identifiers. To run locally you only need the `.env` files; to deploy to your own Azure tenant you must also replace the placeholders in the static and infrastructure files below with your own values.

**Local development (no cloud needed):** copy the `.env.example` files (see Quick Start) and set `VITE_AUTH_MODE=mock` (frontend) and `SKIP_AUTH=true` (backend) to run the full stack against local Docker Postgres with no Azure account. All secrets in `.env` are yours and are never committed.

**Authentication (Microsoft Entra ID).** Set your real IDs in the env files — backend `ENTRA_TENANT_ID` / `ENTRA_CLIENT_ID` (`app/backend/.env`) and frontend `VITE_ENTRA_CLIENT_ID` / `VITE_ENTRA_TENANT_ID` (`app/frontend-new/.env`). Then update the one static file that cannot read env at runtime:

| File | Placeholder | Replace with |
| --- | --- | --- |
| `app/frontend-new/public/auth-redirect.html` | `clientId` `11111111-1111-1111-1111-111111111111` | your Entra **Application (client) ID** |
| `app/frontend-new/public/auth-redirect.html` | tenant `00000000-0000-0000-0000-000000000000` in the `authority` URL | your Entra **Directory (tenant) ID** |

**API Management policies** (`infra/config/apim-policy.xml`, `apim-policy-minimal.xml`):

| Placeholder | Replace with |
| --- | --- |
| tenant `00000000-0000-0000-0000-000000000000` | your Entra **tenant ID** |
| audience `22222222-2222-2222-2222-222222222222` | your API **app-registration audience** (application ID URI / client ID) |
| `<env-suffix>` in the backend Container Apps FQDN | your deployed Container Apps **environment suffix** |

**Infrastructure.**

- `infra/scripts/New-PbmmSubnets.ps1` — pass `-SubscriptionId <your-subscription-guid>` (the default is the all-zero placeholder).
- `infra/params/*.tfvars` — set your own resource names (the committed `goa-cc-*` names are examples).
- Real secrets (DB passwords, JWT signing key, GitHub App private key) are **never** stored in code or tfvars — they are generated into / read from Key Vault and injected from GitHub Environment secrets at deploy time. See [`docs/PBMM_DEPLOYMENT.md`](./docs/PBMM_DEPLOYMENT.md).

**Operations runbooks** (`docs/operations/*`): private IPs are shown as `10.x.y.z` and environment-specific hostnames as `<env-suffix>` — substitute your environment's actual values when following those guides.

---

## Project Structure

```
pronghorn/
├── app/
│   ├── frontend-new/          # React + Vite + TypeScript frontend (spec 007 redesign)
│   │   ├── src/
│   │   │   ├── components/    # UI components (shell, ui, etc.)
│   │   │   ├── features/      # Feature modules (versions, onboarding, admin, ...)
│   │   │   ├── pages/         # Route-level pages
│   │   │   ├── contexts/      # React context providers
│   │   │   ├── lib/           # Auth, API clients, helpers
│   │   │   └── utils/         # Utility functions
│   │   └── .env.example
│   └── backend/               # Express.js API + TypeScript
│       ├── src/
│       │   ├── __tests__/     # Jest test suites
│       │   ├── config/        # Runtime configuration
│       │   ├── middleware/    # Auth, validation, error handling
│       │   ├── routes/        # Versioned API routes (v1)
│       │   ├── services/      # Domain services
│       │   ├── types/         # TypeScript interfaces
│       │   └── utils/         # Logging, DB helpers
│       └── .env.example
├── infra/                     # Terraform modules + SQL migrations
│   ├── modules/               # Azure resource modules (APIM, ACA, DB, Foundry, etc.)
│   ├── migrations/            # PostgreSQL schema and seed SQL
│   ├── config/                # AI model and rollback configuration
│   └── params/                # Environment-specific tfvars
├── docs/                      # Architecture, deployment, and operations guides
├── docker-compose.yml         # Local database containers
└── scripts/                   # Repository utility scripts
```

---

## Documentation

| Document                                         | Description                                                 |
| ------------------------------------------------ | ----------------------------------------------------------- |
| [Documentation Index](./docs/README.md)         | Index of the published guides                               |
| [Local Development](./docs/LOCAL_DEVELOPMENT.md) | Full local setup walkthrough and environment configuration  |
| [PBMM Deployment](./docs/PBMM_DEPLOYMENT.md)    | PBMM landing zone deployment with private endpoints         |
| [Online Deployment](./docs/ONLINE_DEPLOYMENT.md)    | Deployment to Azure with public endpoints |
| [GitHub App Setup](./docs/GITHUB_APP_SETUP.md) | GitHub App configuration for generated-app delivery |
| [Infrastructure](./infra/README.md) | Terraform root module, modules, and deployment configuration |

---

## Legal

### Alpha Notice

This application is currently in **Alpha** testing by the **Government of Alberta**. Features, functionality, and availability are subject to change or removal at any time during the testing period.

### Liability Waiver

This application is provided **"as is"** without any warranties, express or implied. The Government of Alberta assumes no liability for any issues, data loss, or damages resulting from use during the testing period.

### License

MIT License — see [LICENSE](./LICENSE).

---

## Contact

**Government of Alberta** — Ministry of Technology and Innovation

- **Website**: [https://pronghorn.blue](https://pronghorn.blue)
- **Repository**: [GitHub](https://github.com/phb-msft-dev/pronghorn)