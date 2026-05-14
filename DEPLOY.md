# Deploying PhDapp to Vercel

A step-by-step guide. Follow top to bottom. Each step has a *check* line so you know it worked before moving on.

Total time: ~2–3 hours, most of it waiting for builds.
Cost: ~$0/month at your scale (≤20 users), plus ~$10–15/year if you want a custom domain.

---

## Prerequisites

You need accounts on:

- [ ] **GitHub** — to host the source code (free).
- [ ] **Vercel** — to host the running app. Sign up with your GitHub account (free Hobby tier).
- [ ] **Neon** — managed Postgres database (`neon.tech`, free tier).
- [ ] **Google Cloud Console** — you already have this; you'll just add a new redirect URL.

You also need these tools locally (you already have them since the app runs):

- Node.js 20+
- `npx` (comes with Node)

---

## Part A — Get the code ready

### Step 1. Switch the database from SQLite to Postgres

Vercel's serverless functions can't write to a local SQLite file, so you need a hosted Postgres. We'll use Neon (free tier).

1. **Create a Neon project.**
   - Go to <https://neon.tech>, sign up, click **Create project**.
   - Project name: `phdapp`. Region: pick the one closest to you.
   - On the project dashboard, copy the **connection string** (looks like `postgresql://user:password@ep-xxx.neon.tech/neondb?sslmode=require`). Save it somewhere safe — you'll paste it twice.

2. **Update `prisma/schema.prisma`.**
   - Open the file. Find the `datasource db` block at the top.
   - Change `provider = "sqlite"` to `provider = "postgresql"`.
   - Leave `url = env("DATABASE_URL")` as-is.

3. **Point your local `.env` at Neon.**
   - Open `.env` in the project root.
   - Replace the `DATABASE_URL=` line with:
     ```
     DATABASE_URL="postgresql://...your-neon-string..."
     ```
   - Save the file.

4. **Reset migrations and create fresh ones.**
   - SQLite migrations are not compatible with Postgres, so they need to be regenerated.
   - In your terminal, from the project root:
     ```bash
     rm -rf prisma/migrations
     npx prisma migrate dev --name init
     ```
   - This creates the schema in Neon and writes a new `prisma/migrations/` folder. Commit this folder.

5. **Re-create your local data manually.**
   - Sign in to the dev server, recreate your supervisor and student records. Existing SQLite data does NOT move automatically.
   - If you want to script it, write a `prisma/seed.ts` — but for ≤20 users, doing it through the UI is faster.

**Check:** Run `npm run dev`, sign in, and confirm you can load the dashboard. The data is now in Neon, not in `dev.db`.

### Step 2. Move file uploads to Vercel Blob

Right now uploaded photos and chat attachments are written to `public/uploads/`. On Vercel, that folder gets wiped on every deploy. We replace `fs.writeFile` with Vercel Blob's SDK.

1. **Install the SDK.**
   ```bash
   npm install @vercel/blob
   ```

2. **Find every place that writes to `public/uploads/`.**
   ```bash
   grep -rn "public/uploads" src/
   ```
   Likely candidates: avatar uploader, chat attachment upload, user profile photo upload.

3. **For each upload site, swap `fs.writeFile` for Blob.**
   The shape of the change is roughly:
   ```ts
   // before
   import { writeFile, mkdir } from "node:fs/promises";
   const filename = `${nanoid()}.${ext}`;
   await mkdir(`public/uploads/students`, { recursive: true });
   await writeFile(`public/uploads/students/${filename}`, buffer);
   const url = `/uploads/students/${filename}`;

   // after
   import { put } from "@vercel/blob";
   const filename = `${nanoid()}.${ext}`;
   const blob = await put(`students/${filename}`, buffer, {
     access: "public",
     contentType: file.type,
   });
   const url = blob.url; // full https://... URL
   ```
   Save `blob.url` to the DB exactly as you saved the old path. The image/`<a href>` works the same way.

4. **For deletion (e.g. the 7-day chat attachment cleanup), use `del()`.**
   ```ts
   import { del } from "@vercel/blob";
   await del(blobUrl);
   ```
   Find your cleanup logic with `grep -rn "unlink" src/` and swap accordingly.

5. **For local development**, put placeholder Blob credentials in `.env` (you'll get a real one in Step 7):
   ```
   BLOB_READ_WRITE_TOKEN="will-be-set-on-vercel"
   ```
   Locally, uploads won't work without a real token — you can skip testing them until you're on Vercel.

**Check:** Run `grep -rn "public/uploads" src/` again. There should be no matches.

### Step 3. Make `build` run Prisma migrations on deploy

So Vercel applies new migrations every time you push.

1. Open `package.json`.
2. Find the `"scripts"` section. Update the `build` line to:
   ```json
   "build": "prisma generate && prisma migrate deploy && next build"
   ```

**Check:** Run `npm run build` locally. It should run `prisma generate`, `prisma migrate deploy` (a no-op if already migrated), then `next build`.

---

## Part B — Deploy

### Step 4. Push the code to GitHub

1. **Initialize git if not already done:**
   ```bash
   git init
   git add .
   git commit -m "initial commit"
   ```

2. **Make sure secrets aren't committed.** Open `.gitignore` and confirm it lists:
   ```
   .env
   .env*.local
   node_modules
   .next
   public/uploads
   prisma/dev.db*
   ```
   If anything is missing, add it.

3. **Create a private repo on GitHub** (Settings → New repository → Private). Name it `phdapp`.

4. **Push:**
   ```bash
   git remote add origin git@github.com:<your-user>/phdapp.git
   git branch -M main
   git push -u origin main
   ```

**Check:** Browse to your repo on GitHub. You should see the source files but NOT `.env`.

### Step 5. Create the Vercel project

1. Go to <https://vercel.com>, sign in with GitHub.
2. **Add New → Project** → pick `phdapp` from the list.
3. **Framework preset:** Next.js (auto-detected).
4. **Root directory:** leave as `./`.
5. **Don't click Deploy yet** — first add env vars (next step). If you accidentally deploy, the first build will fail; that's fine, you can redeploy after adding vars.

### Step 6. Add the Storage integrations

In the Vercel project, go to **Storage** tab.

1. **Connect Neon Postgres:**
   - Click **Create Database** → **Neon (Postgres)** → pick your existing `phdapp` project. Vercel will auto-add `DATABASE_URL` to your env vars.
   - (Or skip the integration and paste your Neon connection string manually as `DATABASE_URL` in env vars.)

2. **Create Blob storage:**
   - Click **Create Database** → **Blob** → name it `phdapp-uploads`. Vercel auto-adds `BLOB_READ_WRITE_TOKEN`.

### Step 7. Set the rest of the environment variables

In Vercel project → **Settings → Environment Variables**, add these for **Production, Preview, and Development**:

| Name | Value |
|---|---|
| `AUTH_SECRET` | Generate fresh: run `openssl rand -base64 32` in a terminal and paste the output. |
| `AUTH_GOOGLE_ID` | Same as your local `.env`. |
| `AUTH_GOOGLE_SECRET` | Same as your local `.env`. |
| `ADMIN_EMAIL` | `rafael.castro.csic@gmail.com` (or whatever yours is) |
| `SUPERVISOR_EMAILS` | Comma-separated list, same as local |
| `AUTH_TRUST_HOST` | `true` |

`DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` should already be there from Step 6.

### Step 8. Deploy

1. Vercel project → **Deployments** → click **Redeploy** on the latest (or push a new commit to trigger one).
2. Watch the build log. Common failures:
   - **"DATABASE_URL not set"** → re-check env vars are saved for Production.
   - **"P1001: can't reach database"** → your Neon database is paused (free tier). Open the Neon dashboard once and it wakes up.
   - **Type errors** → fix locally, commit, push.

**Check:** Build finishes green. You get a URL like `https://phdapp-xyz.vercel.app`.

### Step 9. Add the production URL to Google OAuth

If you skip this, sign-in will fail with `redirect_uri_mismatch`.

1. Go to <https://console.cloud.google.com> → APIs & Services → Credentials.
2. Click your existing OAuth 2.0 Client ID.
3. Under **Authorized JavaScript origins**, add:
   ```
   https://phdapp-xyz.vercel.app
   ```
   (use your actual Vercel URL).
4. Under **Authorized redirect URIs**, add:
   ```
   https://phdapp-xyz.vercel.app/api/auth/callback/google
   ```
5. Save. Changes take ~1–5 minutes to propagate.

**Check:** Open `https://phdapp-xyz.vercel.app`, click sign in with Google. You should land on the dashboard.

### Step 10. Add your users to the OAuth test list

While the OAuth consent screen is in **Testing** mode, only emails on the test users list can sign in. ≤20 users fits comfortably (limit is 100).

1. Google Cloud Console → APIs & Services → **OAuth consent screen** → **Audience** → **Test users**.
2. Click **Add users**, paste the list of supervisor + student Gmail addresses (must be Gmail or Google Workspace), save.

**Check:** Each user can now sign in at the production URL.

---

## Part C — Optional but recommended

### Step 11. Schedule the cleanup cron

If you have the 7-day chat-attachment cleanup, you need a Vercel Cron to fire it.

1. Make sure there is an API route that runs the cleanup, e.g. `src/app/api/cron/cleanup-attachments/route.ts`. If not, factor your existing cleanup logic into one.
2. Create `vercel.json` in the project root:
   ```json
   {
     "crons": [
       { "path": "/api/cron/cleanup-attachments", "schedule": "0 3 * * *" }
     ]
   }
   ```
   This runs daily at 03:00 UTC.
3. Add an `Authorization` header check inside the route so only Vercel can call it:
   ```ts
   if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
     return new Response("forbidden", { status: 403 });
   ```
4. Add `CRON_SECRET` to env vars (`openssl rand -base64 32`).
5. Commit, push. Cron appears under Vercel → **Cron Jobs**.

**Check:** Trigger manually from the Cron Jobs UI; verify in logs that it ran.

### Step 12. Custom domain (optional)

1. Buy a domain (~$10–15/yr at Namecheap, Cloudflare Registrar, etc.).
2. Vercel project → **Settings → Domains** → add the domain. Vercel shows you the DNS records to set at your registrar.
3. Once the domain is live, **repeat Step 9** with the new domain so OAuth redirects also work there.

---

## Part D — Day-2 operations

### Updating the app

Any push to `main` triggers a Vercel deploy. Workflow:

```bash
git add .
git commit -m "what changed"
git push
```

Watch the deploy at <https://vercel.com/dashboard>. If a deploy is bad, click the previous deploy → **Promote to Production** to roll back instantly.

### Adding a new user

1. Add their Gmail to **Google OAuth test users** (Step 10).
2. Add their email to `SUPERVISOR_EMAILS` env var if they're a supervisor (then redeploy: project → Deployments → ... → Redeploy).
3. Or, if they're a student, just create the Student record in the app — they can sign in straight away.

### Watching costs

- **Vercel** → Project → Usage. You'll see bandwidth, function execution time, and serverless region usage.
- **Neon** → project dashboard, "Compute hours" — free tier is 191 hours/month of active compute (it auto-pauses when idle).
- **Blob** → Vercel Storage → your blob store → Usage. Free tier: 1 GB storage, 10 GB bandwidth/month.

For ≤20 users you should stay well inside all free tiers.

### When to consider upgrading

- Neon free tier exhausted → Neon Launch plan, $19/mo. Or move to Vercel Postgres paid.
- Vercel Hobby commercial-use concern → Vercel Pro, $20/mo per user.
- Need >100 OAuth users → submit the OAuth consent screen for verification (free, takes 2–6 weeks).

---

## Troubleshooting cheat sheet

| Symptom | Cause | Fix |
|---|---|---|
| Build fails with `P1001` | Neon paused | Open Neon dashboard once to wake it. |
| Sign-in: `redirect_uri_mismatch` | Production URL not in Google OAuth client | Add it under Authorized redirect URIs (Step 9). |
| Sign-in works but app crashes on first page | Database empty after fresh deploy | Re-create supervisor + student records via the UI. |
| Image upload returns 500 | `BLOB_READ_WRITE_TOKEN` not set | Check Vercel env vars; redeploy. |
| `Untrusted Host` error in logs | `AUTH_TRUST_HOST` missing | Set to `true` in env vars (Step 7). |
| Cron never runs | Wrong path in `vercel.json` | Check the route exists at exactly that path. |
