# NC Website Deployment

## Environment Variables

### Backend (Render)
- `STRIPE_SECRET_KEY` – live/test secret from Stripe.
- `ADMIN_KEY` – strong random string for admin endpoints; must match the frontend admin key when in use.
- `FRONTEND_ORIGIN` – `https://<your-netlify-site>.netlify.app` (https, no trailing slash).
- `FRONTEND_ORIGIN_2` – optional custom domain (`https://example.com`).
- `BACKEND_ORIGIN` – optional explicit backend origin (`https://nc-website.onrender.com`).
- `NODE_VERSION` – `20` (keeps Render on Node 20).
- SMTP vars (if email is enabled): `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

### Frontend (Netlify)
- `VITE_BACKEND_URL` – `https://<your-render-service>.onrender.com` (https, no trailing slash).
- `VITE_STRIPE_PUBLISHABLE_KEY` – Stripe publishable key for the environment.
- `VITE_ADMIN_KEY` – only when the in-browser admin UI is used; must equal the backend `ADMIN_KEY`.

> Optional proxy: Instead of `VITE_BACKEND_URL`, add a redirect in `netlify.toml` pointing `/api/*` to the Render URL and switch the frontend calls to relative `/api/...`. Only use one approach at a time.

## Local Verification
```
# Backend
cd nc-working-backend
npm install
npm run start
# In another terminal
curl http://localhost:8787/api/health
curl http://localhost:8787/api/drop/state

# Frontend
cd frontend
set VITE_BACKEND_URL=http://localhost:8787 && npm install && npm run dev
# mac/linux: export VITE_BACKEND_URL=http://localhost:8787
```
In the browser devtools Network tab, confirm API calls go to `http://localhost:8787/api/...` with 200 responses.

## Production Verification
- `https://<render-service>.onrender.com/` returns `{ ok: true, service: "nc-backend", docs: "/api/health" }`.
- `https://<render-service>.onrender.com/api/health` returns `{ ok: true }`.
- Netlify site loads without `Failed to fetch`; Network tab shows requests hitting the Render host (or `/api/...` when using the proxy) with 200/204 responses.
- If admin UI is enabled, API calls succeed with `x-admin-key` headers and uploads persist after refresh.

## Deploy Steps
1. **Render backend**
   - Set the env vars above (no trailing slash on origins).
   - Redeploy; verify the startup log prints `CORS allowList: [...]` once, then remove or disable the log after confirming the origins.
2. **Netlify frontend (env approach)**
   - Set `VITE_BACKEND_URL` and `VITE_STRIPE_PUBLISHABLE_KEY`.
   - Redeploy; confirm API calls succeed.
3. **Netlify frontend (proxy approach)**
   - Add `/api/*` redirect in `netlify.toml` pointing to the Render URL.
   - Remove `VITE_BACKEND_URL` from the site envs; ensure frontend calls use relative `/api/...`.
   - Redeploy and verify the proxy works.

After verification, remove the temporary `console.log('CORS allowList:', allowList);` in `nc-working-backend/src/index.ts` to keep logs clean.

