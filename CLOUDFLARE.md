# Cloudflare Deployment for timeconnector.net

EnterpriseOS now has a Cloudflare-native MVP path:

- One Cloudflare Worker serves the React app and `/api/*`.
- D1 stores the system state.
- Cloudflare Secrets store model/API keys.
- Cron can run the external opportunity Agent.

This lets `timeconnector.net` run without Render after the Worker is deployed and the custom domain is attached.

## Architecture

```text
timeconnector.net
  -> Cloudflare Worker enterprise-os
     -> Static assets from ./dist
     -> API from ./worker/index.mjs
     -> D1 binding DB
     -> Secrets: OPENROUTER_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY
```

The current Worker keeps the data model intentionally simple: it stores the full EnterpriseOS state as one JSON document in D1 table `app_state`. This is the lowest-risk migration path for trial use. After the workflow stabilizes, split users, conversations, customers, tasks, quotes, broadcasts, and opportunities into proper D1 tables.

## Local Cloudflare Test

```bash
npm install
npm run build
npm run dev:cf
```

Open:

```text
http://localhost:8787
```

If port 8787 is occupied:

```bash
npx wrangler dev --port 8788
```

## Deploy

First run a dry run:

```bash
npm run build:cf
```

Then deploy:

```bash
npm run deploy:cf
```

Wrangler automatic provisioning can create the D1 database from `wrangler.jsonc` if no `database_id` exists yet. If you prefer manual creation:

```bash
npx wrangler d1 create enterprise-os-db
```

Then copy the returned `database_id` into `wrangler.jsonc`.

Apply D1 migrations:

```bash
npx wrangler d1 migrations apply enterprise-os-db --remote
```

## Required Secrets

Use Wrangler's interactive prompts. Do not paste keys into committed files.

```bash
npx wrangler secret put SESSION_SECRET
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put OPENROUTER_BACKUP_API_KEY
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put ANTHROPIC_API_KEY
```

Minimum for trial:

- `SESSION_SECRET`
- `OPENROUTER_API_KEY`
- `OPENAI_API_KEY` for voice transcription

Optional but recommended:

- `OPENROUTER_BACKUP_API_KEY`
- `ANTHROPIC_API_KEY` for direct Claude routing

## Domain Binding

In Cloudflare Dashboard:

1. Go to **Workers & Pages**.
2. Open Worker `enterprise-os`.
3. Go to **Settings -> Domains & Routes**.
4. Add custom domain:

```text
timeconnector.net
```

Optional:

```text
www.timeconnector.net
```

If `www` is used, redirect it to the apex domain for simplicity.

## Test Checklist

After deployment:

```bash
curl https://timeconnector.net/api/health
```

Expected:

```json
{"ok":true,"app":"EnterpriseOS","runtime":"cloudflare-worker","storage":"d1"}
```

Then test in browser:

- Jamie login: `jamie / jamie-demo`
- Coworker login: `larry / demo`, `luyang / demo`, etc.
- Personal Agent chat
- Task generation from chat
- External opportunity Agent run
- Voice transcription

## Important Notes

- OpenRouter is for chat/model calls.
- OpenAI key is required for `/api/speech/transcribe`.
- The Worker is now the preferred deployment path; the Express server can remain for local fallback while the team trials the system.
- 招标详情正文不建议塞进 Worker 定时任务里硬抓。优先用独立 Node 爬虫 `npm run crawl:tender-details` 在 Mac mini、GitHub Actions、Render Cron 或其他定时环境运行，再通过 `/api/opportunities/details` 回写到 Cloudflare Worker。
