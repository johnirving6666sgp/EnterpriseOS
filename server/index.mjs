import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const storePath = path.join(dataDir, 'store.json');
const publicDir = path.join(rootDir, 'dist');
const PORT = Number(process.env.PORT || 8787);
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-enterprise-os-secret';
const OBSIDIAN_VAULT = process.env.OBSIDIAN_VAULT || path.join(rootDir, 'vault', 'enterprise-os');

const modelPricing = {
  lite: { inputPer1k: 0.0008, outputPer1k: 0.004 },
  balanced: { inputPer1k: 0.003, outputPer1k: 0.015 },
  strong: { inputPer1k: 0.015, outputPer1k: 0.075 }
};

const seed = {
  users: [
    { id: 'jamie', name: 'Jamie', role: 'super_admin', password: 'jamie-demo' },
    { id: 'larry', name: 'Larry', role: 'coworker', password: 'demo' },
    { id: 'gu', name: 'Gu', role: 'coworker', password: 'demo' },
    { id: 'xiaodong', name: 'Xiaodong', role: 'coworker', password: 'demo' },
    { id: 'heli', name: 'Heli', role: 'coworker', password: 'demo' },
    { id: 'guihua', name: 'Guihua', role: 'coworker', password: 'demo' },
    { id: 'zhiping', name: 'Zhiping', role: 'coworker', password: 'demo', active: false }
  ],
  agents: {
    jamie: { id: 'jamie', name: 'Jamie_AI', ownerId: 'jamie', modelTier: 'strong', provider: 'claude', apiModel: 'claude-opus-4', active: true },
    larry: { id: 'larry', name: 'Larry_AI', ownerId: 'larry', modelTier: 'balanced', provider: 'claude', apiModel: 'claude-3-7-sonnet', active: true },
    gu: { id: 'gu', name: 'Gu_AI', ownerId: 'gu', modelTier: 'strong', provider: 'claude', apiModel: 'claude-opus-4', active: true },
    xiaodong: { id: 'xiaodong', name: 'Xiaodong_AI', ownerId: 'xiaodong', modelTier: 'balanced', provider: 'claude', apiModel: 'claude-3-7-sonnet', active: true },
    heli: { id: 'heli', name: 'Heli_AI', ownerId: 'heli', modelTier: 'lite', provider: 'claude', apiModel: 'claude-3-5-haiku', active: true },
    guihua: { id: 'guihua', name: 'Guihua_AI', ownerId: 'guihua', modelTier: 'lite', provider: 'claude', apiModel: 'claude-3-5-haiku', active: true },
    zhiping: { id: 'zhiping', name: 'Zhiping_AI', ownerId: 'zhiping', modelTier: 'strong', provider: 'claude', apiModel: 'claude-opus-4', active: false }
  },
  systemAgents: {
    internal: { name: '内部信息 Agent', provider: 'claude', apiModel: 'claude-3-7-sonnet' },
    external: { name: '外部机会 Agent', provider: 'openrouter', apiModel: 'openrouter/openai/gpt-4.1' }
  },
  conversations: {},
  savedOpportunities: { larry: ['aerospace-valve'] },
  broadcasts: [
    {
      id: 'bc-plan-larry-gu',
      type: '工作计划',
      title: '高压阀门报价准备',
      content: 'Larry 负责客户场景确认，Gu 补充关键设备参数，明天形成一页报价草案。',
      recipients: ['larry', 'gu'],
      feedback: {},
      createdBy: 'jamie',
      createdAt: new Date().toISOString()
    }
  ],
  usage: {},
  auditLog: []
};

const app = express();
app.use(express.json({ limit: '2mb' }));

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(storePath);
  } catch {
    await writeStore(seed);
  }
}

async function readStore() {
  await ensureStore();
  return JSON.parse(await fs.readFile(storePath, 'utf8'));
}

async function writeStore(store) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(store, null, 2));
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verify(token) {
  if (!token?.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const session = verify(token);
  if (!session) return res.status(401).json({ error: 'unauthorized' });
  req.session = session;
  next();
}

function requireJamie(req, res, next) {
  if (req.session?.role !== 'super_admin') return res.status(403).json({ error: 'jamie_only' });
  next();
}

function estimateTokens(text = '') {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const words = (text.replace(/[\u4e00-\u9fff]/g, ' ').match(/[A-Za-z0-9_]+/g) ?? []).length;
  return Math.max(1, Math.ceil(cjk * 0.75 + words * 1.25));
}

function recordAudit(store, actor, action, detail) {
  store.auditLog.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), actor, action, detail });
  store.auditLog = store.auditLog.slice(0, 500);
}

app.post('/api/login', async (req, res) => {
  const { userId, password } = req.body ?? {};
  const store = await readStore();
  const user = store.users.find((item) => item.id === userId);
  if (!user || user.password !== password) return res.status(401).json({ error: 'invalid_credentials' });
  if (user.active === false) return res.status(403).json({ error: 'user_suspended' });
  const token = sign({ userId: user.id, role: user.role, name: user.name, iat: Date.now() });
  res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
});

app.get('/api/state', requireAuth, async (req, res) => {
  const store = await readStore();
  if (req.session.role === 'super_admin') {
    return res.json(redactPasswords(store));
  }
  const ownAgent = store.agents[req.session.userId];
  res.json({
    users: [{ id: req.session.userId, name: req.session.name, role: req.session.role }],
    agents: { [req.session.userId]: ownAgent },
    conversations: { [req.session.userId]: store.conversations[req.session.userId] ?? [] },
    savedOpportunities: { [req.session.userId]: store.savedOpportunities[req.session.userId] ?? [] },
    broadcasts: (store.broadcasts ?? []).filter((item) => item.recipients.includes(req.session.userId)),
    usage: { [req.session.userId]: store.usage[req.session.userId] ?? emptyUsage() },
    systemAgents: store.systemAgents
  });
});

app.post('/api/agents/:id/chat', requireAuth, async (req, res) => {
  const { id } = req.params;
  if (req.session.role !== 'super_admin' && req.session.userId !== id) return res.status(403).json({ error: 'private_workspace' });
  const { message, reply } = req.body ?? {};
  if (!message || !reply) return res.status(400).json({ error: 'message_and_reply_required' });
  const store = await readStore();
  const agent = store.agents[id];
  if (!agent?.active) return res.status(403).json({ error: 'agent_suspended' });
  store.conversations[id] ??= [];
  store.conversations[id].push({ at: new Date().toISOString(), from: 'user', text: message });
  store.conversations[id].push({ at: new Date().toISOString(), from: 'agent', text: reply });
  const usage = calculateUsage(message, reply, agent.modelTier);
  store.usage[id] = mergeUsage(store.usage[id], usage);
  recordAudit(store, req.session.userId, 'chat.recorded', { agentId: id, usage });
  await writeStore(store);
  res.json({ conversation: store.conversations[id], usage: store.usage[id] });
});

app.post('/api/agents/:id/route', requireAuth, requireJamie, async (req, res) => {
  const { id } = req.params;
  const { modelTier, provider, apiModel } = req.body ?? {};
  const store = await readStore();
  if (!store.agents[id]) return res.status(404).json({ error: 'agent_not_found' });
  Object.assign(store.agents[id], compact({ modelTier, provider, apiModel }));
  recordAudit(store, req.session.userId, 'agent.route.updated', { agentId: id, modelTier, provider, apiModel });
  await writeStore(store);
  res.json({ agent: store.agents[id] });
});

app.post('/api/system-agents/:id/route', requireAuth, requireJamie, async (req, res) => {
  const { id } = req.params;
  const { provider, apiModel } = req.body ?? {};
  const store = await readStore();
  if (!store.systemAgents[id]) return res.status(404).json({ error: 'system_agent_not_found' });
  Object.assign(store.systemAgents[id], compact({ provider, apiModel }));
  recordAudit(store, req.session.userId, 'system-agent.route.updated', { id, provider, apiModel });
  await writeStore(store);
  res.json({ systemAgent: store.systemAgents[id] });
});

app.post('/api/agents/:id/suspend', requireAuth, requireJamie, async (req, res) => {
  const store = await readStore();
  const agent = store.agents[req.params.id];
  if (!agent) return res.status(404).json({ error: 'agent_not_found' });
  agent.active = false;
  const user = store.users.find((item) => item.id === agent.ownerId);
  if (user) user.active = false;
  recordAudit(store, req.session.userId, 'agent.suspended', { agentId: req.params.id });
  await writeStore(store);
  res.json({ agent });
});

app.post('/api/agents/:id/transfer', requireAuth, requireJamie, async (req, res) => {
  const { newOwnerId, newOwnerName } = req.body ?? {};
  if (!newOwnerId || !newOwnerName) return res.status(400).json({ error: 'new_owner_required' });
  const store = await readStore();
  const agent = store.agents[req.params.id];
  if (!agent) return res.status(404).json({ error: 'agent_not_found' });
  const previousOwner = agent.ownerId;
  store.users.push({ id: newOwnerId, name: newOwnerName, role: 'coworker', password: 'demo', active: true });
  agent.ownerId = newOwnerId;
  agent.active = true;
  agent.transferredFrom = previousOwner;
  store.conversations[newOwnerId] = store.conversations[previousOwner] ?? [];
  store.savedOpportunities[newOwnerId] = store.savedOpportunities[previousOwner] ?? [];
  store.usage[newOwnerId] = store.usage[previousOwner] ?? emptyUsage();
  recordAudit(store, req.session.userId, 'agent.transferred', { agentId: req.params.id, previousOwner, newOwnerId });
  await writeStore(store);
  res.json({ agent });
});

app.post('/api/opportunities/:id/save', requireAuth, async (req, res) => {
  const ownerId = req.session.userId;
  const store = await readStore();
  store.savedOpportunities[ownerId] ??= [];
  if (!store.savedOpportunities[ownerId].includes(req.params.id)) store.savedOpportunities[ownerId].push(req.params.id);
  recordAudit(store, ownerId, 'opportunity.saved', { opportunityId: req.params.id });
  await writeStore(store);
  res.json({ saved: store.savedOpportunities[ownerId] });
});

app.post('/api/broadcasts', requireAuth, requireJamie, async (req, res) => {
  const { type, title, content, recipients } = req.body ?? {};
  if (!title || !content || !Array.isArray(recipients) || !recipients.length) {
    return res.status(400).json({ error: 'broadcast_requires_title_content_recipients' });
  }
  const store = await readStore();
  const allowedRecipients = new Set(store.users.filter((item) => item.role !== 'super_admin' && item.active !== false).map((item) => item.id));
  const cleanRecipients = recipients.filter((id) => allowedRecipients.has(id));
  if (!cleanRecipients.length) return res.status(400).json({ error: 'no_valid_recipients' });
  const broadcast = {
    id: crypto.randomUUID(),
    type: type || '工作计划',
    title,
    content,
    recipients: cleanRecipients,
    feedback: {},
    createdBy: req.session.userId,
    createdAt: new Date().toISOString()
  };
  store.broadcasts ??= [];
  store.broadcasts.unshift(broadcast);
  recordAudit(store, req.session.userId, 'broadcast.created', { broadcastId: broadcast.id, recipients: cleanRecipients });
  await writeStore(store);
  res.json({ broadcast });
});

app.post('/api/broadcasts/:id/feedback', requireAuth, async (req, res) => {
  const { status, note = '' } = req.body ?? {};
  if (!status) return res.status(400).json({ error: 'status_required' });
  const store = await readStore();
  const broadcast = (store.broadcasts ?? []).find((item) => item.id === req.params.id);
  if (!broadcast) return res.status(404).json({ error: 'broadcast_not_found' });
  if (!broadcast.recipients.includes(req.session.userId) && req.session.role !== 'super_admin') {
    return res.status(403).json({ error: 'not_a_recipient' });
  }
  broadcast.feedback ??= {};
  broadcast.feedback[req.session.userId] = { status, note, at: new Date().toISOString() };
  recordAudit(store, req.session.userId, 'broadcast.feedback', { broadcastId: broadcast.id, status });
  await writeStore(store);
  res.json({ broadcast });
});

app.post('/api/llm/proxy', requireAuth, async (req, res) => {
  const { provider, apiModel, messages = [] } = req.body ?? {};
  const prompt = messages.map((item) => item.content).join('\n');
  const simulatedReply = `已通过 ${provider}/${apiModel} 接收请求。生产环境会在后端安全注入 API Key 并返回真实模型响应。`;
  const usage = calculateUsage(prompt, simulatedReply, 'balanced');
  res.json({ provider, apiModel, reply: simulatedReply, usage, simulated: true });
});

app.post('/api/obsidian/sync', requireAuth, requireJamie, async (_req, res) => {
  const store = await readStore();
  await writeObsidian(store);
  recordAudit(store, 'jamie', 'obsidian.synced', { vault: OBSIDIAN_VAULT });
  await writeStore(store);
  res.json({ ok: true, vault: OBSIDIAN_VAULT });
});

app.use(express.static(publicDir));
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(publicDir, 'index.html'));
});

await ensureStore();
app.listen(PORT, () => {
  console.log(`Enterprise OS listening on http://localhost:${PORT}`);
});

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== ''));
}

function emptyUsage() {
  return { calls: 0, input: 0, output: 0, cost: 0 };
}

function calculateUsage(inputText, outputText, modelTier) {
  const input = estimateTokens(inputText);
  const output = estimateTokens(outputText);
  const pricing = modelPricing[modelTier] ?? modelPricing.balanced;
  return {
    calls: 1,
    input,
    output,
    cost: (input / 1000) * pricing.inputPer1k + (output / 1000) * pricing.outputPer1k
  };
}

function mergeUsage(previous = emptyUsage(), next) {
  return {
    calls: previous.calls + next.calls,
    input: previous.input + next.input,
    output: previous.output + next.output,
    cost: previous.cost + next.cost
  };
}

function redactPasswords(store) {
  return {
    ...store,
    users: store.users.map(({ password, ...user }) => user)
  };
}

async function writeObsidian(store) {
  await fs.mkdir(OBSIDIAN_VAULT, { recursive: true });
  await fs.mkdir(path.join(OBSIDIAN_VAULT, 'conversations'), { recursive: true });
  await fs.mkdir(path.join(OBSIDIAN_VAULT, 'agents'), { recursive: true });
  await fs.mkdir(path.join(OBSIDIAN_VAULT, 'insights'), { recursive: true });
  await fs.mkdir(path.join(OBSIDIAN_VAULT, 'broadcasts'), { recursive: true });
  await fs.mkdir(path.join(OBSIDIAN_VAULT, 'handoff'), { recursive: true });

  for (const [id, conversation] of Object.entries(store.conversations)) {
    const body = conversation.map((item) => `- ${item.at ?? ''} **${item.from}**: ${item.text}`).join('\n');
    await fs.writeFile(path.join(OBSIDIAN_VAULT, 'conversations', `${id}.md`), `# ${id} conversations\n\n${body}\n`);
  }

  const agentLines = Object.values(store.agents)
    .map((agent) => `## ${agent.name}\n- owner: ${agent.ownerId}\n- active: ${agent.active}\n- model: ${agent.provider}/${agent.apiModel}\n`)
    .join('\n');
  await fs.writeFile(path.join(OBSIDIAN_VAULT, 'agents', 'agent-registry.md'), `# Agent Registry\n\n${agentLines}`);

  const auditLines = store.auditLog.map((item) => `- ${item.at} ${item.actor} ${item.action} ${JSON.stringify(item.detail)}`).join('\n');
  await fs.writeFile(path.join(OBSIDIAN_VAULT, 'handoff', 'audit-log.md'), `# Audit Log\n\n${auditLines}\n`);

  await fs.writeFile(
    path.join(OBSIDIAN_VAULT, 'insights', 'system-agents.md'),
    `# System Agents\n\n## 内部信息 Agent\n${store.systemAgents.internal.provider}/${store.systemAgents.internal.apiModel}\n\n## 外部机会 Agent\n${store.systemAgents.external.provider}/${store.systemAgents.external.apiModel}\n`
  );

  const broadcastLines = (store.broadcasts ?? [])
    .map((item) => {
      const feedback = Object.entries(item.feedback ?? {})
        .map(([userId, value]) => `  - ${userId}: ${value.status}${value.note ? ` (${value.note})` : ''}`)
        .join('\n');
      return `## ${item.title}\n- type: ${item.type}\n- recipients: ${item.recipients.join(', ')}\n- created: ${item.createdAt}\n\n${item.content}\n\n### Feedback\n${feedback || '- waiting'}\n`;
    })
    .join('\n');
  await fs.writeFile(path.join(OBSIDIAN_VAULT, 'broadcasts', 'broadcast-log.md'), `# Broadcast Log\n\n${broadcastLines}`);
}
