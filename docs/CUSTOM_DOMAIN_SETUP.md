# Moving PhDapp to a custom domain (e.g. `phdapp.imse-cnm.csic.es`)

## ⚠️ Read this first: it does **not** fix the current network block

The access problem at IMSE (Sep 2026) is an **IP-level block**: the institute's
firewall silently drops packets to Vercel's addresses (`64.29.17.131`,
`216.198.79.131`) — confirmed because `nc -vz 64.29.17.131 443` hangs, i.e. the
connection dies before TLS, so the hostname is never even seen.

A custom domain still resolves to **those same Vercel addresses**, so on its own
it would be blocked identically. **The firewall allowlist request to IT is still
required.**

### Why do it anyway

- **It strengthens the IT request.** "Please allow our institutional service at
  `phdapp.imse-cnm.csic.es`" is a much easier ask than "please allow
  `*.vercel.app`", which is a category IT blocks on purpose.
- **Immunity to future category blocks.** Free-hosting domains get swept into
  blocklists periodically; an institutional domain does not.
- **Stability and identity** — the URL no longer depends on the hosting provider,
  so PhDapp can later move hosts without changing the address everyone uses.

---

## Step 1 — Add the domain in Vercel (you, ~2 min)

1. Vercel dashboard → project **phdapp** → **Settings** → **Domains**.
2. Add `phdapp.imse-cnm.csic.es`.
3. Vercel shows the **exact DNS record** it needs. Copy it verbatim — that's what
   you send IT in Step 2. For a subdomain it will be a `CNAME`, currently
   `cname.vercel-dns.com` (always use the value the dashboard shows, not this
   doc, in case Vercel changes it).

Leave `phdapp.vercel.app` in place. Both domains work simultaneously, so nothing
breaks while DNS propagates.

## Step 2 — What to ask IT (DNS)

> Solicitamos la creación del siguiente registro DNS para un servicio interno del
> grupo:
>
> - **Tipo:** CNAME
> - **Nombre:** `phdapp.imse-cnm.csic.es`
> - **Valor:** `cname.vercel-dns.com.`  *(valor exacto indicado por el proveedor)*
> - **TTL:** por defecto (3600)
>
> El subdominio apunta al alojamiento de PhDapp, la plataforma interna con la que
> el grupo coordina la supervisión de los doctorandos.

Two things to flag to them in the same message:

- **The firewall allowlist is still needed** (`64.29.17.0/24`, `216.198.79.0/24`),
  because the subdomain resolves to those same addresses.
- **CAA records:** if `csic.es` publishes CAA records, they must permit
  `letsencrypt.org`, otherwise Vercel cannot issue the TLS certificate.

Once the record exists, Vercel provisions the HTTPS certificate automatically
(usually minutes). The domain shows as **Valid** in Settings → Domains.

## Step 3 — Update Google sign-in ⚠️ (sign-in breaks without this)

Google Cloud Console → **APIs & Services** → **Credentials** → the OAuth 2.0
Client ID used by PhDapp:

- **Authorized JavaScript origins** — add:
  `https://phdapp.imse-cnm.csic.es`
- **Authorized redirect URIs** — add:
  `https://phdapp.imse-cnm.csic.es/api/auth/callback/google`

Keep the existing `phdapp.vercel.app` entries during the transition; remove them
only once the new domain is confirmed working.

Also check **OAuth consent screen → Authorized domains**: add `csic.es` if the
list is in use.

## Step 4 — Update environment variables

Vercel → **Settings** → **Environment Variables** (Production):

| Variable | New value |
|---|---|
| `AUTH_URL` | `https://phdapp.imse-cnm.csic.es` |
| `AUTH_TRUST_HOST` | `true` (leave as is) |

Redeploy after changing these — env vars are read at build/run time.

## Step 5 — Update the hardcoded URLs in the code

Three places still contain `https://phdapp.vercel.app` and would keep sending
people to the old address (they appear in **emails**, so they're easy to miss):

- `src/app/api/cron/weekly-digest/route.ts:97` — "Open PhDapp →" link in the
  weekly digest email
- `src/lib/notify.ts:47` — notification deep links
- `src/lib/notify.ts:48` — notification fallback link

Best fix: replace them with a single env var (e.g. `APP_URL`) so the address
lives in one place and never needs a code change again. *(Ask Claude to do this
— it's a small, mechanical change.)*

## Step 6 — Verify

- [ ] `https://phdapp.imse-cnm.csic.es` loads (from 5G if the firewall block is
      still in place)
- [ ] Certificate is valid (no browser warning)
- [ ] **Google sign-in completes** — the most common failure point
- [ ] Google Drive / Calendar features still work after signing in
- [ ] A notification or digest email links to the new domain (Step 5)

## Step 7 — Make it primary (optional, after verification)

In Vercel → Settings → Domains, set `phdapp.imse-cnm.csic.es` as the primary
production domain. Vercel then redirects `phdapp.vercel.app` to it, so old links
and bookmarks keep working.

---

## Rollback

Nothing here is destructive. If something goes wrong, `phdapp.vercel.app`
continues to serve the app throughout — revert `AUTH_URL` and redeploy, and
you're back to the previous state.

## Summary of who does what

| Step | Who |
|---|---|
| Add domain in Vercel, copy DNS record | You |
| Create the CNAME record + firewall allowlist | IT |
| Google OAuth origins + redirect URIs | You (Google Cloud Console) |
| `AUTH_URL` env var + redeploy | You (Vercel) |
| Replace hardcoded URLs in code | Claude |
