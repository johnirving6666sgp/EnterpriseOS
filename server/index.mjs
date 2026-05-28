import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFParse } from 'pdf-parse';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = process.env.DATA_DIR || path.join(rootDir, 'data');
const storePath = path.join(dataDir, 'store.json');
const publicDir = path.join(rootDir, 'dist');
const PORT = Number(process.env.PORT || 8787);
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-enterprise-os-secret';
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 7 * 24 * 60 * 60 * 1000);
const INVITE_CODE = process.env.INVITE_CODE || 'team-test';
const OBSIDIAN_VAULT = process.env.OBSIDIAN_VAULT || path.join(rootDir, 'vault', 'enterprise-os');
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_SITE_URL = process.env.OPENROUTER_SITE_URL || 'https://timeconnector.net';
const OPENROUTER_APP_NAME = process.env.OPENROUTER_APP_NAME || 'EnterpriseOS';
const WORKFLOW_OWNER_ID = process.env.WORKFLOW_OWNER_ID || 'larry';
const workflowSystemAgentIds = new Set(['task', 'quote']);
const allowedOrigins = (process.env.APP_ORIGINS || 'http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176,http://localhost:5177,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:5175,http://127.0.0.1:5176,http://127.0.0.1:5177,https://timeconnector.net,https://www.timeconnector.net')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const modelPricing = {
  lite: { inputPer1k: 0.0008, outputPer1k: 0.004 },
  balanced: { inputPer1k: 0.003, outputPer1k: 0.015 },
  strong: { inputPer1k: 0.015, outputPer1k: 0.075 }
};

const defaultUsers = [
  { id: 'jamie', name: 'Jamie', role: 'super_admin', password: 'jamie-demo' },
  { id: 'larry', name: 'Larry', role: 'coworker', password: 'demo' },
  { id: 'gu', name: 'Gu', role: 'coworker', password: 'demo' },
  { id: 'xiaodong', name: 'Xiaodong', role: 'coworker', password: 'demo' },
  { id: 'heli', name: 'Heli', role: 'coworker', password: 'demo' },
  { id: 'guihua', name: 'Guihua', role: 'coworker', password: 'demo' },
  { id: 'zhiping', name: 'Zhiping', role: 'coworker', password: 'demo' },
  { id: 'luyang', name: 'Luyang', role: 'coworker', password: 'demo' },
  { id: 'kingsong', name: 'Kingsong', role: 'coworker', password: 'demo' }
];

const defaultAgents = {
  jamie: { id: 'jamie', name: 'Jamie_AI', ownerId: 'jamie', modelTier: 'strong', provider: 'claude', apiModel: 'claude-opus-4', active: true },
  larry: { id: 'larry', name: 'Larry_AI', ownerId: 'larry', modelTier: 'balanced', provider: 'claude', apiModel: 'claude-3-7-sonnet', active: true },
  gu: { id: 'gu', name: 'Gu_AI', ownerId: 'gu', modelTier: 'strong', provider: 'claude', apiModel: 'claude-opus-4', active: true },
  xiaodong: { id: 'xiaodong', name: 'Xiaodong_AI', ownerId: 'xiaodong', modelTier: 'balanced', provider: 'claude', apiModel: 'claude-3-7-sonnet', active: true },
  heli: { id: 'heli', name: 'Heli_AI', ownerId: 'heli', modelTier: 'lite', provider: 'claude', apiModel: 'claude-3-5-haiku', active: true },
  guihua: { id: 'guihua', name: 'Guihua_AI', ownerId: 'guihua', modelTier: 'lite', provider: 'claude', apiModel: 'claude-3-5-haiku', active: true },
  zhiping: { id: 'zhiping', name: 'Zhiping_AI', ownerId: 'zhiping', modelTier: 'strong', provider: 'claude', apiModel: 'claude-opus-4', active: true },
  luyang: { id: 'luyang', name: 'Luyang_AI', ownerId: 'luyang', modelTier: 'balanced', provider: 'claude', apiModel: 'claude-3-7-sonnet', active: true },
  kingsong: { id: 'kingsong', name: 'Kingsong_AI', ownerId: 'kingsong', modelTier: 'balanced', provider: 'claude', apiModel: 'claude-3-7-sonnet', active: true }
};

const seed = {
  users: defaultUsers,
  agents: defaultAgents,
  systemAgents: {
    internal: { name: '内部信息 Agent', provider: 'openrouter', apiModel: 'openrouter/openai/gpt-4.1-mini' },
    external: { name: '外部机会 Agent', provider: 'openrouter', apiModel: 'openrouter/openai/gpt-4.1-mini' },
    task: { name: '任务看板 Agent', provider: 'openrouter', apiModel: 'openrouter/openai/gpt-4.1-mini', ownerId: WORKFLOW_OWNER_ID },
    quote: { name: '报价 Agent', provider: 'openrouter', apiModel: 'openrouter/openai/gpt-4.1-mini', ownerId: WORKFLOW_OWNER_ID }
  },
  conversations: {},
  systemAgentOutputs: { internal: [], external: [], task: [], quote: [] },
  generatedOpportunities: [],
  savedOpportunities: { larry: ['aerospace-valve'] },
  conversationArchives: {},
  broadcasts: [
    {
      id: 'bc-plan-larry-gu',
      type: '工作计划',
      title: '高压阀门报价准备',
      content: 'Larry 负责客户场景确认，Gu 补充关键设备参数，明天形成一页报价草案。',
      recipients: ['larry', 'gu'],
      feedback: {},
      readBy: {},
      createdBy: 'jamie',
      createdAt: new Date().toISOString()
    }
  ],
  usage: {},
  auditLog: [],
  meta: { fullTeamTrialActivated: true }
};

const app = express();

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '12mb' }));

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(storePath);
    const store = JSON.parse(await fs.readFile(storePath, 'utf8'));
    let changed = ensureDefaultUsersAndAgents(store);
    if (!store.meta?.fullTeamTrialActivated) {
      for (const id of defaultUsers.map((user) => user.id)) {
        const user = store.users?.find((item) => item.id === id);
        if (user) user.active = true;
        if (store.agents?.[id]) store.agents[id].active = true;
      }
      store.meta = { ...(store.meta ?? {}), fullTeamTrialActivated: true };
      store.auditLog ??= [];
      store.auditLog.unshift({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        actor: 'system',
        action: 'trial.full_team_activated',
        detail: { users: defaultUsers.map((user) => user.id) }
      });
      changed = true;
    }
    if (changed) await writeStore(store);
  } catch {
    await writeStore(seed);
  }
}

function ensureDefaultUsersAndAgents(store) {
  let changed = false;
  store.users ??= [];
  store.agents ??= {};
  store.systemAgents ??= {};
  store.systemAgentOutputs ??= {};
  store.conversations ??= {};
  store.savedOpportunities ??= {};
  store.usage ??= {};
  store.auditLog ??= [];

  for (const [id, agent] of Object.entries(seed.systemAgents)) {
    if (!store.systemAgents[id]) {
      store.systemAgents[id] = { ...agent };
      changed = true;
    } else if (agent.ownerId && !store.systemAgents[id].ownerId) {
      store.systemAgents[id].ownerId = agent.ownerId;
      changed = true;
    }
    if (!store.systemAgentOutputs[id]) {
      store.systemAgentOutputs[id] = [];
      changed = true;
    }
  }

  for (const user of defaultUsers) {
    if (!store.users.some((item) => item.id === user.id)) {
      store.users.push({ ...user, active: true });
      changed = true;
    }
    if (!store.agents[user.id]) {
      store.agents[user.id] = { ...defaultAgents[user.id] };
      changed = true;
    }
    if (!store.conversations[user.id]) {
      store.conversations[user.id] = [];
      changed = true;
    }
    if (!store.savedOpportunities[user.id]) {
      store.savedOpportunities[user.id] = [];
      changed = true;
    }
    if (!store.usage[user.id]) {
      store.usage[user.id] = emptyUsage();
      changed = true;
    }
  }

  const addedUsers = defaultUsers.filter((user) => store.users.some((item) => item.id === user.id));
  if (changed) {
    store.meta = { ...(store.meta ?? {}), teamRosterUpdated20260519: true };
    store.auditLog.unshift({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      actor: 'system',
      action: 'team.roster.synced',
      detail: { users: addedUsers.map((user) => user.id) }
    });
  }
  return changed;
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
  if (Buffer.byteLength(sig) !== Buffer.byteLength(expected)) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const session = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (session.exp && Date.now() > session.exp) return null;
  return session;
}

function isWorkflowOwner(session) {
  return session?.role === 'super_admin' || session?.userId === WORKFLOW_OWNER_ID;
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

function requireSystemAgentRoutePermission(req, res, next) {
  const { id } = req.params;
  if (req.session?.role === 'super_admin') return next();
  if (workflowSystemAgentIds.has(id) && req.session?.userId === WORKFLOW_OWNER_ID) return next();
  return res.status(403).json({ error: workflowSystemAgentIds.has(id) ? 'workflow_owner_only' : 'jamie_only' });
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

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('base64url');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(user, password) {
  if (!password) return false;
  if (user.passwordHash?.startsWith('scrypt:')) {
    const [, salt, storedHash] = user.passwordHash.split(':');
    const hash = crypto.scryptSync(String(password), salt, 64);
    const stored = Buffer.from(storedHash, 'base64url');
    return stored.length === hash.length && crypto.timingSafeEqual(stored, hash);
  }
  return user.password === password;
}

app.post('/api/login', async (req, res) => {
  const { userId, password } = req.body ?? {};
  const store = await readStore();
  const user = store.users.find((item) => item.id === userId);
  if (!user || !verifyPassword(user, password)) return res.status(401).json({ error: 'invalid_credentials' });
  if (user.active === false) return res.status(403).json({ error: 'user_suspended' });
  if (!user.passwordHash) {
    user.passwordHash = hashPassword(password);
    delete user.password;
    recordAudit(store, user.id, 'password.migrated', { userId: user.id });
    await writeStore(store);
  }
  const token = sign({ userId: user.id, role: user.role, name: user.name, iat: Date.now(), exp: Date.now() + SESSION_TTL_MS });
  res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'EnterpriseOS', dataDir, storePath });
});

app.post('/api/register', async (req, res) => {
  const { name, userId, password, inviteCode } = req.body ?? {};
  const cleanId = String(userId || name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const cleanName = String(name || userId || '').trim();
  if (inviteCode !== INVITE_CODE) return res.status(403).json({ error: 'invalid_invite_code' });
  if (!cleanId || !cleanName || !password) return res.status(400).json({ error: 'name_userid_password_required' });
  if (String(password).length < 8) return res.status(400).json({ error: 'password_too_short' });

  const store = await readStore();
  if (store.users.some((item) => item.id === cleanId)) return res.status(409).json({ error: 'user_exists' });

  store.users.push({ id: cleanId, name: cleanName, role: 'coworker', passwordHash: hashPassword(password), active: true });
  store.agents[cleanId] = {
    id: cleanId,
    name: `${cleanName}_AI`,
    ownerId: cleanId,
    modelTier: 'lite',
    provider: 'claude',
    apiModel: 'claude-3-5-haiku',
    active: true
  };
  store.conversations[cleanId] = [
    { at: new Date().toISOString(), from: 'agent', text: `${cleanName}，你的专属助理已经创建。` }
  ];
  store.savedOpportunities[cleanId] = [];
  store.usage[cleanId] = emptyUsage();
  recordAudit(store, cleanId, 'user.registered', { userId: cleanId });
  await writeStore(store);

  const token = sign({ userId: cleanId, role: 'coworker', name: cleanName, iat: Date.now(), exp: Date.now() + SESSION_TTL_MS });
  res.status(201).json({ token, user: { id: cleanId, name: cleanName, role: 'coworker' } });
});

app.get('/api/state', requireAuth, async (req, res) => {
  const store = await readStore();
  if (req.session.role === 'super_admin') {
    return res.json({ ...redactPasswords(store), workflowOwnerId: WORKFLOW_OWNER_ID });
  }
  const ownAgent = store.agents[req.session.userId];
  const userBroadcasts = (store.broadcasts ?? []).filter((item) => item.recipients.includes(req.session.userId));
  let readChanged = false;
  for (const broadcast of userBroadcasts) {
    broadcast.readBy ??= {};
    if (!broadcast.readBy[req.session.userId]) {
      broadcast.readBy[req.session.userId] = { at: new Date().toISOString() };
      readChanged = true;
    }
  }
  if (readChanged) {
    recordAudit(store, req.session.userId, 'broadcast.read', {
      broadcastIds: userBroadcasts.map((item) => item.id)
    });
    await writeStore(store);
  }
  res.json({
    users: [{ id: req.session.userId, name: req.session.name, role: req.session.role }],
    agents: { [req.session.userId]: ownAgent },
    conversations: { [req.session.userId]: store.conversations[req.session.userId] ?? [] },
    systemAgentOutputs: store.systemAgentOutputs ?? { internal: [], external: [] },
    generatedOpportunities: store.generatedOpportunities ?? [],
    savedOpportunities: { [req.session.userId]: store.savedOpportunities[req.session.userId] ?? [] },
    broadcasts: userBroadcasts,
    usage: { [req.session.userId]: store.usage[req.session.userId] ?? emptyUsage() },
    systemAgents: store.systemAgents,
    workflowOwnerId: WORKFLOW_OWNER_ID,
    workflowAgentOutputs: isWorkflowOwner(req.session)
      ? {
          task: store.systemAgentOutputs?.task ?? [],
          quote: store.systemAgentOutputs?.quote ?? []
        }
      : undefined
  });
});

app.post('/api/agents/:id/chat', requireAuth, async (req, res) => {
  const { id } = req.params;
  if (req.session.role !== 'super_admin' && req.session.userId !== id) return res.status(403).json({ error: 'private_workspace' });
  const { message, reply, attachments } = req.body ?? {};
  if (!message) return res.status(400).json({ error: 'message_required' });
  const store = await readStore();
  const agent = store.agents[id];
  if (!agent?.active) return res.status(403).json({ error: 'agent_suspended' });
  const user = store.users.find((item) => item.id === id) ?? { id, name: id, role: 'coworker' };
  const cleanAttachments = await normalizeAttachments(attachments);
  const messageForContext = formatMessageWithAttachments(message, cleanAttachments);
  let agentReply = reply;
  let llm = { provider: 'fallback', simulated: true };
  if (!agentReply) {
    const generated = await generateAgentReply({ store, agent, user, message: messageForContext });
    agentReply = generated.reply;
    llm = generated.llm;
  }
  store.conversations[id] ??= [];
  store.conversations[id].push({
    at: new Date().toISOString(),
    from: 'user',
    actorId: req.session.userId,
    text: messageForContext,
    attachments: cleanAttachments
  });
  store.conversations[id].push({ at: new Date().toISOString(), from: 'agent', text: agentReply });
  const usage = calculateUsage(messageForContext, agentReply, agent.modelTier);
  store.usage[id] = mergeUsage(store.usage[id], usage);
  recordAudit(store, req.session.userId, 'chat.recorded', { agentId: id, usage, llm });
  await writeStore(store);
  res.json({ conversation: store.conversations[id], usage: store.usage[id], reply: agentReply, llm });
});

app.post('/api/agents/:id/conversation/clear', requireAuth, async (req, res) => {
  const { id } = req.params;
  if (req.session.role !== 'super_admin' && req.session.userId !== id) return res.status(403).json({ error: 'private_workspace' });
  const store = await readStore();
  if (!store.agents[id]) return res.status(404).json({ error: 'agent_not_found' });
  store.conversationArchives ??= {};
  store.conversationArchives[id] ??= [];
  if ((store.conversations[id] ?? []).length) {
    store.conversationArchives[id].unshift({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      clearedBy: req.session.userId,
      messages: store.conversations[id]
    });
    store.conversationArchives[id] = store.conversationArchives[id].slice(0, 10);
  }
  store.conversations[id] = [];
  recordAudit(store, req.session.userId, 'conversation.cleared', { agentId: id });
  await writeStore(store);
  res.json({ conversation: store.conversations[id] });
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

app.post('/api/system-agents/:id/route', requireAuth, requireSystemAgentRoutePermission, async (req, res) => {
  const { id } = req.params;
  const { provider, apiModel } = req.body ?? {};
  const store = await readStore();
  if (!store.systemAgents[id]) return res.status(404).json({ error: 'system_agent_not_found' });
  Object.assign(store.systemAgents[id], compact({ provider, apiModel }));
  recordAudit(store, req.session.userId, 'system-agent.route.updated', { id, provider, apiModel });
  await writeStore(store);
  res.json({ systemAgent: store.systemAgents[id] });
});

app.post('/api/system-agents/:id/run', requireAuth, async (req, res) => {
  const { id } = req.params;
  if (id === 'internal' && req.session.role !== 'super_admin') return res.status(403).json({ error: 'jamie_only' });
  if (workflowSystemAgentIds.has(id) && !isWorkflowOwner(req.session)) {
    return res.status(403).json({ error: 'workflow_owner_only' });
  }
  const store = await readStore();
  const systemAgent = store.systemAgents[id];
  if (!systemAgent) return res.status(404).json({ error: 'system_agent_not_found' });
  const generated = await runSystemAgent({ id, store, systemAgent });
  store.systemAgentOutputs ??= { internal: [], external: [] };
  store.systemAgentOutputs[id] ??= [];
  store.systemAgentOutputs[id].unshift(generated.output);
  store.systemAgentOutputs[id] = store.systemAgentOutputs[id].slice(0, 12);
  if (generated.output.opportunity) {
    store.generatedOpportunities ??= [];
    store.generatedOpportunities.unshift(generated.output.opportunity);
    store.generatedOpportunities = store.generatedOpportunities.slice(0, 18);
  }
  const broadcast = createSystemAgentBroadcast(store, req.session.userId, generated.output);
  recordAudit(store, req.session.userId, 'system-agent.run', { id, llm: generated.llm, broadcastId: broadcast?.id });
  await writeStore(store);
  res.json({ output: generated.output, llm: generated.llm, systemAgent, broadcast });
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
  store.users.push({ id: newOwnerId, name: newOwnerName, role: 'coworker', passwordHash: hashPassword(crypto.randomUUID()), active: true });
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
    readBy: {},
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
  const { status, note = '', discussWith = [] } = req.body ?? {};
  if (!status) return res.status(400).json({ error: 'status_required' });
  const store = await readStore();
  const broadcast = (store.broadcasts ?? []).find((item) => item.id === req.params.id);
  if (!broadcast) return res.status(404).json({ error: 'broadcast_not_found' });
  if (!broadcast.recipients.includes(req.session.userId) && req.session.role !== 'super_admin') {
    return res.status(403).json({ error: 'not_a_recipient' });
  }
  const allowedDiscussionUsers = new Set(store.users.filter((item) => item.active !== false).map((item) => item.id));
  const cleanDiscussWith = Array.isArray(discussWith)
    ? discussWith.filter((id) => allowedDiscussionUsers.has(id) && id !== req.session.userId)
    : [];
  broadcast.feedback ??= {};
  broadcast.feedback[req.session.userId] = { status, note, discussWith: cleanDiscussWith, at: new Date().toISOString() };
  let discussionBroadcast = null;
  if (status === '需要讨论' && cleanDiscussWith.length) {
    const requester = store.users.find((item) => item.id === req.session.userId) ?? { name: req.session.name ?? req.session.userId };
    discussionBroadcast = {
      id: crypto.randomUUID(),
      type: '讨论邀请',
      title: `${requester.name} 邀请你讨论：${broadcast.title}`,
      content: [note || '请一起讨论这条内部广播。', `原广播：${broadcast.content}`].join('\n'),
      recipients: cleanDiscussWith,
      feedback: {},
      readBy: {},
      createdBy: req.session.userId,
      createdAt: new Date().toISOString(),
      relatedBroadcastId: broadcast.id
    };
    store.broadcasts ??= [];
    store.broadcasts.unshift(discussionBroadcast);
  }
  recordAudit(store, req.session.userId, 'broadcast.feedback', {
    broadcastId: broadcast.id,
    status,
    discussWith: cleanDiscussWith,
    discussionBroadcastId: discussionBroadcast?.id
  });
  await writeStore(store);
  res.json({ broadcast, discussionBroadcast });
});

app.post('/api/llm/proxy', requireAuth, async (req, res) => {
  const { provider, apiModel, messages = [] } = req.body ?? {};
  const prompt = messages.map((item) => item.content).join('\n');
  if (!OPENROUTER_API_KEY) {
    const simulatedReply = `OpenRouter API key 尚未配置。已收到 ${provider}/${apiModel} 请求，但当前只能返回本地降级回复。`;
    const usage = calculateUsage(prompt, simulatedReply, 'balanced');
    return res.json({ provider, apiModel, reply: simulatedReply, usage, simulated: true });
  }
  try {
    const result = await callOpenRouter({
      model: toOpenRouterModel(apiModel),
      messages,
      temperature: 0.4,
      maxTokens: 900
    });
    const usage = calculateUsage(prompt, result.reply, 'balanced');
    res.json({ provider: 'openrouter', apiModel: result.model, reply: result.reply, usage, simulated: false });
  } catch (error) {
    res.status(502).json({ error: 'openrouter_failed', detail: error.message });
  }
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

async function normalizeAttachments(attachments = []) {
  if (!Array.isArray(attachments)) return [];
  const cleanFiles = await Promise.all(
    attachments.slice(0, 8).map(async (file) => {
      const normalized = compact({
        id: String(file.id ?? ''),
        name: String(file.name ?? '').slice(0, 160),
        type: String(file.type ?? inferAttachmentType(file.name)).slice(0, 120),
        size: Number.isFinite(Number(file.size)) ? Number(file.size) : 0
      });
      if (!normalized.name) return null;

      const extractedText = await extractAttachmentText(file, normalized);
      return compact({
        ...normalized,
        extractedText: extractedText ? truncateText(extractedText, 12000) : '',
        parseNote: extractedText ? '' : String(file.parseNote ?? '未能读取附件正文').slice(0, 160)
      });
    })
  );
  return cleanFiles.filter(Boolean);
}

function formatMessageWithAttachments(message, attachments = []) {
  if (!attachments.length) return message;
  const fileLines = attachments
    .map((file) => {
      const summary = `- ${file.name}（${file.type}，${formatFileSize(file.size)}）`;
      if (!file.extractedText) return `${summary}\n  解析状态：${file.parseNote ?? '未能读取附件正文'}`;
      return `${summary}\n  附件正文摘录：\n${indentText(file.extractedText)}`;
    })
    .join('\n');
  return `${message}\n\n[上传附件]\n${fileLines}`;
}

async function extractAttachmentText(file, normalized) {
  const dataUrl = typeof file.dataUrl === 'string' ? file.dataUrl : '';
  if (!dataUrl) return '';
  try {
    const { buffer, mime } = dataUrlToBuffer(dataUrl);
    const type = normalized.type || mime || '';
    const name = normalized.name.toLowerCase();
    if (type.includes('pdf') || name.endsWith('.pdf')) {
      const parser = new PDFParse({ data: buffer });
      try {
        const parsed = await parser.getText();
        return normalizeExtractedText(parsed.text ?? '');
      } finally {
        await parser.destroy();
      }
    }
    if (type.startsWith('text/') || /\.(txt|md|csv)$/i.test(name)) {
      return normalizeExtractedText(buffer.toString('utf8'));
    }
    return '';
  } catch {
    return '';
  }
}

function dataUrlToBuffer(dataUrl) {
  const match = /^data:([^;,]+)?;base64,(.*)$/s.exec(dataUrl);
  if (!match) return { mime: '', buffer: Buffer.alloc(0) };
  return { mime: match[1] ?? '', buffer: Buffer.from(match[2], 'base64') };
}

function inferAttachmentType(name = '') {
  const lower = String(name).toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.md')) return 'text/markdown';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.txt')) return 'text/plain';
  return '未知类型';
}

function normalizeExtractedText(text) {
  return String(text)
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncateText(text, maxLength) {
  const clean = String(text ?? '');
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength)}\n...（内容较长，已截取前 ${maxLength} 字供本轮分析）`;
}

function indentText(text) {
  return String(text)
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}

function formatFileSize(size = 0) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${size} B`;
}

function mergeUsage(previous = emptyUsage(), next) {
  return {
    calls: previous.calls + next.calls,
    input: previous.input + next.input,
    output: previous.output + next.output,
    cost: previous.cost + next.cost
  };
}

function toOpenRouterModel(apiModel = '') {
  const clean = String(apiModel).replace(/^openrouter\//, '');
  const modelMap = {
    'claude-3-5-haiku': 'anthropic/claude-3.5-haiku',
    'claude-3-7-sonnet': 'openai/gpt-4.1-mini',
    'claude-opus-4': 'anthropic/claude-opus-4',
    'gpt-4.1-mini': 'openai/gpt-4.1-mini',
    'gpt-4.1': 'openai/gpt-4.1',
    'gpt-5.2': 'openai/gpt-5.2'
  };
  return modelMap[clean] ?? clean ?? 'anthropic/claude-3.5-haiku';
}

async function generateAgentReply({ store, agent, user, message }) {
  if (!OPENROUTER_API_KEY) {
    return {
      reply: fallbackAgentReply({ agent, user, message }),
      llm: { provider: 'fallback', simulated: true, reason: 'missing_openrouter_key' }
    };
  }

  const recent = (store.conversations[user.id] ?? []).slice(-10).map((item) => ({
    role: item.from === 'user' ? 'user' : 'assistant',
    content: item.text
  }));
  const model = toOpenRouterModel(agent.apiModel);
  try {
    const result = await callOpenRouter({
      model,
      messages: [
        {
          role: 'system',
          content: [
            `你是 ${agent.name}，服务对象是 ${user.name}。`,
            '你在 EnterpriseOS 里工作。当前不是多公司系统，也不是大企业集团，而是 Jamie 带一个小 team 进行产品试用。',
            '团队方向：悬浮真空熔炼设备、新型金属材料研发、材料选型、设备选型、客户开发和商机判断。',
            '回答要求：直接帮助用户解决当下问题；不要只说“我会记录”；优先输出可执行建议、下一步动作、客户/技术/风险判断。',
            '隐私规则：同事之间的私密聊天不可互相暴露；内部信息 Agent 只能抽象沉淀组织知识，不要泄露其他同事原文。',
            '如果用户指出回答不对，先承认并基于上一轮上下文重新回答。用中文，简洁但有内容。'
          ].join('\n')
        },
        ...recent,
        { role: 'user', content: message }
      ],
      temperature: 0.45,
      maxTokens: 1100
    });
    return {
      reply: result.reply,
      llm: { provider: 'openrouter', model: result.model, simulated: false }
    };
  } catch (error) {
    return {
      reply: `${fallbackAgentReply({ agent, user, message })}\n\n（OpenRouter 调用失败，已使用本地降级回复：${error.message}）`,
      llm: { provider: 'fallback', model, simulated: true, error: error.message }
    };
  }
}

async function callOpenRouter({ model, messages, temperature = 0.4, maxTokens = 900 }) {
  const response = await fetch(OPENROUTER_BASE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': OPENROUTER_SITE_URL,
      'X-Title': OPENROUTER_APP_NAME
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || payload.message || `OpenRouter HTTP ${response.status}`);
  }
  const reply = payload.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error('OpenRouter returned an empty reply');
  return { reply, model: payload.model ?? model };
}

function fallbackAgentReply({ agent, user, message }) {
  if (/不对|不正确|没回答|重新回答|换个回答|没听懂|不满意/.test(message)) {
    return `你说得对，我刚才没有回答到点上。作为 ${agent.name}，我应该先围绕 ${user.name} 的真实工作问题给出下一步动作，而不是只说记录和沉淀。下一步我建议：明确问题目标、拆出客户/技术/风险/动作四类信息，再形成可执行任务。`;
  }
  if (/系统|企业OS|服务|同事|怎么做|如何做/.test(message)) {
    return '要让企业OS更好服务同事，关键是让每次对话直接产出行动：客户跟进、报价草稿、技术排查、会议分工、商机判断。内部知识沉淀应在后台自动发生，不要干扰同事完成眼前工作。';
  }
  if (/悬浮|真空|熔炼|新型金属|金属材料|材料|市场/.test(message)) {
    return '建议先锁定高校/研究院材料实验室、航空航天材料团队、金属粉末与增材制造企业、特种合金小试线。先卖“材料试制/工艺验证”，再推进设备方案，这比直接卖设备更容易打开客户。';
  }
  return `收到。我会以 ${agent.name} 的身份先理解问题本身，再给 ${user.name} 输出可执行建议；如果信息不足，我会追问关键条件，而不是只做归档。`;
}

async function runSystemAgent({ id, store, systemAgent }) {
  const model = toOpenRouterModel(systemAgent.apiModel);
  const compactConversations = Object.entries(store.conversations ?? {})
    .map(([ownerId, conversation]) => {
      const latest = conversation
        .slice(-8)
        .map((item) => `${item.from}: ${item.text}`)
        .join('\n');
      return `## ${ownerId}\n${latest || '暂无对话'}`;
    })
    .join('\n\n');
  const savedSignals = Object.entries(store.savedOpportunities ?? {})
    .map(([ownerId, ids]) => `- ${ownerId}: ${(ids ?? []).join(', ') || '暂无收藏'}`)
    .join('\n');
  const broadcastSignals = (store.broadcasts ?? [])
    .slice(0, 12)
    .map((item) => {
      const feedback = Object.entries(item.feedback ?? {})
        .map(([userId, value]) => `${userId}:${value.status}${value.discussWith?.length ? `->讨论(${value.discussWith.join(',')})` : ''}`)
        .join('; ');
      const readBy = Object.keys(item.readBy ?? {}).join(',') || 'none';
      return `- ${item.type} / ${item.title} / recipients=${item.recipients.join(',')} / readBy=${readBy} / feedback=${feedback || 'none'} / ${item.content}`;
    })
    .join('\n');
  const previousSystemLearning = Object.values(store.systemAgentOutputs ?? {})
    .flat()
    .slice(0, 10)
    .map((item) => `- ${item.title}: ${item.learning || item.text || item.opportunity?.why || ''}`)
    .join('\n');

  if (!OPENROUTER_API_KEY) {
    return {
      output: fallbackSystemAgentOutput(id),
      llm: { provider: 'fallback', simulated: true, reason: 'missing_openrouter_key' }
    };
  }

  const spec = getSystemAgentSpec(id);

  try {
    const result = await callOpenRouter({
      model,
      messages: [
        { role: 'system', content: spec },
        {
          role: 'user',
          content: [
            `这是当前小团队最近对话摘要：\n\n${compactConversations || '暂无对话。'}`,
            `\n\n这是各同事收藏过的商机 ID：\n${savedSignals || '暂无收藏。'}`,
            `\n\n这是近期广播、已读和反馈：\n${broadcastSignals || '暂无广播。'}`,
            `\n\n这是系统 Agent 过去沉淀的学习记忆：\n${previousSystemLearning || '暂无系统学习。'}`
          ].join('\n')
        }
      ],
      temperature: 0.5,
      maxTokens: 900
    });
    const data = parseJsonObject(result.reply);
    return {
      output: normalizeSystemAgentOutput(id, data, result.reply),
      llm: { provider: 'openrouter', model: result.model, simulated: false }
    };
  } catch (error) {
    return {
      output: fallbackSystemAgentOutput(id, error.message),
      llm: { provider: 'fallback', model, simulated: true, error: error.message }
    };
  }
}

function parseJsonObject(text) {
  const clean = String(text).replace(/```json|```/g, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return {};
  try {
    return JSON.parse(clean.slice(start, end + 1));
  } catch {
    return {};
  }
}

function getSystemAgentSpec(id) {
  if (id === 'internal') {
    return [
      '你是内部信息 Agent，目标不是总结，而是从团队内部信息流中发现“巨大商机线索”。',
      '你可以读取原始对话、收藏、广播反馈和讨论邀请，但输出必须去除具体隐私字句，只沉淀可复用模式、专家能力和可行动商机。',
      '重点寻找：客户反复追问、报价卡点、材料/设备能力可复用点、多个同事都碰到的需求、能转化为大客户开发的异常信号。',
      '请只返回 JSON：{"title":"...","text":"...","source":"...","asset":"...","learning":"...","opportunity":{"title":"...","source":"...","match":"...","why":"...","action":"...","urgency":"..."},"broadcast":{"title":"...","content":"..."}}。',
      'broadcast 要写给全员，提醒大家看见同一个巨大商机线索并补充信息。'
    ].join('\n');
  }
  if (id === 'task') {
    return [
      '你是任务看板 Agent，业务负责人是 Larry。目标是把团队信息流转成可执行任务，而不是泛泛总结。',
      '你可以读取原始信息进行任务提取，但输出给 Larry 和同事时不要泄露私密聊天原文，只输出任务标题、负责人、截止时间、优先级、来源类型和下一步。',
      '重点寻找：会议纪要中的分工、客户跟进动作、报价准备、设备参数确认、材料信息补充、广播反馈中的“跟进中/需要讨论”。',
      '请只返回 JSON：{"title":"...","text":"...","learning":"...","tasks":[{"title":"...","owner":"larry|gu|xiaodong|heli|guihua|zhiping|luyang|kingsong","priority":"high|medium|low","due":"今天|明天|本周|待定","source":"对话|广播|商机|会议纪要","next":"..."}],"broadcast":{"title":"...","content":"..."}}。',
      'broadcast 写给相关同事，提醒大家确认分工和反馈卡点。'
    ].join('\n');
  }
  if (id === 'quote') {
    return [
      '你是报价 Agent，业务负责人是 Larry。你理解公司的基础业务：悬浮真空熔炼设备、新型金属材料研发、材料试制、熔炼服务、设备选型和客户开发。',
      '你的目标是把客户需求转成内部报价草案，不直接承诺正式价格；重要报价必须提醒提交 Jamie 审批。',
      '重点提取：客户背景、报价类型（设备/服务/材料试制/工艺验证/打包）、缺失参数、风险、报价组成、交付周期、需要同事补充的信息。',
      '请只返回 JSON：{"title":"...","text":"...","learning":"...","quote":{"customer":"...","type":"设备报价|熔炼服务|材料试制|工艺验证|打包方案","summary":"...","missing":["..."],"risk":["..."],"next":"...","approval":"需要 Jamie 审批|Larry 可继续补充"},"broadcast":{"title":"...","content":"..."}}。',
      'broadcast 写给 Larry 和相关同事，推动补齐参数，而不是把报价发给客户。'
    ].join('\n');
  }
  return [
    '你是外部机会 Agent，目标是把外部信息和内部专家能力相互匹配，找到可能很大的商机线索。',
    '不要假装已经实时联网；如果没有实时新闻，就用“待验证线索”口径，并说明验证路径。',
    '团队方向：悬浮真空熔炼设备、新型金属材料研发、材料试制、设备选型、客户开发。',
    '重点寻找：高校/研究院设备升级、航天军工材料试制、特种合金小试线、真空熔炼/悬浮熔炼需求、进口替代、招投标苗头、供应链价格变化。',
    '请只返回 JSON：{"title":"...","source":"...","match":"...","why":"...","action":"...","urgency":"...","learning":"...","broadcast":{"title":"...","content":"..."}}。',
    'title 要像商机卡片标题，why 要讲清楚为什么可能是大机会，action 要说明同事下一步怎么验证和补充信息。'
  ].join('\n');
}

function normalizeSystemAgentOutput(id, data, raw) {
  if (id === 'task') {
    return {
      id: `task-${Date.now()}`,
      at: new Date().toISOString(),
      title: data.title || '任务 Agent 已生成本周行动清单',
      text: data.text || '任务 Agent 已从对话、广播、收藏商机和会议信息中提取可执行动作。',
      learning: data.learning || '任务 Agent 学习到：团队需要把客户跟进、参数确认、报价准备和讨论邀请统一落到任务看板。',
      tasks: Array.isArray(data.tasks) ? data.tasks.slice(0, 8) : fallbackWorkflowTasks(),
      broadcast: normalizeSystemBroadcast(data.broadcast, {
        type: '工作计划',
        title: data.title || '任务 Agent 生成新的协作任务',
        action: data.text || '请相关同事确认负责人、截止时间和卡点。'
      }),
      raw
    };
  }
  if (id === 'quote') {
    return {
      id: `quote-${Date.now()}`,
      at: new Date().toISOString(),
      title: data.title || '报价 Agent 已生成报价准备建议',
      text: data.text || '报价 Agent 已将客户需求拆成报价类型、缺失参数、风险和下一步。',
      learning: data.learning || '报价 Agent 学习到：设备报价和熔炼服务报价需要先补齐材料体系、单炉重量、批次、检测要求和交付边界。',
      quote: data.quote || fallbackQuoteDraft(),
      broadcast: normalizeSystemBroadcast(data.broadcast, {
        type: '报价方案',
        title: data.title || '报价 Agent 需要补充报价信息',
        action: data.text || '请 Larry 牵头确认客户需求、设备参数、材料体系和是否需要 Jamie 审批。'
      }),
      raw
    };
  }
  if (id === 'external') {
    const opportunity = {
      id: `external-${Date.now()}`,
      title: data.title || '待验证：新型金属材料研发客户线索',
      source: data.source || '外部机会 Agent / OpenRouter',
      match: data.match || '材料与设备能力匹配 78%',
      why: data.why || raw.slice(0, 240),
      action: data.action || '收藏后让个人助理继续拆解客户画像、切入口和下一步验证动作。',
      urgency: data.urgency || '需要 48 小时内验证线索真实性和联系人。'
    };
    return {
      id: opportunity.id,
      at: new Date().toISOString(),
      title: opportunity.title,
      opportunity,
      learning: data.learning || '外部机会 Agent 已将外部线索与内部材料/设备专家能力进行匹配。',
      broadcast: normalizeSystemBroadcast(data.broadcast, opportunity),
      raw
    };
  }
  const internalOpportunity = data.opportunity
    ? {
        id: `internal-opportunity-${Date.now()}`,
        title: data.opportunity.title || data.title || '内部信号触发的大商机线索',
        source: data.opportunity.source || data.source || '内部信息 Agent / 团队对话与反馈',
        match: data.opportunity.match || '内部需求信号与专家能力匹配 82%',
        why: data.opportunity.why || data.text || raw.slice(0, 240),
        action: data.opportunity.action || '广播给全员补充客户、技术参数和验证路径。',
        urgency: data.opportunity.urgency || '建议本周内完成验证。'
      }
    : null;
  return {
    id: `internal-${Date.now()}`,
    at: new Date().toISOString(),
    title: data.title || '小团队试用洞察',
    text: data.text || raw.slice(0, 320),
    source: data.source || '内部信息 Agent / 最近团队对话',
    asset: data.asset || '小团队试用洞察.md',
    learning: data.learning || '内部信息 Agent 已从团队对话、反馈和收藏中提炼可复用专家能力。',
    opportunity: internalOpportunity,
    broadcast: normalizeSystemBroadcast(data.broadcast, internalOpportunity || data),
    raw
  };
}

function normalizeSystemBroadcast(broadcast, source) {
  const title = broadcast?.title || source?.title || '系统 Agent 发现新的商机线索';
  const content =
    broadcast?.content ||
    [source?.why, source?.action, source?.urgency ? `紧急度：${source.urgency}` : ''].filter(Boolean).join('\n');
  return { type: broadcast?.type || source?.type || '商机线索', title, content };
}

function fallbackWorkflowTasks() {
  return [
    {
      title: '确认本周重点客户跟进清单',
      owner: 'larry',
      priority: 'high',
      due: '今天',
      source: '任务 Agent',
      next: 'Larry 先筛出最可能成交或最需要技术支持的客户。'
    },
    {
      title: '补齐报价所需设备和材料参数',
      owner: 'gu',
      priority: 'medium',
      due: '本周',
      source: '报价准备',
      next: '确认关键设备参数、材料体系和交付风险。'
    }
  ];
}

function fallbackQuoteDraft() {
  return {
    customer: '待确认客户',
    type: '打包方案',
    summary: '先判断客户是需要设备整机、熔炼服务、材料试制，还是设备加服务组合。',
    missing: ['材料体系', '单炉重量', '批次数', '检测要求', '交付时间', '客户预算'],
    risk: ['参数不足导致报价偏差', '交付周期和质保边界需要明确', '正式报价前需要 Jamie 审批'],
    next: 'Larry 牵头补齐客户需求，报价 Agent 生成内部草案后提交 Jamie 审批。',
    approval: '需要 Jamie 审批'
  };
}

function fallbackSystemAgentOutput(id, detail = '') {
  if (id === 'task') {
    return normalizeSystemAgentOutput(
      'task',
      {
        title: '任务 Agent：本周任务流转建议',
        text: `建议 Larry 今天先把客户跟进、参数确认、报价准备三类任务分配到人，并要求同事反馈卡点。${detail}`,
        learning: '任务 Agent 将持续把对话、广播反馈和商机收藏转成任务看板动作。',
        tasks: fallbackWorkflowTasks(),
        broadcast: {
          title: '任务 Agent 提醒：请确认本周任务负责人',
          content: '请相关同事确认客户跟进、设备参数和报价准备的负责人、截止时间和卡点。'
        }
      },
      detail
    );
  }
  if (id === 'quote') {
    return normalizeSystemAgentOutput(
      'quote',
      {
        title: '报价 Agent：报价准备建议',
        text: `报价前先确认报价类型、材料体系、单炉重量、批次、检测要求、交付周期和审批边界。${detail}`,
        learning: '报价 Agent 将持续学习设备报价、熔炼服务报价和材料试制报价的结构。',
        quote: fallbackQuoteDraft(),
        broadcast: {
          title: '报价 Agent 提醒：补齐报价参数',
          content: '请 Larry 牵头补齐客户需求、设备/材料参数和交付边界；正式报价前提交 Jamie 审批。'
        }
      },
      detail
    );
  }
  if (id === 'external') {
    return normalizeSystemAgentOutput(
      'external',
      {
        title: '待验证：材料试制切入悬浮真空熔炼设备客户',
        source: '外部机会 Agent / 本地降级',
        match: '材料专家与设备专家能力匹配 80%',
        why: `可先围绕高校材料实验室、航空航天材料团队、特种合金小试线寻找材料试制需求。${detail}`,
        action: '收藏后让个人助理生成客户清单、验证问题和首轮沟通话术。',
        urgency: '48 小时内先验证 10 个潜在客户名单。',
        learning: '外部机会 Agent 通过内部材料/设备能力，优先寻找材料试制切入设备销售的机会。',
        broadcast: {
          title: '外部机会 Agent 发现：材料试制可切入悬浮真空熔炼设备客户',
          content: '请大家补充高校材料实验室、航天材料团队、特种合金小试线等潜在客户线索；收藏后可让个人助理拆客户画像和验证问题。'
        }
      },
      detail
    );
  }
  return normalizeSystemAgentOutput(
    'internal',
    {
      title: '小团队试用洞察：先让 Agent 产出行动',
      text: `当前试用重点应放在真实工作动作：客户跟进、材料试制判断、设备方案和广播反馈。${detail}`,
      source: '内部信息 Agent / 本地降级',
      asset: '小团队试用洞察.md',
      learning: '内部信息 Agent 正在学习材料专家、设备专家和客户开发之间的复用关系。',
      opportunity: {
        title: '内部信号：报价与设备参数卡点可能指向批量客户开发机会',
        source: '内部信息 Agent / 团队对话与广播反馈',
        match: '报价知识卡 + 设备专家能力匹配 84%',
        why: '多个同事围绕报价风险、设备参数和客户背景补充信息，说明市场开发需要统一的技术销售打法。',
        action: '广播给全员，请销售、材料、设备同事补齐客户名单、关键参数和采购顾虑。',
        urgency: '本周内形成第一版客户开发清单。'
      },
      broadcast: {
        title: '内部信息 Agent 发现：报价与设备参数卡点可能变成客户开发机会',
        content: '请大家补充最近遇到的客户采购顾虑、设备参数卡点和报价风险；系统将沉淀为材料/设备专家共同使用的商机线索。'
      }
    },
    detail
  );
}

function createSystemAgentBroadcast(store, actorId, output) {
  const broadcastSource = output.broadcast || (output.opportunity ? normalizeSystemBroadcast(null, output.opportunity) : null);
  if (!broadcastSource?.title || !broadcastSource?.content) return null;
  const recipients = store.users
    .filter((item) => item.role !== 'super_admin' && item.active !== false)
    .map((item) => item.id);
  if (!recipients.length) return null;
  const broadcast = {
    id: crypto.randomUUID(),
    type: broadcastSource.type || '商机线索',
    title: broadcastSource.title,
    content: broadcastSource.content,
    recipients,
    feedback: {},
    readBy: {},
    createdBy: actorId,
    createdAt: new Date().toISOString(),
    relatedSystemOutputId: output.id
  };
  store.broadcasts ??= [];
  store.broadcasts.unshift(broadcast);
  return broadcast;
}

function redactPasswords(store) {
  return {
    ...store,
    users: store.users.map(({ password, passwordHash, ...user }) => user)
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
    `# System Agents\n\n${Object.entries(store.systemAgents ?? {})
      .map(([id, agent]) => `## ${agent.name ?? id}\n- id: ${id}\n- owner: ${agent.ownerId ?? 'Jamie'}\n- model: ${agent.provider}/${agent.apiModel}\n`)
      .join('\n')}`
  );

  const broadcastLines = (store.broadcasts ?? [])
    .map((item) => {
      const feedback = Object.entries(item.feedback ?? {})
        .map(([userId, value]) => `  - ${userId}: ${value.status}${value.note ? ` (${value.note})` : ''}`)
        .join('\n');
      const readBy = Object.keys(item.readBy ?? {}).join(', ') || 'none';
      return `## ${item.title}\n- type: ${item.type}\n- recipients: ${item.recipients.join(', ')}\n- readBy: ${readBy}\n- created: ${item.createdAt}\n\n${item.content}\n\n### Feedback\n${feedback || '- waiting'}\n`;
    })
    .join('\n');
  await fs.writeFile(path.join(OBSIDIAN_VAULT, 'broadcasts', 'broadcast-log.md'), `# Broadcast Log\n\n${broadcastLines}`);
}
