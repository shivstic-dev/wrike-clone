# OpenWork Hub

An independent full-stack work management platform built with NestJS, React, and Supabase.

This project is not affiliated with, endorsed by, or sponsored by Wrike, Inc.

## 🚀 Features

### Core Management

- **Multi-tenant Architecture** with Row-Level Security (RLS)
- **Workspaces & Projects** with hierarchical folder structure
- **Task Management** with dependencies, assignees, and custom fields
- **Task Collaboration** with comments and an in-app notification API
- **Kanban, Table, Gantt Chart & Calendar Views** for task visualization
- **Approval Workflows** with multi-step chains
- **Automation Rule Builder** for defining conditions and actions
- **Time Tracking** with billable hours and timesheets

### Customization & Workflow

- **Custom Fields** — Add extra fields (text, dropdown, date, etc.) to tasks
- **Custom Item Types** — Define specialized task categories (Bug, Interview, etc.)
- **Custom Statuses & Workflows** — Per-workspace status sets with custom colors
- **Blueprints (Templates)** — Save projects as reusable templates
- **Request Forms** — Intake forms for structured task creation

### Scheduling & Capacity

- **Work Schedules** — Default working hours per day of week
- **Time Off Management** — Vacation, sick, and personal day requests with approval
- **Company Holidays** — Tenant-wide holidays for capacity planning

### Search & Discovery

- **Global Search** — Full-text search across tasks and projects
- **Search Page** — Paginated results with type and project filters
- **PostgreSQL Full-Text Search** (with optional Meilisearch integration)

### Communication

- **Task Comments** — Inline discussion on tasks
- **Email Delivery Service** — SMTP templates ready for workflow integration
- **Inbox Notifications API** — Tenant-scoped notification storage and endpoints

### File Management

- **Private File Storage** — Supabase Storage uploads with short-lived download links
- **File Metadata & Annotations API** — Version metadata and annotation endpoints

### Analytics & Reports

- **Dashboards** — Custom dashboards with task metrics and charts
- **Portfolio View** — Aggregated view across workspaces and projects
- **Reports & Analytics** — Custom reports with filters and date ranges
- **Timesheets** — View and export time entries across projects

### Enterprise & Security

- **Roles & Permissions** — RBAC with custom roles
- **Webhook Management** — SSRF-protected endpoint configuration and delivery service
- **Versioned REST API** — JWT authentication, RBAC, validation, and global rate limiting
- **Row-Level Security (RLS)** — Database-level tenant isolation

### Current distribution scope

The distributed v1 is intentionally focused on department task monitoring:
scoped Employee/Manager/Department Head/Admin permissions, task assignment and
status control, department/global visibility, deadline and priority alerts, and
server-generated PDF/XLSX reports. Generic Gantt, automation, portfolio,
timesheet, schedule, search, Copilot, webhook, and public-form interfaces remain
dormant and are not exposed in the production navigation or route table. See
[feature coverage](FEATURE_COVERAGE.md) and
[production cutover](PRODUCTION_CUTOVER.md) before deploying.

## 🛠️ Tech Stack

### Backend

- **NestJS** — Progressive Node.js framework
- **PostgreSQL** (Supabase) — Database with RLS
- **Knex.js** — SQL query builder & migrations
- **JWT** — Authentication with refresh tokens
- **Zod** — Schema validation
- **BullMQ** — Job queue (optional)
- **Nodemailer** — SMTP email notifications

### Frontend

- **React 18** with TypeScript
- **Vite** — Build tool
- **TailwindCSS** — Styling
- **React Query** — Data fetching & caching
- **React Router** — Navigation
- **date-fns** — Date manipulation
- **Recharts** — Charts & analytics

### Shared

- **Monorepo** with workspace packages
- **Shared types & validation schemas**
- **TypeScript** throughout

## 📋 Prerequisites

- **Node.js** 18+
- **npm** or **yarn**
- **Supabase account** (for database)
- **Git**

## 🔧 Installation

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/wrike-clone.git
cd wrike-clone
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Copy `.env.example` to `.env` and update with your Supabase credentials:

```bash
cp .env.example .env
```

Update the following in `.env`:

```env
# Database (Supabase)
DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
DB_SSL=true
DB_MAX_CONNECTIONS=10

# Auth
JWT_SECRET=your-secret-key-change-in-production
ENCRYPTION_KEY=your-64-char-hex-encryption-key

# CORS
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

### 4. Set up the database

Run the schema in Supabase SQL Editor:

1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Apply the SQL files in `supabase/migrations/` in filename order
4. Click **Run**

Alternatively, if you have `psql` installed:

```bash
cd packages/backend
npx knex migrate:latest --knexfile src/database/knexfile.ts
```

### 5. Build the shared package

```bash
cd packages/shared
npm run build
cd ../..
```

### 6. Start the backend

```bash
cd packages/backend
npm run dev
```

Backend will run on http://localhost:4000

### 7. Start the frontend (in a new terminal)

```bash
cd packages/frontend
npm run dev
```

Frontend will run on http://localhost:5173

## 🌐 Deployment

### Deploy to Vercel (Frontend + Backend)

1. **Push to GitHub** (already done!)

2. **Import to Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Click "Add New Project"
   - Import your GitHub repository
   - Vercel will auto-detect the monorepo structure

3. **Configure Environment Variables:**
   Add all variables from `.env` to Vercel project settings

4. **Deploy!**

The `vercel.json` file is already configured for both frontend and backend deployment.

### Backend API Endpoints

Once deployed, your API will be available at:

- **Development**: `http://localhost:4000/api/v1`
- **Production**: `https://your-domain.vercel.app/api/v1`

## 📚 API Documentation

### Health Check

- `GET /api/v1/health` - Health check endpoint

### Authentication

- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh` - Refresh token
- `POST /api/v1/auth/logout` - Logout
- `POST /api/v1/auth/change-password` - Change password

### Resources

- `/api/v1/tenants` — Tenant management
- `/api/v1/tenants/bootstrap` — Setup-key-protected first tenant/admin bootstrap
- `/api/v1/workspaces` — Workspace CRUD
- `/api/v1/folders` — Folder hierarchy
- `/api/v1/projects` — Project management
- `/api/v1/tasks` — Task operations
- `/api/v1/notifications` — User notifications
- `/api/v1/automation` — Automation rules
- `/api/v1/approvals` — Approval workflows
- `/api/v1/time-entries` — Time tracking
- `/api/v1/webhooks` — Webhook configuration
- `/api/v1/files` — File upload & versioning
- `/api/v1/customization` — Custom fields, item types, blueprints, request forms, workspace statuses
- `/api/v1/search` — Full-text search across tasks and projects
- `/api/v1/email` — Email notification settings
- `/api/v1/schedule` — Work schedules, time off, holidays

## 🧪 Testing

```bash
# Backend tests
cd packages/backend
npm test

# Frontend tests
cd packages/frontend
npm test
```

## 📝 Project Structure

```
wrike-clone/
├── packages/
│   ├── backend/          # NestJS API
│   │   ├── src/
│   │   │   ├── auth/            # Authentication
│   │   │   ├── task/            # Task module
│   │   │   ├── project/         # Project module
│   │   │   ├── file/            # File upload & versioning
│   │   │   ├── search/          # Full-text search
│   │   │   ├── email/           # Email notifications
│   │   │   ├── schedule/        # Work schedules & capacity
│   │   │   ├── customization/   # Custom fields, item types, blueprints
│   │   │   ├── approval/        # Approval workflows
│   │   │   ├── automation/      # Automation rules
│   │   │   ├── notification/    # In-app notifications
│   │   │   ├── webhook/         # Webhook integrations
│   │   │   ├── timelog/         # Time tracking
│   │   │   ├── rbac/            # Role-based access control
│   │   │   └── migrations/      # Knex database migrations
│   │   └── test/
│   │       ├── unit/            # Unit tests
│   │       └── e2e/             # End-to-end API tests
│   ├── frontend/         # React app
│   │   ├── src/
│   │   │   ├── pages/           # Route pages
│   │   │   ├── components/      # UI components
│   │   │   │   ├── Gantt/       # Interactive Gantt chart
│   │   │   │   ├── Calendar/    # Calendar views
│   │   │   │   ├── Kanban/      # Kanban board
│   │   │   │   ├── Portfolio/   # Portfolio view
│   │   │   │   ├── Reports/     # Reports & analytics
│   │   │   │   ├── Search/      # Global search bar
│   │   │   │   ├── Timesheet/   # Timesheet panel
│   │   │   │   ├── Customization/ # Customization UI
│   │   │   │   └── ...
│   │   │   └── api/             # API client
│   │   └── public/
│   └── shared/           # Shared types & schemas
│       └── src/
├── docker/               # Docker configs
├── docs/                 # Documentation
├── scripts/              # Utility scripts & deployment SQL
└── .github/              # CI/CD workflows
```

## 🔐 Security

- **JWT** authentication with refresh tokens
- **Row-Level Security (RLS)** in PostgreSQL
- **httpOnly cookies** for refresh tokens
- **CORS** protection
- **Rate limiting** (via NestJS Throttler)
- **Input validation** (Zod schemas)
- **SQL injection protection** (Knex parameterized queries)

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- Inspired by [Wrike](https://www.wrike.com/)
- Built with [NestJS](https://nestjs.com/)
- Database by [Supabase](https://supabase.com/)

## 🔐 Environment Variables

| Variable               | Description                                    | Required             |
| ---------------------- | ---------------------------------------------- | -------------------- |
| `DATABASE_URL`         | PostgreSQL connection string (Supabase)        | ✅                   |
| `JWT_SECRET`           | JWT signing secret                             | ✅                   |
| `ENCRYPTION_KEY`       | Encryption key (64-char hex)                   | ✅                   |
| `CORS_ORIGINS`         | Allowed CORS origins                           | ✅                   |
| `SMTP_HOST`            | SMTP server hostname                           | For email            |
| `SMTP_PORT`            | SMTP port (default 587)                        | For email            |
| `SMTP_USER`            | SMTP username                                  | For email            |
| `SMTP_PASS`            | SMTP password                                  | For email            |
| `MEILISEARCH_HOST`     | Meilisearch server URL                         | For full-text search |
| `MEILISEARCH_API_KEY`  | Meilisearch API key                            | For full-text search |
| `STORAGE_DRIVER`       | File storage driver (`local` or `s3` / `r2`)   | For file uploads     |
| `S3_ENDPOINT`          | S3-compatible endpoint (Cloudflare R2, AWS S3) | For S3 storage       |
| `S3_BUCKET`            | S3 bucket name                                 | For S3 storage       |
| `S3_REGION`            | S3 region                                      | For S3 storage       |
| `S3_ACCESS_KEY_ID`     | S3 access key                                  | For S3 storage       |
| `S3_SECRET_ACCESS_KEY` | S3 secret key                                  | For S3 storage       |

## 📧 Contact

For questions or support, please open an issue on GitHub.

---

**Made with ❤️ by Your Team**
