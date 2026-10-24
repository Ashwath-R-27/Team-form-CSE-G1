# Production Deployment Checklist (`DEPLOY.md`)

## 1. Environment Variables

### Backend (Render — Web Service, Root Directory: `backend`)
Set the following environment variables in the Render dashboard (**Environment** tab):

| Variable | Description | Example |
| :--- | :--- | :--- |
| `SUPABASE_URL` | Supabase Project URL (no `/rest/v1` suffix) | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase `service_role` secret key (bypasses RLS) | `eyJ...` (or `sb_secret_...`) |
| `JWT_SECRET` | Strong random secret (at least 32 chars) used to sign 7-day admin JWTs | `<64-char-hex-secret>` |
| `FRONTEND_ORIGIN` | Allowed frontend origin(s), comma-separated (trailing slashes are stripped automatically) | `https://your-app.vercel.app` |
| `PORT` | Automatically injected by Render (optional manual default: `4000`) | `10000` |

- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`

### Frontend (Vercel — Next.js Project, Root Directory: `frontend`)
Set the following environment variable in the Vercel dashboard (**Settings -> Environment Variables** for Production/Preview):

| Variable | Description | Example |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | Public HTTPS URL of the Render backend service (no trailing slash) | `https://your-backend.onrender.com` |

---

## 2. Supabase Schema & Migrations

1. Open your live project in the **Supabase Dashboard -> SQL Editor -> New query**.
2. If this is a fresh Supabase project, run [`backend/supabase/schema.sql`](./backend/supabase/schema.sql).
3. If the project already has data and only needs the `admins` table verified/created without losing data, run [`backend/supabase/migrations/001_admins.sql`](./backend/supabase/migrations/001_admins.sql) (uses `create table if not exists`, never drops tables).
4. From your local machine (with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `JWT_SECRET` set in `backend/.env` pointing to the live Supabase project):
   - **Migrate local JSON data (admins, forms, teams, members) idempotently:**
     ```bash
     cd backend
     npm run migrate-local-db
     ```
   - **Or create a new super admin directly in Supabase:**
     ```bash
     cd backend
     npm run create-admin -- --email admin@example.com --password 'YourStrongPassword' --super
     ```
   - **Seed student roster (if not already migrated):**
     ```bash
     cd backend
     npm run seed:students
     ```

---

## 3. Order to Deploy

1. **Database (Supabase) first:** Run `backend/supabase/migrations/001_admins.sql` (and `backend/supabase/schema.sql` if tables don't exist yet), then run `npm run migrate-local-db` (or `npm run create-admin`).
2. **Backend (Render) second:** Verify `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, and `FRONTEND_ORIGIN` are set in Render, then trigger a deploy and copy the live Render URL (e.g., `https://your-backend.onrender.com`).
3. **Frontend (Vercel) third:** Set `NEXT_PUBLIC_API_URL` in Vercel to the live Render URL and trigger a production redeploy (since `NEXT_PUBLIC_*` variables are inlined at build time).
4. **Confirm `FRONTEND_ORIGIN` on Render:** Ensure `FRONTEND_ORIGIN` on Render matches your exact Vercel production domain (e.g., `https://your-app.vercel.app`).

---

## 4. Verification on Live Site

1. **Test Backend Health Endpoint:**
   ```bash
   curl -i https://your-backend.onrender.com/health
   # Expected: HTTP/2 200 and {"ok":true}
   ```
2. **Test Admin Login via `curl`:**
   ```bash
   curl -i -X POST https://your-backend.onrender.com/api/admin/login \
     -H "Content-Type: application/json" \
     -H "Origin: https://your-app.vercel.app" \
     -d '{"email":"admin@example.com","password":"YourStrongPassword"}'
   # Expected: 200 OK with {"token":"<jwt>","admin":{"id":"...","email":"admin@example.com","role":"super_admin"}}
   ```
3. **Test Authenticated `/api/admin/me`:**
   ```bash
   curl -i https://your-backend.onrender.com/api/admin/me \
     -H "Authorization: Bearer <jwt>"
   # Expected: 200 OK with admin details and classStats
   ```
4. **Test Live Frontend Login & Exports:**
   - Open `https://your-app.vercel.app/admin/login`.
   - Sign in with your admin email and password.
   - Confirm `/admin` loads forms and class roster stats, open a form, and click **Download Excel (.xlsx)** and **Download PDF**.
   - Click **Logout** and confirm you are redirected to `/admin/login`.

