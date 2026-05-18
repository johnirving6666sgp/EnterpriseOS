# Enterprise OS Deployment Checklist

## Required environment

```bash
cp .env.example .env
```

Set these values before deployment:

- `SESSION_SECRET`: long random string
- `OBSIDIAN_VAULT`: path to the production Obsidian vault
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`: server-side only

## Build and run

```bash
npm install
npm run build
npm start
```

The production server serves the React app and API from one origin.

## Fast online trial

For Jamie and Guihua to try the product online first, deploy this repository as one Node web service.

Recommended service settings:

```text
Build command: npm install && npm run build
Start command: npm start
Health check path: /api/health
```

Environment variables:

```text
NODE_ENV=production
SESSION_SECRET=<long random string>
SESSION_TTL_MS=604800000
INVITE_CODE=<team invite code>
DATA_DIR=/var/data
APP_ORIGINS=https://enterprise-os.onrender.com,https://timeconnector.net,https://www.timeconnector.net
OPENROUTER_API_KEY=<your OpenRouter key>
OPENROUTER_SITE_URL=https://timeconnector.net
OPENROUTER_APP_NAME=EnterpriseOS
```

Trial accounts:

```text
Jamie:  jamie / jamie-demo
Guihua: guihua / demo
```

Change the demo passwords before inviting the wider team.

## Domain

Cloudflare domain:

```text
timeconnector.net
```

Recommended split for later hardening:

- `timeconnector.net`: Cloudflare Pages frontend
- `api.timeconnector.net`: Express backend on Node server or Mac mini via Cloudflare Tunnel

See `CLOUDFLARE.md` for the full domain deployment plan.

## MVP security rules

- Only Jamie should receive `super_admin`.
- Coworkers only receive their own workspace state from `/api/state`.
- API keys stay in `.env` and are never sent to the browser.
- Use HTTPS in production.
- Replace demo passwords before inviting coworkers.

## Data and knowledge

- File database: `data/store.json`
- Obsidian export: `POST /api/obsidian/sync`
- Generated Markdown folders: `agents/`, `broadcasts/`, `conversations/`, `handoff/`, `insights/`

## Next production hardening

- Move `data/store.json` to Postgres or SQLite.
- Replace demo passwords with SSO or magic links.
- Replace `/api/llm/proxy` simulation with real provider calls.
- Add server-side rate limits and request logs.
- Add backups for database and Obsidian vault.
