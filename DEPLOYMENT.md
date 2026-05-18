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
