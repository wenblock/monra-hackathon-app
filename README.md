# Monra Hackathon App

Monorepo for the Monra frontend and backend.

## Apps

- `frontend`: Vite/React app intended for Vercel at `https://app.monra.io`
- `backend`: Express API intended for Railway at `https://api.monra.io`

## Local setup

1. Copy `frontend/.env.example` to `frontend/.env`
2. Copy `backend/.env.example` to `backend/.env`
3. Install dependencies in each app:
   - `cd frontend && npm install`
   - `cd backend && npm install`
4. Run both apps locally:
   - `cd backend && npm run dev`
   - `cd frontend && npm run dev`

## Environment ownership

### Vercel frontend variables

These values are public at build time and must not contain secrets:

- `VITE_API_BASE_URL`
- `VITE_CDP_PROJECT_ID`
- `VITE_CDP_CREATE_SOLANA_ACCOUNT`
- `VITE_CDP_CREATE_ETHEREUM_ACCOUNT_TYPE` (optional)

### Railway backend variables

These values are secrets or server-only settings and must stay out of the frontend:

- `DATABASE_URL`
- `ALLOWED_ORIGINS`
- `CDP_API_KEY_ID`
- `CDP_API_KEY_SECRET`
- `ALCHEMY_API_KEY`
- `ALCHEMY_WEBHOOK_ID`
- `ALCHEMY_WEBHOOK_AUTH_TOKEN`
- `ALCHEMY_WEBHOOK_SIGNING_KEY`
- `BRIDGE_API_KEY`
- `BRIDGE_API_BASE_URL`
- `OUTBOUND_REQUEST_RETRIES` (optional)
- `OUTBOUND_REQUEST_TIMEOUT_MS` (optional)
- `PG_POOL_MAX` (optional)
- `PG_POOL_IDLE_TIMEOUT_MS` (optional)
- `PG_POOL_CONNECTION_TIMEOUT_MS` (optional)
- `PG_POOL_MAX_LIFETIME_SECONDS` (optional)
- `ALCHEMY_WEBHOOK_CONCURRENCY` (optional)
- `RECONCILIATION_INTERVAL_MS` (optional)
- `STREAM_TOKEN_SECRET`

## Deployment notes

- Keep the repository private.
- Do not commit real `.env` files.
- Rotate any secret that was previously stored in a tracked env file before going live.
- For legacy Railway databases that predate `public_id`, use `backend/src/db/manual/check_public_id_recovery.sql` to verify whether `011_public_ids.sql` was recorded and whether the `public_id` columns and unique indexes actually exist before restarting a crash-looping backend.
