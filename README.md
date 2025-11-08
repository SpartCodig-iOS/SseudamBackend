# NodeServer

Node.js (TypeScript) reimplementation of the Vapor API. It mirrors the existing functionality: Supabase-backed signup/login, JWT auth with access+refresh tokens, profile endpoints, and the same OpenAPI document at `/docs`.

## Requirements

- Node.js 18+
- PostgreSQL database with the same schema (`users` table, etc.)
- Supabase project + service role key (for admin user management)

## Getting Started

```bash
cp .env.example .env
# edit the env file with your real secrets

npm install
npm run dev
```

The API listens on `PORT` (default `8080`). Swagger UI is available at `http://localhost:8080/docs`.

### Database configuration

You can provide either `DATABASE_URL` (preferred) or the individual `DATABASE_*` variables. The server automatically:

- enables TLS for Supabase/Render-style hosts (unless overridden)
- forces IPv4 lookups when `DATABASE_FORCE_IPV4=1` or the host looks like `*.supabase.co`

### Supabase configuration

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The server uses admin APIs to create/delete users and synchronise the `profiles` table (name configurable via `SUPABASE_PROFILE_TABLE`).

### Scripts

- `npm run dev` – start in watch mode (ts-node-dev)
- `npm run build` – compile TypeScript to `dist/`
- `npm start` – run the compiled JavaScript

## API surface

- `GET /health` – checks DB availability
- `POST /api/v1/auth/signup`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/auth/me`
- `GET /api/v1/auth/profile`
- `DELETE /api/v1/auth/profile`

All JSON responses follow the `{ code, data?, message? }` envelope from the original service.
