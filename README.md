# Team Registration Form Platform (v2)

A full-stack course team registration platform with a glassmorphic **Next.js + Tailwind CSS + Framer Motion** frontend and an **Express.js (TypeScript) + Supabase (Postgres)** backend.

---

## Features

- **Multiple Registration Forms (`/f/[slug]`)**:
  - Configurable team size range (`min_team_size` and `max_team_size`, `1..20`; fixed size when equal).
  - Optional topic collection (`collect_topic` on/off) with optional topic repetition (`allow_topic_repeat` on/off).
  - When topics are uploaded as CSV (`topic` column) for a form, students choose from a searchable dropdown (taken topics disabled with `"Taken by Team N"` when repetition is off).
  - When no topics CSV is uploaded and `collect_topic` is ON, students enter a free-text topic with live case-insensitive availability check.
- **Natural Roll Number Sorting**:
  - Roll numbers are always sorted before storage and display using natural order (`order by length(roll_no), roll_no`, so `21CS9` comes before `21CS10`) and stored with `team_members.position`.
  - Displayed in sorted order everywhere: responses table, Excel export, PDF export, and success screen.
- **Real-Time Roll Number Verification**:
  - Students only enter roll numbers; names and gender (`Boy • M` / `Girl • F`) are resolved from `classlist.csv`.
  - Debounced (~400ms) live validation + on-blur check:
    - `"Roll number not found"` if not in the class list.
    - `"Already registered in Team N"` if already registered in another team of the form.
    - `"Duplicate in this team"` if entered twice in the same team.
- **Multi-Admin & Super Admin Support**:
  - Admins are stored in the `admins` table (`email`, `password_hash`, `role` in `admin | super_admin`).
  - First super admin is created via CLI (`npm run create-admin -- --email you@x.com --password '...' --super`).
  - Super admins can add/remove admins and reset passwords at `/admin/admins`.
  - All admins can change their own password at `/admin/account`.
  - No admin links exist on public pages; `/admin` routes include `noindex` metadata and `robots.txt` disallow rules.
- **Exports**:
  - **Excel (`.xlsx`)**: Single sheet `"Responses"`, one row per member, exact columns `team_no`, `roll_no`, `name` (plus `topic` only when `collect_topic` is ON). Vertically merges `team_no` and `topic` cells across each team's rows, centers merged cells, freezes the bold styled header row, and applies alternating fill per team.
  - **PDF (`.pdf`)**: A4 report with header banner, summary box (total teams, boys, girls, total students), clean table (`Team No`, `Roll No`, `Name`, and `Topic` if enabled) with `Team No` and `Topic` spanning each team's rows, repeating header row on every page, and `"Page X of Y"` footers.

---

## Supabase Setup

1. Open your project in [Supabase](https://supabase.com) and go to **SQL Editor -> New query**.
2. If upgrading from v1, drop the old tables first:
   ```sql
   drop table if exists team_members, teams, topics, forms, students, admins cascade;
   ```
3. Paste the contents of [`backend/supabase/schema.sql`](./backend/supabase/schema.sql) and click **Run**.
4. Go to **Project Settings -> API** and copy:
   - **Project URL** -> `SUPABASE_URL` in `backend/.env`
   - **service_role secret key** -> `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env`

---

## Quick Start & Commands

### 1. Backend (`/backend`)

```bash
cd backend
npm install

# Copy .env.example to .env and fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET
cp .env.example .env

# Seed students from classlist.csv
npm run seed:students

# Create your first super admin account
npm run create-admin -- --email you@example.com --password 'YourStrongPassword' --super

# Start Express dev server on http://localhost:4000
npm run dev
```

### 2. Frontend (`/frontend`)

```bash
cd frontend
pnpm install

# Copy .env.local.example to .env.local (NEXT_PUBLIC_API_URL=http://localhost:4000)
cp .env.local.example .env.local

# Start Next.js dev server on http://localhost:3000
pnpm run dev
```

### Key URLs
- **Public Home**: `http://localhost:3000`
- **Public Form Page**: `http://localhost:3000/f/[slug]`
- **Admin Login**: `http://localhost:3000/admin/login`
- **Admin Dashboard**: `http://localhost:3000/admin`
- **Manage Admins (Super Admin)**: `http://localhost:3000/admin/admins`
- **Admin Account (Change Password)**: `http://localhost:3000/admin/account`
