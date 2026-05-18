# Cloudflare Deployment for timeconnector.net

Domain: `timeconnector.net`

## Recommended MVP deployment

Because EnterpriseOS currently has a React frontend plus an Express backend, the safest MVP deployment is:

- `timeconnector.net`: Cloudflare Pages for the React frontend
- `api.timeconnector.net`: Node backend running on a server or Mac mini through Cloudflare Tunnel

This keeps API keys, login sessions, token accounting, Obsidian sync, and file persistence on the backend.

## Cloudflare Pages frontend

Connect the GitHub repository:

```text
git@github.com:johnirving6666sgp/EnterpriseOS.git
```

Pages settings:

```text
Framework preset: Vite
Build command: npm run build
Build output directory: dist
Root directory: /
```

Custom domain:

```text
timeconnector.net
www.timeconnector.net
```

## Backend option A: Cloudflare Tunnel to local/server Node app

Run the backend:

```bash
cp .env.example .env
npm install
npm run build
PORT=8787 npm start
```

Expose it behind:

```text
api.timeconnector.net -> http://localhost:8787
```

Use this when the Obsidian vault lives on your Mac mini or internal server.

## Backend option B: Deploy Node backend to a server platform

Deploy the same repo to a Node host and set:

```text
PORT
SESSION_SECRET
OBSIDIAN_VAULT
ANTHROPIC_API_KEY
OPENAI_API_KEY
OPENROUTER_API_KEY
```

Then point:

```text
api.timeconnector.net -> backend host
```

## Later: Cloudflare-native backend

To run everything Cloudflare-native, migrate the Express API to Cloudflare Workers and move persistence to:

- D1 for relational state
- R2 for files and exports
- Workers KV for small config/session metadata

This is a later hardening step. The current Express backend is faster for MVP iteration.

## DNS checklist

- Add `timeconnector.net` to Cloudflare Pages custom domains
- Add `www.timeconnector.net` as an alias or redirect
- Add `api.timeconnector.net` for the backend
- Enforce HTTPS
- Keep API keys only in backend environment variables
