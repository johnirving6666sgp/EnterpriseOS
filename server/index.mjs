import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFParse } from 'pdf-parse';
import { fallbackTenderKeywords, scanTenderSources } from './tender-scanner.mjs';

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
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = process.env.ANTHROPIC_VERSION || '2023-06-01';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions';
const OPENAI_TRANSCRIPTION_URL = process.env.OPENAI_TRANSCRIPTION_URL || 'https://api.openai.com/v1/audio/transcriptions';
const OPENAI_TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL || 'whisper-1';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_BACKUP_API_KEY = process.env.OPENROUTER_BACKUP_API_KEY || process.env.OPENROUTER_API_KEY_BACKUP || '';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_SITE_URL = process.env.OPENROUTER_SITE_URL || 'https://timeconnector.net';
const OPENROUTER_APP_NAME = process.env.OPENROUTER_APP_NAME || 'EnterpriseOS';
const OPENROUTER_TIMEOUT_MS = Number(process.env.OPENROUTER_TIMEOUT_MS || 30000);
const OPENROUTER_RETRY_COUNT = Number(process.env.OPENROUTER_RETRY_COUNT || 1);
const OPENROUTER_HAS_ANY_KEY = Boolean(OPENROUTER_API_KEY || OPENROUTER_BACKUP_API_KEY);
const ANTHROPIC_HAS_ANY_KEY = Boolean(ANTHROPIC_API_KEY || OPENROUTER_HAS_ANY_KEY);
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || OPENROUTER_TIMEOUT_MS);
const OPENAI_RETRY_COUNT = Number(process.env.OPENAI_RETRY_COUNT || OPENROUTER_RETRY_COUNT);
const ANTHROPIC_TIMEOUT_MS = Number(process.env.ANTHROPIC_TIMEOUT_MS || OPENROUTER_TIMEOUT_MS);
const ANTHROPIC_RETRY_COUNT = Number(process.env.ANTHROPIC_RETRY_COUNT || OPENROUTER_RETRY_COUNT);
const WORKFLOW_OWNER_ID = process.env.WORKFLOW_OWNER_ID || 'larry';
const fixedSystemAgentIds = ['external', 'customer', 'task', 'quote', 'internal'];
const workflowSystemAgentIds = new Set(['task', 'quote', 'customer']);
const businessRoles = new Set(['sales', 'technical', 'management', 'admin', 'tester']);
const tenderKeywords = (process.env.TENDER_KEYWORDS || fallbackTenderKeywords.join(','))
  .split(',')
  .map((keyword) => keyword.trim())
  .filter(Boolean);
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
  larry: { id: 'larry', name: 'Larry_AI', ownerId: 'larry', modelTier: 'strong', provider: 'claude', apiModel: 'claude-opus-4', active: true },
  gu: { id: 'gu', name: 'Gu_AI', ownerId: 'gu', modelTier: 'strong', provider: 'claude', apiModel: 'claude-opus-4', active: true },
  xiaodong: { id: 'xiaodong', name: 'Xiaodong_AI', ownerId: 'xiaodong', modelTier: 'balanced', provider: 'claude', apiModel: 'claude-sonnet-4', active: true },
  heli: { id: 'heli', name: 'Heli_AI', ownerId: 'heli', modelTier: 'lite', provider: 'claude', apiModel: 'claude-3-5-haiku', active: true },
  guihua: { id: 'guihua', name: 'Guihua_AI', ownerId: 'guihua', modelTier: 'lite', provider: 'claude', apiModel: 'claude-3-5-haiku', active: true },
  zhiping: { id: 'zhiping', name: 'Zhiping_AI', ownerId: 'zhiping', modelTier: 'strong', provider: 'claude', apiModel: 'claude-opus-4', active: true },
  luyang: { id: 'luyang', name: 'Luyang_AI', ownerId: 'luyang', modelTier: 'balanced', provider: 'claude', apiModel: 'claude-sonnet-4', active: true },
  kingsong: { id: 'kingsong', name: 'Kingsong_AI', ownerId: 'kingsong', modelTier: 'balanced', provider: 'claude', apiModel: 'claude-sonnet-4', active: true }
};

const defaultTasks = [
  { id: 'task-research-budget', title: '联系华东有色金属研究院，确认设备升级预算', tag: '客户跟进', owner: 'luyang', collaborators: [], due: '5 天后', priority: 'high', status: 'todo', source: '客户管理', next: '确认预算、采购流程和是否需要材料试制切入。' },
  { id: 'task-valve-asset', title: '整理 4 代核电阀门参数文档', tag: '专家资产', owner: 'gu', collaborators: ['kingsong'], due: '已逾期', priority: 'high', status: 'todo', source: '内部信息', next: '把关键参数、适用场景和报价风险整理成专家资产。' },
  { id: 'task-vacuum-supplier', title: '对比 3 家真空熔炼设备供应商报价', tag: '设备选型', owner: 'kingsong', collaborators: [], due: '2 天后', priority: 'medium', status: 'todo', source: '报价准备', next: '对比配置、交付周期、质保范围和价格差异。' },
  { id: 'task-aerospace-quote', title: '生成某航天厂高压阀门报价方案', tag: '报价方案', owner: 'larry', collaborators: ['gu'], due: '今天', priority: 'high', status: 'progress', source: '商机收藏', next: '补齐客户场景和关键设备参数，形成内部报价草案。' },
  { id: 'task-alloy-market', title: '耐腐蚀合金材料价格走势分析', tag: '市场分析', owner: 'guihua', collaborators: [], due: '1 天后', priority: 'medium', status: 'progress', source: '外部商机', next: '判断价格波动对报价策略和客户采购时机的影响。' },
  { id: 'task-gu-review', title: 'Gu 提交的阀门专家资产文档', tag: '专家资产', owner: 'gu', collaborators: [], due: '1 天后', priority: 'medium', status: 'review', source: '内部信息', next: '确认是否可发布为全员助理后台知识。' },
  { id: 'task-aerospace-screening', title: '某航天厂需求初筛判断', tag: '商机跟进', owner: 'larry', collaborators: [], due: '已完成', priority: 'low', status: 'done', source: '商机雷达', next: '已完成需求初筛。' },
  { id: 'task-industry-report', title: '全网行业线索汇总报告', tag: '市场信息', owner: 'xiaodong', collaborators: [], due: '已完成', priority: 'low', status: 'done', source: '外部机会 Agent', next: '已形成初版线索汇总。' }
];

const seed = {
  users: defaultUsers,
  agents: defaultAgents,
  systemAgents: {
    external: {
      name: '外部机会 Agent',
      scope: '扫描行业、招标、新闻，只输出外部线索和商机评分。',
      boundary: '不维护客户阶段、不生成报价、不直接分配任务。',
      provider: 'openrouter',
      apiModel: 'openrouter/openai/gpt-4.1-mini'
    },
    customer: {
      name: '客户管理 Agent',
      scope: '维护客户阶段、负责人、联系人和下一步跟进建议。',
      boundary: '不扫描外部网站、不生成报价金额、不替任务 Agent 管理状态。',
      provider: 'openrouter',
      apiModel: 'openrouter/openai/gpt-4.1-mini',
      ownerId: WORKFLOW_OWNER_ID
    },
    task: {
      name: '任务看板 Agent',
      scope: '从对话、会议纪要、广播反馈和商机收藏中提取、分配、跟进任务。',
      boundary: '不维护客户漏斗、不生成报价依据、不做行业扫描。',
      provider: 'openrouter',
      apiModel: 'openrouter/openai/gpt-4.1-mini',
      ownerId: WORKFLOW_OWNER_ID
    },
    quote: {
      name: '报价 Agent',
      scope: '生成报价方案、报价构成、参考依据、缺失参数和风险。',
      boundary: '不承诺正式对外价格、不管理客户阶段、不扫描外部线索。',
      provider: 'claude',
      apiModel: 'claude-sonnet-4',
      ownerId: WORKFLOW_OWNER_ID
    },
    internal: {
      name: '内部信息 Agent',
      scope: '沉淀知识、经验、任务复盘和专家资产。',
      boundary: '不向普通同事暴露他人私密原始聊天，不替代个人助理直接对话。',
      provider: 'openrouter',
      apiModel: 'openrouter/openai/gpt-4.1-mini'
    }
  },
  conversations: {},
  systemAgentOutputs: { internal: [], external: [], task: [], quote: [], customer: [] },
  generatedOpportunities: [],
  agentFeedback: [],
  tenderScan: { seenIds: {}, runs: [] },
  tasks: defaultTasks,
  quotes: [],
  knowledge: [],
  pendingRegistrations: [],
  customers: [
    { id: 'customer-east-research', name: '华东有色金属研究院', type: '科研机构', stage: '洽谈中', owner: 'luyang', contact: '张主任', phone: '138****8888', last: '5 天前', next: '确认设备升级预算和材料试制需求。' },
    { id: 'customer-sh-aerospace', name: '上海航天设备制造', type: '航天军工', stage: '报价阶段', owner: 'larry', contact: '李工', phone: '139****6666', last: '今天', next: '补齐高压阀门参数和交付周期。' },
    { id: 'customer-gz-lab', name: '广州高校材料实验室', type: '高校科研', stage: '商务谈判', owner: 'guihua', contact: '王教授', phone: '137****5555', last: '2 天前', next: '判断是否用材料试制切入设备方案。' },
    { id: 'customer-bj-semi', name: '北京半导体材料公司', type: '半导体', stage: '成交', owner: 'xiaodong', contact: '赵经理', phone: '136****4444', last: '1 周前', next: '维护复购和设备升级机会。' }
  ],
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
  store.agentFeedback ??= [];
  store.tenderScan ??= { seenIds: {}, runs: [] };
  store.tasks ??= [];
  store.quotes ??= [];
  store.knowledge ??= [];
  store.customers ??= [];
  store.pendingRegistrations ??= [];
  store.usage ??= {};
  store.auditLog ??= [];

  for (const [id, agent] of Object.entries(seed.systemAgents)) {
    if (!store.systemAgents[id]) {
      store.systemAgents[id] = { ...agent };
      changed = true;
    } else {
      for (const key of ['name', 'scope', 'boundary', 'ownerId']) {
        if (agent[key] && store.systemAgents[id][key] !== agent[key]) {
          store.systemAgents[id][key] = agent[key];
          changed = true;
        }
      }
    }
    if (!store.systemAgentOutputs[id]) {
      store.systemAgentOutputs[id] = [];
      changed = true;
    }
  }
  for (const id of Object.keys(store.systemAgents)) {
    if (!fixedSystemAgentIds.includes(id)) {
      delete store.systemAgents[id];
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

  if (!store.tasks.length) {
    store.tasks = defaultTasks.map((task) => ({ ...task, createdAt: new Date().toISOString(), createdBy: 'system' }));
    changed = true;
  }
  if (!store.customers.length && seed.customers?.length) {
    store.customers = seed.customers.map((customer) => ({ ...customer, createdAt: new Date().toISOString(), createdBy: 'system' }));
    changed = true;
  }
  if (normalizeExistingCustomerStages(store)) {
    changed = true;
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

function canUseWorkflowAgent(session, id = '') {
  if (session?.role === 'super_admin') return true;
  const permissions = session?.permissions ?? { tasks: true, quote: true, customers: true };
  if (id === 'quote') return permissions.quote !== false;
  if (id === 'customer') return permissions.customers !== false;
  if (id === 'task') return permissions.tasks !== false;
  return Boolean(session?.userId);
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
  if (workflowSystemAgentIds.has(id) && canUseWorkflowAgent(req.session, id)) return next();
  return res.status(403).json({ error: workflowSystemAgentIds.has(id) ? `${id}_agent_forbidden` : 'jamie_only' });
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

function normalizeUserPermissions(input = {}) {
  return {
    agents: input.agents !== false,
    customers: input.customers !== false,
    quote: input.quote !== false,
    tasks: input.tasks !== false,
    insight: input.insight === true
  };
}

function effectivePermissions(user = {}) {
  if (user.role === 'super_admin') {
    return { agents: true, customers: true, quote: true, tasks: true, insight: true };
  }
  return normalizeUserPermissions(user.permissions ?? {});
}

function redactUser(user) {
  const { password, passwordHash, ...safe } = user;
  return safe;
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
  const pending = (store.pendingRegistrations ?? []).find((item) => item.id === userId);
  if (!user && pending && verifyPassword(pending, password)) return res.status(403).json({ error: 'registration_pending' });
  if (!user || !verifyPassword(user, password)) return res.status(401).json({ error: 'invalid_credentials' });
  if (user.approvalStatus === 'pending') return res.status(403).json({ error: 'registration_pending' });
  if (user.active === false) return res.status(403).json({ error: 'user_suspended' });
  if (!user.passwordHash) {
    user.passwordHash = hashPassword(password);
    delete user.password;
    recordAudit(store, user.id, 'password.migrated', { userId: user.id });
    await writeStore(store);
  }
  const permissions = effectivePermissions(user);
  const token = sign({
    userId: user.id,
    role: user.role,
    name: user.name,
    businessRole: user.businessRole || 'tester',
    permissions,
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS
  });
  res.json({ token, user: { id: user.id, name: user.name, role: user.role, businessRole: user.businessRole || 'tester', permissions } });
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
  store.pendingRegistrations ??= [];
  if (store.users.some((item) => item.id === cleanId) || store.pendingRegistrations.some((item) => item.id === cleanId)) {
    return res.status(409).json({ error: 'user_exists' });
  }

  const pending = {
    id: cleanId,
    name: cleanName,
    passwordHash: hashPassword(password),
    requestedAt: new Date().toISOString(),
    approvalStatus: 'pending'
  };
  store.pendingRegistrations.unshift(pending);
  recordAudit(store, cleanId, 'user.registration_requested', { userId: cleanId });
  await writeStore(store);
  res.status(202).json({ pending: true, message: 'registration_pending' });
});

app.post('/api/admin/registrations/:id/approve', requireAuth, requireJamie, async (req, res) => {
  const store = await readStore();
  store.pendingRegistrations ??= [];
  const index = store.pendingRegistrations.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'registration_not_found' });
  const pending = store.pendingRegistrations[index];
  const permissions = normalizeUserPermissions(req.body?.permissions);
  const businessRole = businessRoles.has(req.body?.businessRole) ? req.body.businessRole : 'sales';
  const user = {
    id: pending.id,
    name: req.body?.name ? String(req.body.name).slice(0, 80) : pending.name,
    role: 'coworker',
    businessRole,
    permissions,
    passwordHash: pending.passwordHash,
    active: true,
    approvalStatus: 'approved',
    approvedBy: req.session.userId,
    approvedAt: new Date().toISOString()
  };
  store.users.push(user);
  store.agents[user.id] = {
    id: user.id,
    name: `${user.name}_AI`,
    ownerId: user.id,
    modelTier: 'lite',
    provider: 'claude',
    apiModel: 'claude-3-5-haiku',
    active: true
  };
  store.conversations[user.id] = [
    { at: new Date().toISOString(), from: 'agent', text: `${user.name}，你的专属助理已经开通。` }
  ];
  store.savedOpportunities[user.id] = [];
  store.usage[user.id] = emptyUsage();
  store.pendingRegistrations.splice(index, 1);
  recordAudit(store, req.session.userId, 'user.registration_approved', { userId: user.id, businessRole, permissions });
  await writeStore(store);
  res.json({ user: redactUser(user), pendingRegistrations: store.pendingRegistrations });
});

app.post('/api/admin/registrations/:id/reject', requireAuth, requireJamie, async (req, res) => {
  const store = await readStore();
  store.pendingRegistrations ??= [];
  const index = store.pendingRegistrations.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'registration_not_found' });
  const [pending] = store.pendingRegistrations.splice(index, 1);
  recordAudit(store, req.session.userId, 'user.registration_rejected', { userId: pending.id });
  await writeStore(store);
  res.json({ pendingRegistrations: store.pendingRegistrations });
});

app.get('/api/state', requireAuth, async (req, res) => {
  const store = await readStore();
  if (req.session.role === 'super_admin') {
    return res.json({ ...redactPasswords(store), workflowOwnerId: WORKFLOW_OWNER_ID, workflowAgentsForAll: true });
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
    tasks: visibleTasksForSession(store, req.session),
    quotes: visibleQuotesForSession(store, req.session),
    customers: visibleCustomersForSession(store, req.session),
    savedOpportunities: { [req.session.userId]: store.savedOpportunities[req.session.userId] ?? [] },
    broadcasts: userBroadcasts,
    usage: { [req.session.userId]: store.usage[req.session.userId] ?? emptyUsage() },
    systemAgents: store.systemAgents,
    agentFeedback: (store.agentFeedback ?? []).filter((item) => item.agentId === req.session.userId || item.createdBy === req.session.userId).slice(0, 30),
    workflowOwnerId: WORKFLOW_OWNER_ID,
    workflowAgentsForAll: true,
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
  const createdArtifacts = deriveWorkflowArtifactsFromMessage({
    actorId: req.session.userId,
    ownerId: id,
    message: messageForContext,
    reply: agentReply,
    attachments: cleanAttachments,
    agent,
    user
  });
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
  if (createdArtifacts.tasks.length) {
    store.tasks ??= [];
    store.tasks.unshift(...createdArtifacts.tasks);
    recordAudit(store, req.session.userId, 'task.auto_created_from_chat', { agentId: id, taskIds: createdArtifacts.tasks.map((task) => task.id) });
  }
  if (createdArtifacts.quotes.length) {
    store.quotes ??= [];
    store.quotes.unshift(...createdArtifacts.quotes);
    store.quotes = store.quotes.slice(0, 40);
    recordAudit(store, req.session.userId, 'quote.auto_created_from_chat', { agentId: id, quoteIds: createdArtifacts.quotes.map((quote) => quote.id) });
  }
  if (createdArtifacts.customers.length) {
    store.customers ??= [];
    upsertCustomers(store, createdArtifacts.customers);
    recordAudit(store, req.session.userId, 'customer.auto_upserted_from_chat', { agentId: id, customers: createdArtifacts.customers.map((customer) => customer.name) });
  }
  if (createdArtifacts.opportunities.length) {
    store.generatedOpportunities ??= [];
    store.generatedOpportunities.unshift(...createdArtifacts.opportunities);
    store.generatedOpportunities = store.generatedOpportunities.slice(0, 30);
    recordAudit(store, req.session.userId, 'opportunity.auto_created_from_chat', { agentId: id, opportunityIds: createdArtifacts.opportunities.map((item) => item.id) });
  }
  if (createdArtifacts.knowledge.length) {
    store.knowledge ??= [];
    store.knowledge.unshift(...createdArtifacts.knowledge);
    store.knowledge = store.knowledge.slice(0, 80);
    store.systemAgentOutputs ??= {};
    store.systemAgentOutputs.internal ??= [];
    store.systemAgentOutputs.internal.unshift(...createdArtifacts.knowledge.map(knowledgeToInsight));
    store.systemAgentOutputs.internal = store.systemAgentOutputs.internal.slice(0, 12);
    recordAudit(store, req.session.userId, 'knowledge.auto_created_from_chat', { agentId: id, knowledgeIds: createdArtifacts.knowledge.map((item) => item.id) });
  }
  recordAudit(store, req.session.userId, 'chat.recorded', { agentId: id, usage, llm });
  await writeStore(store);
  res.json({
    conversation: store.conversations[id],
    usage: store.usage[id],
    reply: agentReply,
    llm,
    createdTasks: createdArtifacts.tasks,
    createdArtifacts,
    quotes: store.quotes ?? [],
    customers: store.customers ?? [],
    generatedOpportunities: store.generatedOpportunities ?? [],
    systemAgentOutputs: store.systemAgentOutputs ?? {}
  });
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
  if (!fixedSystemAgentIds.includes(id)) return res.status(404).json({ error: 'system_agent_not_found' });
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
  if (!fixedSystemAgentIds.includes(id)) return res.status(404).json({ error: 'system_agent_not_found' });
  if (id === 'internal' && req.session.role !== 'super_admin') return res.status(403).json({ error: 'jamie_only' });
  if (workflowSystemAgentIds.has(id) && !canUseWorkflowAgent(req.session, id)) {
    return res.status(403).json({ error: `${id}_agent_forbidden` });
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
  const createdTasks = persistSystemAgentArtifacts(store, id, generated.output, req.session.userId);
  const broadcast = createSystemAgentBroadcast(store, req.session.userId, generated.output);
  recordAudit(store, req.session.userId, 'system-agent.run', { id, llm: generated.llm, broadcastId: broadcast?.id });
  await writeStore(store);
  res.json({ output: generated.output, llm: generated.llm, systemAgent, broadcast, createdTasks, quotes: store.quotes ?? [], customers: store.customers ?? [] });
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
  const alreadySaved = store.savedOpportunities[ownerId].includes(req.params.id);
  if (!alreadySaved) store.savedOpportunities[ownerId].push(req.params.id);
  const opportunity = normalizeSavedOpportunity(
    req.body?.opportunity || findOpportunityById(store, req.params.id) || { id: req.params.id, title: req.params.id },
    req.params.id
  );
  const createdArtifacts = alreadySaved
    ? { tasks: [], quotes: [], customers: [], opportunities: [], knowledge: [] }
    : materializeOpportunityPipeline(store, { opportunity, ownerId, actorId: req.session.userId });
  recordAudit(store, ownerId, 'opportunity.saved', {
    opportunityId: req.params.id,
    customerIds: createdArtifacts.customers.map((item) => item.id),
    taskIds: createdArtifacts.tasks.map((item) => item.id),
    quoteIds: createdArtifacts.quotes.map((item) => item.id),
    knowledgeIds: createdArtifacts.knowledge.map((item) => item.id)
  });
  await writeStore(store);
  res.json({
    saved: store.savedOpportunities[ownerId],
    createdArtifacts,
    tasks: visibleTasksForSession(store, req.session),
    customers: visibleCustomersForSession(store, req.session),
    quotes: visibleQuotesForSession(store, req.session),
    generatedOpportunities: store.generatedOpportunities ?? [],
    systemAgentOutputs: store.systemAgentOutputs ?? {}
  });
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
  let feedbackTask = null;
  if (['跟进中', '需要讨论'].includes(status)) {
    feedbackTask = normalizeTaskInput(
      {
        title: `${status === '需要讨论' ? '讨论' : '跟进'}：${broadcast.title}`,
        owner: req.session.userId,
        collaborators: cleanDiscussWith,
        due: status === '需要讨论' ? '今天' : '本周',
        priority: status === '需要讨论' ? 'high' : 'medium',
        tag: broadcast.type || '广播反馈',
        source: '广播反馈',
        next: note || broadcast.content
      },
      req.session.userId
    );
    store.tasks ??= [];
    store.tasks.unshift(feedbackTask);
  }
  recordAudit(store, req.session.userId, 'broadcast.feedback', {
    broadcastId: broadcast.id,
    status,
    discussWith: cleanDiscussWith,
    discussionBroadcastId: discussionBroadcast?.id
  });
  await writeStore(store);
  res.json({ broadcast, discussionBroadcast, task: feedbackTask });
});

app.post('/api/tasks', requireAuth, async (req, res) => {
  if (req.session.permissions?.tasks === false) return res.status(403).json({ error: 'tasks_forbidden' });
  const store = await readStore();
  const task = normalizeTaskInput(req.body ?? {}, req.session.userId);
  store.tasks ??= [];
  store.tasks.unshift(task);
  recordAudit(store, req.session.userId, 'task.created', { taskId: task.id, owner: task.owner });
  await writeStore(store);
  res.status(201).json({ task, tasks: visibleTasksForSession(store, req.session) });
});

app.post('/api/tasks/from-message', requireAuth, async (req, res) => {
  if (req.session.permissions?.tasks === false) return res.status(403).json({ error: 'tasks_forbidden' });
  const { ownerId = req.session.userId, text = '', source = '个人助理对话' } = req.body ?? {};
  if (req.session.role !== 'super_admin' && req.session.userId !== ownerId) return res.status(403).json({ error: 'private_workspace' });
  const store = await readStore();
  const task = normalizeTaskInput({
    title: inferTaskTitle(text),
    owner: ownerId,
    priority: /报价|客户|今天|紧急|尽快/.test(text) ? 'high' : 'medium',
    due: /今天|紧急|尽快/.test(text) ? '今天' : '本周',
    tag: /报价/.test(text) ? '报价准备' : /客户|商机/.test(text) ? '客户跟进' : '对话行动',
    source,
    next: truncateText(String(text).replace(/\s+/g, ' ').trim(), 180) || '根据这段对话继续推进下一步。'
  }, req.session.userId);
  store.tasks ??= [];
  store.tasks.unshift(task);
  recordAudit(store, req.session.userId, 'task.created_from_message', { taskId: task.id, owner: task.owner });
  await writeStore(store);
  res.status(201).json({ task, tasks: visibleTasksForSession(store, req.session) });
});

app.patch('/api/tasks/:id', requireAuth, async (req, res) => {
  if (req.session.permissions?.tasks === false) return res.status(403).json({ error: 'tasks_forbidden' });
  const store = await readStore();
  const task = (store.tasks ?? []).find((item) => item.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'task_not_found' });
  if (!canEditTask(req.session, task)) return res.status(403).json({ error: 'task_forbidden' });
  const previousStatus = task.status;
  const allowed = ['title', 'tag', 'owner', 'due', 'priority', 'status', 'next', 'result', 'evaluation', 'relatedCustomerId', 'relatedQuoteId', 'relatedOpportunityId'];
  for (const key of allowed) {
    if (req.body?.[key] !== undefined) task[key] = req.body[key];
  }
  task.updatedAt = new Date().toISOString();
  task.updatedBy = req.session.userId;
  if (task.status === 'done' && previousStatus !== 'done') {
    task.completedAt = new Date().toISOString();
    store.systemAgentOutputs ??= {};
    store.systemAgentOutputs.internal ??= [];
    store.systemAgentOutputs.internal.unshift({
      id: `task-learning-${Date.now()}`,
      at: new Date().toISOString(),
      title: `任务完成复盘：${task.title}`,
      text: task.result || task.next || '任务已完成，等待后续复盘。',
      source: '任务看板 / 完成反馈',
      asset: '任务结果学习.md',
      learning: `任务「${task.title}」完成，系统将其结果作为客户推进、报价或协作经验沉淀。`
    });
    store.systemAgentOutputs.internal = store.systemAgentOutputs.internal.slice(0, 12);
  }
  recordAudit(store, req.session.userId, 'task.updated', { taskId: task.id, status: task.status });
  await writeStore(store);
  res.json({ task, tasks: visibleTasksForSession(store, req.session), systemAgentOutputs: store.systemAgentOutputs });
});

app.post('/api/agent-feedback', requireAuth, async (req, res) => {
  const store = await readStore();
  const { agentId, messageText, rating, note = '' } = req.body ?? {};
  const allowedRatings = new Set(['useful', 'inaccurate', 'need_detail']);
  if (!agentId || !allowedRatings.has(rating)) return res.status(400).json({ error: 'invalid_agent_feedback' });
  if (req.session.role !== 'super_admin' && agentId !== req.session.userId) return res.status(403).json({ error: 'private_feedback' });

  const feedback = {
    id: crypto.randomUUID(),
    agentId,
    rating,
    note: truncateText(note, 240),
    messageText: truncateText(messageText, 360),
    createdBy: req.session.userId,
    at: new Date().toISOString()
  };
  store.agentFeedback ??= [];
  store.agentFeedback.unshift(feedback);
  store.agentFeedback = store.agentFeedback.slice(0, 300);

  const ratingText = { useful: '有用回答', inaccurate: '回答不准', need_detail: '需要更具体' }[rating];
  store.systemAgentOutputs ??= {};
  store.systemAgentOutputs.internal ??= [];
  store.systemAgentOutputs.internal.unshift({
    id: `agent-feedback-learning-${Date.now()}`,
    at: new Date().toISOString(),
    title: `Agent 回复反馈：${ratingText}`,
    text:
      rating === 'useful'
        ? '同事确认这类回答有帮助，后续相似问题可复用其结构、语气和业务拆解方式。'
        : '同事标记这类回答需要改进，后续应更直接回答问题、给出具体下一步和业务依据。',
    source: `${agentId}_AI / 同事反馈`,
    asset: 'Agent 回复质量学习.md',
    learning: `个人助理 ${agentId}_AI 收到“${ratingText}”反馈，系统会把它作为回复质量和业务可用性的学习信号。`
  });
  store.systemAgentOutputs.internal = store.systemAgentOutputs.internal.slice(0, 12);
  recordAudit(store, req.session.userId, 'agent.feedback', { agentId, rating });
  await writeStore(store);

  const visibleFeedback =
    req.session.role === 'super_admin'
      ? store.agentFeedback
      : store.agentFeedback.filter((item) => item.agentId === req.session.userId || item.createdBy === req.session.userId);
  res.json({
    feedback,
    agentFeedback: visibleFeedback.slice(0, 30),
    systemAgentOutputs: store.systemAgentOutputs
  });
});

app.post('/api/llm/proxy', requireAuth, async (req, res) => {
  const { provider, apiModel, messages = [] } = req.body ?? {};
  const prompt = messages.map((item) => item.content).join('\n');
  if (!keyConfiguredForProvider(provider)) {
    const simulatedReply = `${missingKeyMessage(provider)} 已收到 ${provider}/${apiModel} 请求，但当前只能返回本地降级回复。`;
    const usage = calculateUsage(prompt, simulatedReply, 'balanced');
    return res.json({ provider, apiModel, reply: simulatedReply, usage, simulated: true });
  }
  try {
    const result = await callModel({
      provider,
      model: normalizeModelForProvider(provider, apiModel),
      messages,
      temperature: 0.4,
      maxTokens: 900
    });
    const usage = calculateUsage(prompt, result.reply, 'balanced');
    res.json({ provider: result.backend, apiModel: result.model, keySlot: result.keySlot, reply: result.reply, usage, simulated: false });
  } catch (error) {
    res.status(502).json({ error: 'model_call_failed', detail: error.message });
  }
});

app.post('/api/speech/transcribe', requireAuth, async (req, res) => {
  if (!OPENAI_API_KEY) {
    return res.status(503).json({
      error: 'openai_key_missing',
      message: 'OPENAI_API_KEY 未配置，无法进行后端语音转文字。'
    });
  }
  const audio = req.body?.audio ?? {};
  const dataUrl = typeof audio.dataUrl === 'string' ? audio.dataUrl : '';
  if (!dataUrl) return res.status(400).json({ error: 'audio_required', message: '缺少录音数据。' });
  const { buffer, mime } = dataUrlToBuffer(dataUrl);
  if (!buffer.length) return res.status(400).json({ error: 'audio_empty', message: '录音数据为空。' });
  if (buffer.length > 10 * 1024 * 1024) {
    return res.status(413).json({ error: 'audio_too_large', message: '单段语音过长，请控制在 90 秒以内。' });
  }
  try {
    const text = await transcribeAudio({
      buffer,
      mime: audio.type || mime || 'audio/webm',
      name: audio.name || 'voice.webm'
    });
    res.json({ text });
  } catch (error) {
    res.status(502).json({ error: 'transcription_failed', message: error.message });
  }
});

app.get('/api/admin/model-health', requireAuth, requireJamie, async (req, res) => {
  const store = await readStore();
  const live = req.query.live === '1';
  const routes = collectModelRoutes(store);
  const uniqueRoutes = uniqueModelRoutes(routes);
  const modelChecks = {};

  const unconfiguredRoutes = uniqueRoutes.filter((route) => !keyConfiguredForProvider(route.provider));
  if (!live || unconfiguredRoutes.length) {
    for (const route of uniqueRoutes) {
      if (live && keyConfiguredForProvider(route.provider)) continue;
      modelChecks[route.key] = {
        ok: !live && keyConfiguredForProvider(route.provider),
        liveChecked: false,
        keyPreference: keyPreferenceForProvider(route.provider),
        reason: keyConfiguredForProvider(route.provider) ? undefined : `missing_${route.backend}_key`,
        message: keyConfiguredForProvider(route.provider) ? '路由格式已检查；加 ?live=1 可进行真模型请求测试。' : missingKeyMessage(route.provider)
      };
    }
  }
  if (live) {
    for (const route of uniqueRoutes) {
      if (!keyConfiguredForProvider(route.provider)) continue;
      const startedAt = Date.now();
      try {
        const result = await callModel({
          provider: route.provider,
          model: route.normalizedModel,
          messages: [
            { role: 'system', content: '你是 EnterpriseOS 的模型连通性检测器。' },
            { role: 'user', content: '请只回复 OK。' }
          ],
          temperature: 0,
          maxTokens: 8
        });
        modelChecks[route.key] = {
          ok: true,
          liveChecked: true,
          latencyMs: Date.now() - startedAt,
          resolvedModel: result.model,
          backend: result.backend,
          keySlot: result.keySlot
        };
      } catch (error) {
        modelChecks[route.key] = {
          ok: false,
          liveChecked: true,
          latencyMs: Date.now() - startedAt,
          error: error.message
        };
      }
    }
  }

  res.json({
    anthropicConfigured: Boolean(ANTHROPIC_API_KEY),
    openAIConfigured: Boolean(OPENAI_API_KEY),
    openRouterConfigured: OPENROUTER_HAS_ANY_KEY,
    primaryOpenRouterConfigured: Boolean(OPENROUTER_API_KEY),
    backupOpenRouterConfigured: Boolean(OPENROUTER_BACKUP_API_KEY),
    live,
    anthropicTimeoutMs: ANTHROPIC_TIMEOUT_MS,
    anthropicRetryCount: ANTHROPIC_RETRY_COUNT,
    openRouterTimeoutMs: OPENROUTER_TIMEOUT_MS,
    openRouterRetryCount: OPENROUTER_RETRY_COUNT,
    openAITimeoutMs: OPENAI_TIMEOUT_MS,
    openAIRetryCount: OPENAI_RETRY_COUNT,
    routes: routes.map((route) => ({
      ...route,
      health: modelChecks[modelRouteKey(route.provider, route.normalizedModel)]
    })),
    models: modelChecks
  });
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
  const clean = String(apiModel).replace(/^(openrouter\/)+/, '');
  const modelMap = {
    'claude-3-5-haiku': 'anthropic/claude-3.5-haiku',
    'claude-3-5-haiku-20241022': 'anthropic/claude-3.5-haiku',
    'claude-3-7-sonnet': 'anthropic/claude-sonnet-4',
    'claude-3-7-sonnet-20250219': 'anthropic/claude-sonnet-4',
    'claude-sonnet-4': 'anthropic/claude-sonnet-4',
    'claude-sonnet-4-20250514': 'anthropic/claude-sonnet-4',
    'claude-opus-4': 'anthropic/claude-opus-4',
    'claude-opus-4-20250514': 'anthropic/claude-opus-4',
    'claude-opus-4.1': 'anthropic/claude-opus-4.1',
    'gpt-4.1-mini': 'openai/gpt-4.1-mini',
    'gpt-4.1': 'openai/gpt-4.1',
    'gpt-4o-mini': 'openai/gpt-4o-mini',
    'gpt-5.2': 'openai/gpt-5.2'
  };
  return modelMap[clean] ?? clean ?? 'anthropic/claude-3.5-haiku';
}

function toAnthropicModel(apiModel = '') {
  const clean = String(apiModel || 'claude-3-5-haiku')
    .replace(/^(anthropic\/|openrouter\/anthropic\/)+/, '')
    .replace(/\./g, '-')
    .trim();
  const modelMap = {
    'claude-3-5-haiku': 'claude-3-5-haiku-20241022',
    'claude-3-5-haiku-20241022': 'claude-3-5-haiku-20241022',
    'claude-3-7-sonnet': 'claude-3-7-sonnet-20250219',
    'claude-3-7-sonnet-20250219': 'claude-3-7-sonnet-20250219',
    'claude-sonnet-4': 'claude-sonnet-4-20250514',
    'claude-sonnet-4-20250514': 'claude-sonnet-4-20250514',
    'claude-opus-4': 'claude-opus-4-20250514',
    'claude-opus-4-20250514': 'claude-opus-4-20250514'
  };
  return modelMap[clean] ?? clean ?? 'claude-3-5-haiku-20241022';
}

function toOpenAIModel(apiModel = '') {
  return String(apiModel || 'gpt-4.1-mini')
    .replace(/^(openai\/|openrouter\/openai\/)+/, '')
    .trim() || 'gpt-4.1-mini';
}

function providerBackend(provider = '') {
  if (provider === 'openai' || provider === 'gpt') return 'openai';
  if (provider === 'claude' || provider === 'anthropic') return 'anthropic';
  return 'openrouter';
}

function normalizeModelForProvider(provider, apiModel) {
  const backend = providerBackend(provider);
  if (backend === 'openai') return toOpenAIModel(apiModel);
  if (backend === 'anthropic') return toAnthropicModel(apiModel);
  return toOpenRouterModel(apiModel);
}

function collectModelRoutes(store) {
  const personal = Object.values(store.agents ?? {}).map((agent) => ({
    type: 'personal',
    id: agent.id,
    name: agent.name,
    ownerId: agent.ownerId,
    active: agent.active !== false,
    provider: agent.provider || 'claude',
    apiModel: agent.apiModel || 'claude-3-5-haiku',
    backend: providerBackend(agent.provider || 'claude'),
    normalizedModel: normalizeModelForProvider(agent.provider || 'claude', agent.apiModel || 'claude-3-5-haiku')
  }));
  const system = Object.entries(store.systemAgents ?? {}).map(([id, agent]) => ({
    type: 'system',
    id,
    name: agent.name || id,
    ownerId: agent.ownerId || 'jamie',
    active: true,
    provider: agent.provider || 'openrouter',
    apiModel: agent.apiModel || 'openrouter/openai/gpt-4.1-mini',
    backend: providerBackend(agent.provider || 'openrouter'),
    normalizedModel: normalizeModelForProvider(agent.provider || 'openrouter', agent.apiModel || 'openrouter/openai/gpt-4.1-mini')
  }));
  return [...personal, ...system];
}

function modelRouteKey(provider, normalizedModel) {
  return `${provider || 'openrouter'}:${normalizedModel}`;
}

function uniqueModelRoutes(routes = []) {
  const seen = new Set();
  return routes
    .map((route) => ({
      key: modelRouteKey(route.provider, route.normalizedModel),
      provider: route.provider,
      backend: route.backend || providerBackend(route.provider),
      normalizedModel: route.normalizedModel
    }))
    .filter((route) => {
      if (seen.has(route.key)) return false;
      seen.add(route.key);
      return true;
    });
}

function keyPreferenceForProvider(provider = '') {
  const backend = providerBackend(provider);
  if (backend === 'openai') return 'openai-direct';
  if (backend === 'anthropic') return ANTHROPIC_API_KEY ? 'anthropic-direct' : 'openrouter-fallback';
  return provider === 'openrouter-backup' ? 'backup-first' : 'primary-first';
}

function keyConfiguredForProvider(provider = '') {
  const backend = providerBackend(provider);
  if (backend === 'openai') return Boolean(OPENAI_API_KEY);
  if (backend === 'anthropic') return ANTHROPIC_HAS_ANY_KEY;
  return OPENROUTER_HAS_ANY_KEY;
}

function missingKeyMessage(provider = '') {
  const backend = providerBackend(provider);
  if (backend === 'openai') return 'OPENAI_API_KEY 未配置，无法进行 OpenAI 直连模型检查。';
  if (backend === 'anthropic') return 'ANTHROPIC_API_KEY 未配置，且 OPENROUTER_API_KEY / OPENROUTER_BACKUP_API_KEY 也未配置，无法调用 Claude 模型。';
  return 'OPENROUTER_API_KEY / OPENROUTER_BACKUP_API_KEY 都未配置，无法进行 OpenRouter 模型检查。';
}

function openRouterKeyCandidates(provider = '') {
  const primary = OPENROUTER_API_KEY ? [{ slot: 'primary', value: OPENROUTER_API_KEY }] : [];
  const backup = OPENROUTER_BACKUP_API_KEY ? [{ slot: 'backup', value: OPENROUTER_BACKUP_API_KEY }] : [];
  return provider === 'openrouter-backup' ? [...backup, ...primary] : [...primary, ...backup];
}

function llmUnavailable(reason = 'missing_model_key', provider = 'openrouter') {
  return {
    provider: 'fallback',
    simulated: true,
    reason,
    message:
      reason.startsWith('missing_')
        ? `${missingKeyMessage(provider)} 当前使用本地降级逻辑，不是真模型分析。`
        : '模型调用失败，当前使用本地降级逻辑。'
  };
}

async function generateAgentReply({ store, agent, user, message }) {
  if (!keyConfiguredForProvider(agent.provider)) {
    return {
      reply: fallbackAgentReply({ agent, user, message }),
      llm: llmUnavailable(`missing_${providerBackend(agent.provider)}_key`, agent.provider)
    };
  }

  const recent = (store.conversations[user.id] ?? []).slice(-10).map((item) => ({
    role: item.from === 'user' ? 'user' : 'assistant',
    content: item.text
  }));
  const model = normalizeModelForProvider(agent.provider, agent.apiModel);
  try {
    const result = await callModel({
      provider: agent.provider,
      model,
      messages: [
        {
          role: 'system',
          content: [
            `你是 ${agent.name}，服务对象是 ${user.name}。`,
            '你在 EnterpriseOS 里工作。当前不是多公司系统，也不是大企业集团，而是 Jamie 带一个小 team 进行产品试用。',
            '团队方向：悬浮真空熔炼设备、新型金属材料研发、材料选型、设备选型、客户开发和商机判断。',
            getPersonalAgentRoleInstruction(user.id),
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
      llm: { provider: result.backend, model: result.model, keySlot: result.keySlot, simulated: false }
    };
  } catch (error) {
    return {
      reply: `${fallbackAgentReply({ agent, user, message })}\n\n（模型调用失败，已使用本地降级回复：${error.message}）`,
      llm: { ...llmUnavailable('model_call_error', agent.provider), model, error: error.message }
    };
  }
}

function getPersonalAgentRoleInstruction(userId) {
  if (userId === 'jamie') {
    return [
      'Jamie_AI 的核心定位：不是普通个人秘书，也不是只看权限和成本的后台助手。',
      '你是“Agent 成长与效率教练”：评估个人助理、外部机会 Agent、客户管理 Agent、任务看板 Agent、报价 Agent、内部信息 Agent 是否真正提高了同事效率。',
      '你要帮助 Jamie 发现：哪些 Agent 回答空泛、哪些流程卡住、哪些同事没有得到足够帮助、哪些反馈应转化为提示词/流程/知识库改进。',
      '输出时优先给出：效率观察、问题诊断、改进动作、负责 Agent、验证指标。'
    ].join('\n');
  }
  return '个人助理 Agent 的核心定位：保护同事私密上下文，帮助该同事把原始工作信息转成客户、任务、报价、商机和可复用经验。';
}

async function callModel({ provider = 'openrouter', model, messages, temperature = 0.4, maxTokens = 900 }) {
  const backend = providerBackend(provider);
  if (backend === 'openai') return callOpenAI({ model, messages, temperature, maxTokens });
  if (backend === 'anthropic') return callClaude({ provider, model, messages, temperature, maxTokens });
  return callOpenRouter({ provider, model, messages, temperature, maxTokens });
}

async function callClaude({ provider = 'claude', model, messages, temperature = 0.4, maxTokens = 900 }) {
  if (ANTHROPIC_API_KEY) {
    return callAnthropic({ model, messages, temperature, maxTokens });
  }
  return callOpenRouter({
    provider,
    model: toOpenRouterModel(model),
    messages,
    temperature,
    maxTokens
  });
}

async function callAnthropic({ model, messages, temperature = 0.4, maxTokens = 900 }) {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY missing');
  const attempts = Math.max(1, ANTHROPIC_RETRY_COUNT + 1);
  const system = messages
    .filter((item) => item.role === 'system')
    .map((item) => item.content)
    .join('\n\n');
  const anthropicMessages = messages
    .filter((item) => item.role !== 'system')
    .map((item) => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: String(item.content ?? '')
    }))
    .filter((item) => item.content.trim());
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS);
    try {
      const response = await fetch(ANTHROPIC_BASE_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': ANTHROPIC_VERSION,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(compact({
          model,
          system,
          messages: anthropicMessages.length ? anthropicMessages : [{ role: 'user', content: '请回复 OK。' }],
          temperature,
          max_tokens: maxTokens
        }))
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error?.message || payload.message || `Anthropic HTTP ${response.status}`);
      }
      const reply = (payload.content ?? [])
        .filter((item) => item.type === 'text' && item.text)
        .map((item) => item.text)
        .join('\n')
        .trim();
      if (!reply) throw new Error('Anthropic returned an empty reply');
      return { reply, model: payload.model ?? model, backend: 'anthropic', keySlot: 'anthropic' };
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      await sleep(400 * attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(lastError?.name === 'AbortError' ? `Anthropic timeout after ${ANTHROPIC_TIMEOUT_MS}ms` : lastError?.message || 'Anthropic request failed');
}

async function callOpenAI({ model, messages, temperature = 0.4, maxTokens = 900 }) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing');
  const attempts = Math.max(1, OPENAI_RETRY_COUNT + 1);
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
    try {
      const response = await fetch(OPENAI_BASE_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
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
        throw new Error(payload.error?.message || payload.message || `OpenAI HTTP ${response.status}`);
      }
      const reply = payload.choices?.[0]?.message?.content?.trim();
      if (!reply) throw new Error('OpenAI returned an empty reply');
      return { reply, model: payload.model ?? model, backend: 'openai', keySlot: 'openai' };
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      await sleep(400 * attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(lastError?.name === 'AbortError' ? `OpenAI timeout after ${OPENAI_TIMEOUT_MS}ms` : lastError?.message || 'OpenAI request failed');
}

async function transcribeAudio({ buffer, mime = 'audio/webm', name = 'voice.webm' }) {
  const attempts = Math.max(1, OPENAI_RETRY_COUNT + 1);
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
    try {
      const form = new FormData();
      form.append('model', OPENAI_TRANSCRIPTION_MODEL);
      form.append('language', 'zh');
      form.append('file', new Blob([buffer], { type: mime }), name);
      const response = await fetch(OPENAI_TRANSCRIPTION_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`
        },
        body: form
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error?.message || payload.message || `OpenAI transcription HTTP ${response.status}`);
      }
      return String(payload.text ?? '').trim();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      await sleep(400 * attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(lastError?.name === 'AbortError' ? `OpenAI transcription timeout after ${OPENAI_TIMEOUT_MS}ms` : lastError?.message || 'OpenAI transcription failed');
}

async function callOpenRouter({ provider = 'openrouter', model, messages, temperature = 0.4, maxTokens = 900 }) {
  const attempts = Math.max(1, OPENROUTER_RETRY_COUNT + 1);
  let lastError;
  const keys = openRouterKeyCandidates(provider);
  if (!keys.length) throw new Error('OPENROUTER_API_KEY / OPENROUTER_BACKUP_API_KEY missing');
  for (const key of keys) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);
    try {
      const response = await fetch(OPENROUTER_BASE_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${key.value}`,
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
      return { reply, model: payload.model ?? model, backend: 'openrouter', keySlot: key.slot };
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      await sleep(400 * attempt);
    } finally {
      clearTimeout(timeout);
    }
    }
  }
  throw new Error(lastError?.name === 'AbortError' ? `OpenRouter timeout after ${OPENROUTER_TIMEOUT_MS}ms` : lastError?.message || 'OpenRouter request failed');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fallbackAgentReply({ agent, user, message }) {
  if (user.id === 'jamie') {
    if (/效率|成长|提升|评估|agent|Agent|助手|改进|怎么/.test(message)) {
      return [
        '我会把自己定位成团队 Agent 的成长教练，而不是只做权限和成本管理。',
        '我建议先用四个指标评估每个 Agent：',
        '1. 是否直接回答同事问题，而不是只说“我会记录”。',
        '2. 是否能把对话转成任务、客户、报价或商机动作。',
        '3. 同事反馈里“有用 / 不准 / 需更具体”的比例如何。',
        '4. 生成的任务和报价是否真的被跟进、关闭并沉淀经验。',
        '下一步我会帮你形成一张 Agent 体检表：每个 Agent 的强项、短板、需要调整的提示词和验证指标。'
      ].join('\n\n');
    }
    return '收到。作为 Jamie_AI，我会优先观察各 Agent 的效率、反馈质量、任务转化率和学习沉淀，帮助它们持续成长，让同事获得更可靠的帮助。';
  }
  if (/不对|不正确|没回答|重新回答|换个回答|没听懂|不满意/.test(message)) {
    return `你说得对，我刚才没有回答到点上。作为 ${agent.name}，我应该先围绕 ${user.name} 的真实工作问题给出下一步动作，而不是只说记录和沉淀。下一步我建议：明确问题目标、拆出客户/技术/风险/动作四类信息，再形成可执行任务。`;
  }
  if (/系统|企业OS|服务|同事|怎么做|如何做/.test(message)) {
    return '要让企业OS更好服务同事，关键是让每次对话直接产出行动：客户跟进、报价草稿、技术排查、会议分工、商机判断。内部知识沉淀应在后台自动发生，不要干扰同事完成眼前工作。';
  }
  if (/报价|询价|预算|航天|阀门|设备/.test(message)) {
    return '我先按报价工作流处理：确认客户场景、关键设备/材料参数、报价边界、交付周期和审批要求；系统会同步形成报价草案、客户跟进任务和需要补齐的参数清单。';
  }
  if (/悬浮|真空|熔炼|新型金属|金属材料|材料|市场/.test(message)) {
    return '建议先锁定高校/研究院材料实验室、航空航天材料团队、金属粉末与增材制造企业、特种合金小试线。先卖“材料试制/工艺验证”，再推进设备方案，这比直接卖设备更容易打开客户。';
  }
  return `收到。我会以 ${agent.name} 的身份先理解问题本身，再给 ${user.name} 输出可执行建议；如果信息不足，我会追问关键条件，而不是只做归档。`;
}

async function runSystemAgent({ id, store, systemAgent }) {
  const model = normalizeModelForProvider(systemAgent.provider, systemAgent.apiModel);
  const tenderSignals = id === 'external' ? await fetchTenderSignals(store) : [];
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

  if (!keyConfiguredForProvider(systemAgent.provider)) {
    return {
      output: fallbackSystemAgentOutput(id, '', tenderSignals),
      llm: llmUnavailable(`missing_${providerBackend(systemAgent.provider)}_key`, systemAgent.provider)
    };
  }

  const spec = getSystemAgentSpec(id);

  try {
    const result = await callModel({
      provider: systemAgent.provider,
      model,
      messages: [
        { role: 'system', content: spec },
        {
          role: 'user',
          content: [
            `这是当前小团队最近对话摘要：\n\n${compactConversations || '暂无对话。'}`,
            `\n\n这是各同事收藏过的商机 ID：\n${savedSignals || '暂无收藏。'}`,
            `\n\n这是近期广播、已读和反馈：\n${broadcastSignals || '暂无广播。'}`,
            `\n\n这是系统 Agent 过去沉淀的学习记忆：\n${previousSystemLearning || '暂无系统学习。'}`,
            id === 'external' ? `\n\n这是刚从国内招标网站抓取的候选招标线索：\n${formatTenderSignals(tenderSignals) || '暂未抓到可解析招标条目。'}` : ''
          ].join('\n')
        }
      ],
      temperature: 0.5,
      maxTokens: 900
    });
    const data = parseJsonObject(result.reply);
    return {
      output: normalizeSystemAgentOutput(id, data, result.reply, tenderSignals),
      llm: { provider: result.backend, model: result.model, keySlot: result.keySlot, simulated: false }
    };
  } catch (error) {
    return {
      output: fallbackSystemAgentOutput(id, error.message, tenderSignals),
      llm: { ...llmUnavailable('model_call_error', systemAgent.provider), model, error: error.message }
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
      '你的固定职责只有：沉淀知识、经验、任务复盘和专家资产。',
      '你不要替代外部机会 Agent 扫描行业网站；不要替代客户管理 Agent 维护客户阶段；不要替代任务 Agent 管任务状态；不要替代报价 Agent 生成报价方案。',
      '你可以读取原始对话、收藏、广播反馈和讨论邀请，但输出必须去除具体隐私字句，只沉淀可复用模式、专家能力和可行动商机。',
      '重点寻找：客户反复追问、报价卡点、材料/设备能力可复用点、多个同事都碰到的需求、能转化为大客户开发的异常信号。',
      '请只返回 JSON：{"title":"...","text":"...","source":"...","asset":"...","learning":"...","opportunity":{"title":"...","source":"...","match":"...","why":"...","action":"...","urgency":"..."},"broadcast":{"title":"...","content":"..."}}。',
      'broadcast 要写给全员，提醒大家看见同一个巨大商机线索并补充信息。'
    ].join('\n');
  }
  if (id === 'task') {
    return [
      '你是任务看板 Agent，业务负责人是 Larry。目标是把团队信息流转成可执行任务，而不是泛泛总结。',
      '你的固定职责只有：提取、分配、跟进任务。',
      '你不要维护客户阶段，不要生成报价依据，不要扫描外部信息。',
      '你可以读取原始信息进行任务提取，但输出给 Larry 和同事时不要泄露私密聊天原文，只输出任务标题、负责人、截止时间、优先级、来源类型和下一步。',
      '重点寻找：会议纪要中的分工、客户跟进动作、报价准备、设备参数确认、材料信息补充、广播反馈中的“跟进中/需要讨论”。',
      '请只返回 JSON：{"title":"...","text":"...","learning":"...","tasks":[{"title":"...","owner":"larry|gu|xiaodong|heli|guihua|zhiping|luyang|kingsong","priority":"high|medium|low","due":"今天|明天|本周|待定","source":"对话|广播|商机|会议纪要","next":"..."}],"broadcast":{"title":"...","content":"..."}}。',
      'broadcast 写给相关同事，提醒大家确认分工和反馈卡点。'
    ].join('\n');
  }
  if (id === 'quote') {
    return [
      '你是报价 Agent，业务负责人是 Larry。你理解公司的基础业务：悬浮真空熔炼设备、新型金属材料研发、材料试制、熔炼服务、设备选型和客户开发。',
      '你的固定职责只有：生成报价方案和报价依据。',
      '你不要维护客户阶段，不要分配任务状态，不要扫描外部网站；正式对外报价必须由负责人审核。',
      '你的目标是把客户需求转成内部报价草案，不直接承诺正式价格；重要报价必须提醒提交 Jamie 审批。',
      '重点提取：客户背景、报价类型（设备/服务/材料试制/工艺验证/打包）、缺失参数、风险、报价组成、参考依据、价格区间、交付周期、需要同事补充的信息。',
      '请只返回 JSON：{"title":"...","text":"...","learning":"...","quote":{"customer":"...","type":"设备报价|熔炼服务|材料试制|工艺验证|打包方案","summary":"...","components":["..."],"technicalParams":["..."],"costStructure":["..."],"basis":["过往报价案例...","市场价格参考...","内部专家依据..."],"priceRange":"...","negotiableSpace":"...","confirmQuestions":["..."],"missing":["..."],"risk":["..."],"next":"...","approval":"需要 Jamie 审批|Larry 可继续补充"},"broadcast":{"title":"...","content":"..."}}。',
      'broadcast 写给 Larry 和相关同事，推动补齐参数，而不是把报价发给客户。'
    ].join('\n');
  }
  if (id === 'customer') {
    return [
      '你是客户管理 Agent，目标是提高客户管理效率，把客户信息、阶段、跟进动作和商机价值整理清楚。',
      '你的固定职责只有：维护客户阶段和跟进建议。',
      '你不要扫描外部网站，不要生成报价金额，不要管理任务状态；如需要这些动作，只给出调用对应 Agent 的建议。',
      '你可以读取团队对话、任务、报价草案、商机收藏和广播反馈，但输出不要泄露私密聊天原文，只输出客户卡片、阶段判断和跟进建议。',
      '重点提取：客户名称、客户类型、联系人、当前阶段、负责人、最近动作、下一步、是否需要报价、是否存在大商机。',
      '客户阶段只能使用：未接触、已接触、有意向、待报价、待成交、已成交。',
      '阶段判断规则：看到客户/招标/联系方式但还只是“准备联系、明天拜访、计划沟通、找到联系方式”，必须归为未接触；只有已经电话、微信、拜访、会议或明确沟通过，才归为已接触。',
      '请只返回 JSON：{"title":"...","text":"...","learning":"...","customers":[{"name":"...","type":"科研机构|航天军工|高校科研|半导体|企业客户|未知","stage":"未接触|已接触|有意向|待报价|待成交|已成交","owner":"larry|gu|xiaodong|heli|guihua|zhiping|luyang|kingsong","contact":"...","phone":"...","last":"今天|本周|待确认","next":"...","priority":"high|medium|low"}],"broadcast":{"title":"...","content":"..."}}。',
      '如果发现客户需要报价或技术确认，请把 next 写成清晰动作，系统会生成客户跟进任务。'
    ].join('\n');
  }
  return [
    '你是外部机会 Agent，目标是把外部信息和内部专家能力相互匹配，找到可能很大的商机线索。',
    '你的固定职责只有：扫描行业、招标和新闻，输出外部线索和商机评分。',
    '你不要维护客户阶段，不要分配内部任务，不要生成报价方案；如果线索值得跟进，只建议转给客户管理/任务/报价 Agent。',
    '优先使用用户指定的国内招标网站抓取结果；如果某站点需要 JavaScript 或登录导致无法解析，要明确标为“需人工打开验证”。',
    '团队方向：悬浮真空熔炼设备、新型金属材料研发、材料试制、设备选型、客户开发。',
    '重点寻找：高校/研究院设备升级、航天军工材料试制、特种合金小试线、真空熔炼/悬浮熔炼需求、进口替代、招投标苗头、供应链价格变化。',
    '请按四个维度判断好商机：有没有真实需求、有没有预算、什么时候采购、我们有没有优势。',
    '请只返回 JSON：{"title":"...","source":"...","match":"...","why":"...","action":"...","urgency":"...","url":"...","date":"...","procurementUnit":"...","tenderUnit":"...","budget":"...","deadline":"...","contact":"...","contactPhone":"...","missingFields":["..."],"quality":{"demand":1-5,"budget":1-5,"timing":1-5,"advantage":1-5,"total":1-100,"recommendation":"..."},"learning":"...","broadcast":{"title":"...","content":"..."}}。',
    'title 要像商机卡片标题，why 要讲清楚为什么可能是大机会，action 要说明同事下一步怎么验证和补充信息。'
  ].join('\n');
}

function normalizeSystemAgentOutput(id, data, raw, tenderSignals = []) {
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
  if (id === 'customer') {
    return {
      id: `customer-${Date.now()}`,
      at: new Date().toISOString(),
      title: data.title || '客户管理 Agent 已整理客户跟进建议',
      text: data.text || '客户管理 Agent 已从信息流中提取客户阶段、负责人和下一步动作。',
      learning: data.learning || '客户管理 Agent 学习到：客户管理需要把客户阶段、报价需求和下一步跟进动作连到任务看板。',
      customers: Array.isArray(data.customers) ? data.customers.slice(0, 8) : fallbackCustomerInsights(),
      broadcast: normalizeSystemBroadcast(data.broadcast, {
        type: '客户跟进',
        title: data.title || '客户管理 Agent 发现新的客户跟进动作',
        action: data.text || '请相关同事确认客户阶段、负责人和下一步动作。'
      }),
      raw
    };
  }
  if (id === 'external') {
    const tender = pickTenderSignal(data, tenderSignals);
    const opportunity = {
      id: `external-${Date.now()}`,
      title: data.title || tender?.title || '待验证：新型金属材料研发客户线索',
      source: data.source || tender?.source || '外部机会 Agent / 招标网站抓取',
      match: data.match || tender?.match || '材料与设备能力匹配 78%',
      why: data.why || tender?.why || raw.slice(0, 240),
      action: data.action || tender?.action || '收藏后让个人助理继续拆解客户画像、切入口和下一步验证动作。',
      urgency: data.urgency || tender?.urgency || '需要 48 小时内验证线索真实性和联系人。',
      url: data.url || tender?.url || '',
      date: data.date || tender?.date || '',
      procurementUnit: data.procurementUnit || data.buyer || tender?.procurementUnit || tender?.buyer || '',
      tenderUnit: data.tenderUnit || tender?.tenderUnit || '',
      buyer: data.buyer || tender?.buyer || tender?.procurementUnit || '',
      agency: data.agency || tender?.agency || '',
      budget: data.budget || tender?.budget || '',
      deadline: data.deadline || tender?.deadline || '',
      contact: data.contact || tender?.contact || '',
      contactPhone: data.contactPhone || tender?.contactPhone || '',
      projectName: data.projectName || tender?.projectName || tender?.title || '',
      tenderInfo: data.tenderInfo || tender?.tenderInfo || '',
      rawSnippet: data.rawSnippet || tender?.rawSnippet || '',
      detailRef: data.detailRef || tender?.detailRef || '',
      infoCompleteness: data.infoCompleteness || tender?.infoCompleteness || 0,
      missingFields: data.missingFields || tender?.missingFields || [],
      quality: data.quality || tender?.quality || evaluateTextOpportunity(`${data.title || tender?.title || ''} ${data.why || tender?.why || ''}`),
      recommendation:
        data.recommendation ||
        data.quality?.recommendation ||
        tender?.recommendation ||
        tender?.quality?.recommendation ||
        '先核实真实需求、预算、采购时间和我方优势。'
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

async function fetchTenderSignals(store) {
  store.tenderScan ??= { seenIds: {}, runs: [] };
  const result = await scanTenderSources({
    rootDir,
    keywords: tenderKeywords,
    limit: 18,
    maxKeywords: 8,
    includeManual: true,
    scanState: store.tenderScan
  });
  store.tenderScan = result.scanState;
  return result.opportunities;
}

function dedupeTenderSignals(signals) {
  const seen = new Set();
  return signals.filter((signal) => {
    const key = `${signal.title}-${signal.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatTenderSignals(signals = []) {
  return signals
    .slice(0, 12)
    .map((item) => {
      const unit = item.procurementUnit || item.tenderUnit || item.buyer || '招标/采购单位待核验';
      const budget = item.budget || '预算待核验';
      const deadline = item.deadline || '截止时间待核验';
      const contact = [item.contact, item.contactPhone].filter(Boolean).join(' ') || '联系人待核验';
      const missing = item.missingFields?.length ? `缺失字段：${item.missingFields.join('、')}` : '关键字段基本齐全';
      return [
        `- ${item.date || '日期待确认'} ${item.title}`,
        `  来源：${item.source} / ${item.url || ''}`,
        `  招标/采购单位：${unit}`,
        `  预算：${budget}；截止/开标：${deadline}；联系人：${contact}`,
        `  类型/地区：${item.type || '待确认'} / ${item.region || '待确认'}；信息完整度：${item.infoCompleteness || 0}%；${missing}`,
        `  判断：${item.why}`,
        `  下一步：${item.action}`
      ].join('\n');
    })
    .join('\n');
}

function pickTenderSignal(data, tenderSignals = []) {
  if (!tenderSignals.length) return null;
  const dataTitle = String(data.title || '');
  return tenderSignals.find((item) => dataTitle && item.title.includes(dataTitle.slice(0, 10))) ?? tenderSignals[0];
}

function chooseBestTenderSignal(tenderSignals = []) {
  return [...tenderSignals].sort((a, b) => {
    if (a.manual !== b.manual) return a.manual ? 1 : -1;
    const completenessDelta = Number(b.infoCompleteness || 0) - Number(a.infoCompleteness || 0);
    if (completenessDelta) return completenessDelta;
    const scoreDelta = Number(b.quality?.total || b.score || 0) - Number(a.quality?.total || a.score || 0);
    if (scoreDelta) return scoreDelta;
    return String(b.date || '').localeCompare(String(a.date || ''));
  })[0] || null;
}

function findOpportunityById(store, id) {
  return (store.generatedOpportunities ?? []).find((item) => item.id === id) || null;
}

function normalizeSavedOpportunity(opportunity, fallbackId) {
  return {
    id: opportunity.id || fallbackId,
    title: String(opportunity.title || fallbackId || '待验证商机线索').slice(0, 160),
    source: String(opportunity.source || '线索池').slice(0, 160),
    match: opportunity.match || '',
    why: opportunity.why || '',
    action: opportunity.action || '确认客户背景、真实需求、预算、采购时间和下一步跟进动作。',
    urgency: opportunity.urgency || '',
    procurementUnit: opportunity.procurementUnit || opportunity.buyer || '',
    tenderUnit: opportunity.tenderUnit || '',
    buyer: opportunity.buyer || opportunity.procurementUnit || '',
    agency: opportunity.agency || '',
    budget: opportunity.budget || '',
    deadline: opportunity.deadline || '',
    contact: opportunity.contact || '',
    contactPhone: opportunity.contactPhone || '',
    projectName: opportunity.projectName || opportunity.title || '',
    tenderInfo: opportunity.tenderInfo || '',
    rawSnippet: opportunity.rawSnippet || '',
    detailRef: opportunity.detailRef || '',
    infoCompleteness: opportunity.infoCompleteness || 0,
    missingFields: opportunity.missingFields || [],
    url: opportunity.url || '',
    date: opportunity.date || '',
    quality: opportunity.quality || evaluateTextOpportunity(`${opportunity.title || ''} ${opportunity.why || ''} ${opportunity.action || ''}`),
    recommendation: opportunity.recommendation || opportunity.quality?.recommendation || '',
    recommendedOwner: opportunity.recommendedOwner || recommendOpportunityOwner(opportunity)
  };
}

function materializeOpportunityPipeline(store, { opportunity, ownerId, actorId }) {
  const createdArtifacts = { tasks: [], quotes: [], customers: [], opportunities: [], knowledge: [] };
  store.generatedOpportunities ??= [];
  if (!store.generatedOpportunities.some((item) => item.id === opportunity.id)) {
    store.generatedOpportunities.unshift(opportunity);
    store.generatedOpportunities = store.generatedOpportunities.slice(0, 30);
    createdArtifacts.opportunities.push(opportunity);
  }

  const text = [opportunity.title, opportunity.source, opportunity.why, opportunity.action, opportunity.urgency].filter(Boolean).join('\n');
  const responsible = opportunity.recommendedOwner || ownerId || WORKFLOW_OWNER_ID;
  const customer = normalizeCustomerInsight(
    {
      name: inferCustomerName(text) || `${truncateText(opportunity.title, 28)} 潜在客户`,
      type: inferCustomerType(text),
      stage: opportunity.quality?.total >= 80 ? '有意向' : '未接触',
      owner: responsible,
      collaborators: responsible === ownerId ? [] : [ownerId],
      contact: '待确认',
      phone: '待确认',
      last: '线索池收藏',
      next: opportunity.action || '确认客户背景和下一步跟进动作。',
      priority: opportunity.quality?.total >= 80 ? 'high' : 'medium'
    },
    actorId
  );
  const existingCustomer = store.customers.find((item) => item.name === customer.name);
  upsertCustomers(store, [customer]);
  const customerId = existingCustomer?.id || customer.id;
  createdArtifacts.customers.push({ ...customer, id: customerId });

  const task = normalizeTaskInput(
    {
      title: `验证线索并跟进客户：${opportunity.title}`,
      owner: responsible,
      collaborators: responsible === ownerId ? [] : [ownerId],
      due: opportunity.quality?.timing >= 4 ? '今天' : '48 小时内',
      priority: opportunity.quality?.total >= 80 ? 'high' : 'medium',
      status: 'todo',
      tag: '商机验证',
      source: '线索池收藏',
      next: [
        opportunity.action,
        `评分：需求 ${opportunity.quality?.demand ?? 3}/5，预算 ${opportunity.quality?.budget ?? 3}/5，时间 ${opportunity.quality?.timing ?? 3}/5，优势 ${opportunity.quality?.advantage ?? 3}/5。`
      ].filter(Boolean).join('\n'),
      relatedCustomerId: customerId,
      relatedOpportunityId: opportunity.id
    },
    actorId
  );
  store.tasks ??= [];
  store.tasks.unshift(task);
  createdArtifacts.tasks.push(task);

  if (/报价|询价|预算|设备|熔炼|采购|招标|服务|材料试制/.test(text)) {
    const quote = createQuoteDraftFromText({ text, ownerId: responsible, actorId, customerName: customer.name });
    quote.relatedCustomerId = customerId;
    quote.relatedOpportunityId = opportunity.id;
    store.quotes ??= [];
    store.quotes.unshift(quote);
    store.quotes = store.quotes.slice(0, 40);
    createdArtifacts.quotes.push(quote);
  }

  const knowledge = createKnowledgeFromText({
    text: `线索池收藏：${text}`,
    ownerId: responsible,
    actorId,
    source: '线索池收藏',
    agent: { name: '外部机会 Agent → 内部信息 Agent' }
  });
  store.knowledge ??= [];
  store.knowledge.unshift(knowledge);
  store.knowledge = store.knowledge.slice(0, 80);
  store.systemAgentOutputs ??= {};
  store.systemAgentOutputs.internal ??= [];
  store.systemAgentOutputs.internal.unshift(knowledgeToInsight(knowledge));
  store.systemAgentOutputs.internal = store.systemAgentOutputs.internal.slice(0, 12);
  createdArtifacts.knowledge.push(knowledge);

  return createdArtifacts;
}

function recommendOpportunityOwner(opportunity = {}) {
  const text = `${opportunity.title ?? ''} ${opportunity.why ?? ''} ${opportunity.action ?? ''}`;
  if (/材料|合金|靶材|高熵|难熔/.test(text)) return 'guihua';
  if (/设备|熔炼炉|真空炉|冷坩埚|感应|电弧/.test(text)) return 'kingsong';
  if (/客户|研究院|实验室|采购|招标|预算/.test(text)) return 'luyang';
  return WORKFLOW_OWNER_ID;
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
    components: ['设备/服务范围', '材料体系', '检测要求', '交付周期', '质保和验收边界'],
    technicalParams: ['材料体系', '单炉重量', '目标温度/真空度', '检测标准'],
    costStructure: ['设备/服务成本', '材料与耗材', '检测与报告', '交付与质保'],
    basis: ['历史报价案例：待匹配', '市场同类设备/服务价格：待核验', '内部设备与材料专家经验：可引用'],
    priceRange: '待补齐参数后生成内部区间',
    negotiableSpace: '待确认客户预算、交付周期和服务范围后判断',
    confirmQuestions: ['预算范围', '交付时间', '验收标准', '是否需要检测报告'],
    missing: ['材料体系', '单炉重量', '批次数', '检测要求', '交付时间', '客户预算'],
    risk: ['参数不足导致报价偏差', '交付周期和质保边界需要明确', '正式报价前需要 Jamie 审批'],
    next: 'Larry 牵头补齐客户需求，报价 Agent 生成内部草案后提交 Jamie 审批。',
    approval: '需要 Jamie 审批'
  };
}

function visibleTasksForSession(store, session) {
  const tasks = store.tasks ?? [];
  if (isWorkflowOwner(session)) return tasks;
  return tasks.filter((task) => task.owner === session.userId || (task.collaborators ?? []).includes(session.userId));
}

function visibleQuotesForSession(store, session) {
  const quotes = store.quotes ?? [];
  if (isWorkflowOwner(session)) return quotes;
  return quotes.filter((quote) => quote.owner === session.userId || (quote.collaborators ?? []).includes(session.userId));
}

function visibleCustomersForSession(store, session) {
  const customers = store.customers ?? [];
  if (isWorkflowOwner(session)) return customers;
  return customers.filter((customer) => customer.owner === session.userId || (customer.collaborators ?? []).includes(session.userId));
}

function canEditTask(session, task) {
  return isWorkflowOwner(session) || task.owner === session.userId || (task.collaborators ?? []).includes(session.userId);
}

function normalizeTaskInput(input, actorId) {
  const owner = String(input.owner || actorId).toLowerCase();
  return {
    id: input.id || `task-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    title: String(input.title || '新的跟进任务').slice(0, 160),
    tag: String(input.tag || input.source || '工作任务').slice(0, 40),
    owner,
    collaborators: Array.isArray(input.collaborators) ? input.collaborators.map((id) => String(id).toLowerCase()) : [],
    due: String(input.due || '待定').slice(0, 40),
    priority: ['high', 'medium', 'low'].includes(input.priority) ? input.priority : 'medium',
    status: ['todo', 'progress', 'review', 'done', 'closed', 'blocked', 'cancelled'].includes(input.status) ? input.status : 'todo',
    source: String(input.source || '手动创建').slice(0, 80),
    next: String(input.next || '确认下一步动作。').slice(0, 500),
    result: input.result ? String(input.result).slice(0, 500) : '',
    evaluation: input.evaluation ? String(input.evaluation).slice(0, 500) : '',
    relatedCustomerId: input.relatedCustomerId || '',
    relatedQuoteId: input.relatedQuoteId || '',
    relatedOpportunityId: input.relatedOpportunityId || '',
    createdAt: new Date().toISOString(),
    createdBy: actorId
  };
}

function deriveWorkflowArtifactsFromMessage({ actorId, ownerId, message, reply, attachments = [], agent, user }) {
  const text = `${message}\n${reply}`;
  const hasAttachment = attachments.length > 0;
  const artifacts = { tasks: [], quotes: [], customers: [], opportunities: [], knowledge: [] };
  const actionable = /会议|纪要|访谈|客户|报价|商机|跟进|确认|整理|准备|参数|方案|预算|采购|招标|熔炼|材料|设备|风险|供应/.test(text);
  if (!actionable && !hasAttachment) return artifacts;
  const firstAttachment = attachments[0];
  const source = hasAttachment ? `附件：${firstAttachment.name}` : '个人助理对话';
  const title = hasAttachment
    ? `处理并拆解 ${firstAttachment.name}`
    : inferTaskTitle(text);
  artifacts.tasks.push(
    normalizeTaskInput(
      {
        title,
        owner: ownerId,
        priority: /报价|客户|预算|采购|今天|紧急/.test(text) ? 'high' : 'medium',
        due: /今天|紧急/.test(text) ? '今天' : '本周',
        tag: /报价/.test(text) ? '报价准备' : hasAttachment ? '纪要拆解' : /客户|商机/.test(text) ? '客户跟进' : '对话行动',
        source,
        next: hasAttachment
          ? '从附件中提取分工、客户线索、报价需求和需要补充的信息。'
          : truncateText(String(reply || message).replace(/\s+/g, ' ').trim(), 180)
      },
      actorId
    )
  );

  const customerName = inferCustomerName(text);
  if (/客户|访谈|会议|纪要|联系人|采购|预算|招标|研究院|实验室|航天|半导体/.test(text) || customerName) {
    artifacts.customers.push(
      normalizeCustomerInsight(
        {
          name: customerName || `${user?.name ?? ownerId} 待确认客户`,
          type: inferCustomerType(text),
          stage: inferCustomerStage(message),
          owner: ownerId,
          contact: inferContact(text),
          phone: inferPhone(text),
          last: '今天',
          next: inferCustomerNext(text),
          priority: /紧急|今天|报价|预算|采购|招标|航天/.test(text) ? 'high' : 'medium'
        },
        actorId
      )
    );
  }

  if (/报价|价格|预算|询价|设备|熔炼服务|材料试制|工艺验证|交付|参数/.test(text)) {
    const quote = createQuoteDraftFromText({ text, ownerId, actorId, customerName });
    artifacts.quotes.push(quote);
    artifacts.tasks.push(
      normalizeTaskInput(
        {
          title: `补齐报价参数：${quote.customer}`,
          owner: WORKFLOW_OWNER_ID,
          collaborators: ownerId === WORKFLOW_OWNER_ID ? [] : [ownerId],
          priority: /紧急|今天|航天|招标/.test(text) ? 'high' : 'medium',
          due: /今天|紧急/.test(text) ? '今天' : '本周',
          tag: '报价准备',
          source,
          next: [quote.next, quote.missing.length ? `缺失参数：${quote.missing.join('、')}` : ''].filter(Boolean).join('\n'),
          relatedQuoteId: quote.id
        },
        actorId
      )
    );
  }

  if (/商机|机会|招标|采购|客户线索|市场|航天|研究院|实验室|新材料|熔炼炉/.test(text)) {
    const opportunity = createOpportunityFromText({ text, ownerId, actorId, customerName, source });
    artifacts.opportunities.push(opportunity);
    artifacts.tasks.push(
      normalizeTaskInput(
        {
          title: `验证商机：${opportunity.title}`,
          owner: ownerId,
          collaborators: ownerId === WORKFLOW_OWNER_ID ? [] : [WORKFLOW_OWNER_ID],
          priority: /紧急|今天|招标|航天/.test(text) ? 'high' : 'medium',
          due: /今天|紧急/.test(text) ? '今天' : '48 小时内',
          tag: '商机验证',
          source,
          next: opportunity.action,
          relatedOpportunityId: opportunity.id
        },
        actorId
      )
    );
  }

  if (/经验|参数|工艺|材料|设备|风险|供应|报价|客户顾虑|纪要|访谈|附件正文/.test(text) || hasAttachment) {
    artifacts.knowledge.push(createKnowledgeFromText({ text, ownerId, actorId, source, agent }));
  }

  artifacts.tasks = dedupeByTitleAndOwner(artifacts.tasks).slice(0, 5);
  artifacts.customers = dedupeByName(artifacts.customers).slice(0, 3);
  artifacts.quotes = artifacts.quotes.slice(0, 2);
  artifacts.opportunities = dedupeTenderSignals(artifacts.opportunities).slice(0, 3);
  artifacts.knowledge = artifacts.knowledge.slice(0, 2);
  return artifacts;
}

function inferTaskTitle(text = '') {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (/报价/.test(clean)) return '推进报价准备并补齐关键参数';
  if (/客户|商机/.test(clean)) return '跟进客户线索并验证商机价值';
  if (/会议|纪要|访谈/.test(clean)) return '拆解会议纪要并形成行动项';
  if (/材料/.test(clean)) return '整理材料需求和供应风险';
  if (/设备|参数/.test(clean)) return '确认设备参数和交付风险';
  return truncateText(clean, 48) || '根据对话生成下一步任务';
}

function inferCustomerName(text = '') {
  const clean = String(text).replace(/\s+/g, ' ');
  const patterns = [
    /([\u4e00-\u9fa5A-Za-z0-9（）()]{2,40}(?:研究院|实验室|大学|学院|航天[^，。；\s]{0,12}|半导体[^，。；\s]{0,12}|材料[^，。；\s]{0,12}公司|科技[^，。；\s]{0,12}公司|有限公司))/,
    /客户[：: ]+([\u4e00-\u9fa5A-Za-z0-9（）()]{2,40})/,
    /采购单位[：: ]+([\u4e00-\u9fa5A-Za-z0-9（）()]{2,50})/
  ];
  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match?.[1]) return truncateText(cleanCustomerName(match[1]), 60);
  }
  return '';
}

function cleanCustomerName(name = '') {
  return String(name)
    .replace(/^(今天|昨天|上午|下午|刚才)?\s*(和|跟|与)/, '')
    .replace(/(沟通|交流|开会|访谈|说|提到).*$/, '')
    .replace(/[赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳酆鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄][\u4e00-\u9fa5]{0,2}(?:主任|教授|老师|经理|博士|总|工).*$/, '')
    .replace(/[，。；;:：]$/, '')
    .trim();
}

function inferCustomerType(text = '') {
  if (/航天|军工|航空/.test(text)) return '航天军工';
  if (/大学|学院|高校|实验室/.test(text)) return '高校科研';
  if (/研究院|研究所|科研/.test(text)) return '科研机构';
  if (/半导体|靶材|芯片/.test(text)) return '半导体';
  return '企业客户';
}

function inferContact(text = '') {
  return String(text).match(/([赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳酆鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄][\u4e00-\u9fa5]{0,2}(?:主任|教授|老师|经理|总|工|博士))/)?.[1] || '待确认';
}

function inferPhone(text = '') {
  return String(text).match(/1[3-9]\d[\d*]{4,8}\d{2,4}/)?.[0] || '待确认';
}

function inferCustomerNext(text = '') {
  if (/报价|询价/.test(text)) return '补齐报价参数、预算范围、交付周期和审批要求。';
  if (/招标|采购/.test(text)) return '核实采购公告、报名条件、技术参数和联系人。';
  if (/材料|试制|工艺/.test(text)) return '确认材料体系、试制批次、检测要求和能否用服务切入。';
  return '确认客户背景、真实需求、决策链和下一步跟进时间。';
}

function inferCustomerStage(text = '') {
  if (/成交|签约|已下单|复购/.test(text)) return '已成交';
  if (/商务|谈判|合同|待成交/.test(text)) return '待成交';
  if (/报价|询价|价格|预算/.test(text)) return '待报价';
  if (/意向|感兴趣|方案|样品|试制|验证/.test(text)) return '有意向';
  if (isFutureContactText(text)) return '未接触';
  if (/已联系|沟通|拜访|会议|访谈|交流/.test(text)) return '已接触';
  return '未接触';
}

function isFutureContactText(text = '') {
  const value = String(text || '');
  const futureIntent = /(准备|计划|打算|想先|明天|后天|下周|稍后|即将|准备.*去|准备.*和|先去|后续).*?(联系|沟通|拜访|接触|交流|电话|微信|对接)|找到.{0,12}(联系方式|联系人).*?(准备|计划|明天|后续|先去)/.test(value);
  const alreadyContacted = /(已|已经|刚刚|今天已|上午已|下午已).{0,8}(联系|沟通|拜访|接触|交流|电话|微信|对接)|和.{0,20}(联系|沟通|拜访|接触|交流|电话|微信|对接)(过|了)/.test(value);
  return futureIntent && !alreadyContacted;
}

function inferQuoteType(text = '') {
  if (/熔炼服务|代熔|加工服务/.test(text)) return '熔炼服务';
  if (/设备|熔炼炉|真空炉|冷坩埚|悬浮/.test(text)) return '设备报价';
  if (/材料试制|小试|样品|试制/.test(text)) return '材料试制';
  if (/工艺验证|验证/.test(text)) return '工艺验证';
  return '打包方案';
}

function createQuoteDraftFromText({ text, ownerId, actorId, customerName }) {
  const quoteType = inferQuoteType(text);
  const missing = [
    /材料|合金|靶材/.test(text) ? '' : '材料体系',
    /重量|kg|公斤|批次|炉/.test(text) ? '' : '单炉重量/批次',
    /温度|℃|真空|Pa/.test(text) ? '' : '温度与真空度',
    /检测|成分|报告/.test(text) ? '' : '检测要求',
    /交付|周期|日期/.test(text) ? '' : '交付周期',
    /预算|价格|报价/.test(text) ? '' : '预算范围'
  ].filter(Boolean);
  const risk = [
    '参数不足会导致报价偏差',
    /航天|军工|高温|难熔/.test(text) ? '高要求客户需要明确验收标准和质量责任' : '',
    /招标|采购/.test(text) ? '招标项目需要核实报名截止时间和资质要求' : ''
  ].filter(Boolean);
  const components = quoteType === '设备报价'
    ? ['设备主机', '真空/感应/冷却等配套模块', '安装调试', '备件耗材', '质保与验收']
    : quoteType === '熔炼服务'
      ? ['材料准备', '熔炼批次', '工艺验证', '检测报告', '包装交付']
      : ['材料体系确认', '小试/样品制备', '检测分析', '工艺记录', '交付资料'];
  const basis = [
    '过往报价案例：从知识库匹配相似设备/服务边界',
    '市场价格参考：同类真空炉、熔炼服务、电商/公开供应商报价待核验',
    '内部专家依据：设备参数、材料难度、检测要求和交付风险'
  ];
  const technicalParams = [
    /材料|合金|靶材/.test(text) ? '材料体系已出现，需要进一步确认牌号/纯度' : '材料体系待确认',
    /重量|kg|公斤|批次|炉/.test(text) ? '单炉重量/批次已出现，需要核实单位' : '单炉重量/批次待确认',
    /温度|℃|真空|Pa/.test(text) ? '温度/真空度已有线索，需要转成验收指标' : '温度与真空度待确认',
    /检测|成分|报告/.test(text) ? '检测报告要求已出现' : '检测要求待确认'
  ];
  const costStructure = quoteType === '设备报价'
    ? ['设备主机成本', '真空/感应/冷却模块', '安装调试', '备件耗材', '质保服务']
    : ['材料与预处理', '熔炼批次工时', '检测报告', '包装交付', '工艺记录'];
  return {
    id: `quote-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    at: new Date().toISOString(),
    owner: WORKFLOW_OWNER_ID,
    collaborators: ownerId === WORKFLOW_OWNER_ID ? [] : [ownerId],
    customer: customerName || '待确认客户',
    type: quoteType,
    summary: truncateText(`基于 ${quoteType} 需求形成内部报价草案：${String(text).replace(/\s+/g, ' ')}`, 360),
    components,
    technicalParams,
    costStructure,
    basis,
    priceRange: missing.length <= 2 ? '可生成初步区间；正式价格需负责人审核' : '参数不足，暂不生成金额，只输出报价依据和缺失项',
    negotiableSpace: '可围绕交付周期、检测报告深度、服务范围和质保边界谈判。',
    confirmQuestions: missing.length ? missing : ['客户预算', '验收标准', '交付节点'],
    missing,
    risk,
    next: '先补齐关键参数，再由报价 Agent 生成内部草案；正式对外报价前需要负责人审核。',
    approval: /金额|正式|航天|军工|招标/.test(text) ? '需要 Jamie 审批' : 'Larry 可继续补充',
    createdBy: actorId
  };
}

function createOpportunityFromText({ text, ownerId, actorId, customerName, source }) {
  const quality = evaluateTextOpportunity(text);
  const titleBase = customerName || inferTaskTitle(text);
  return {
    id: `opportunity-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    title: truncateText(titleBase.includes('商机') ? titleBase : `${titleBase} 商机线索`, 120),
    source,
    match: /悬浮|真空|熔炼|冷坩埚|高熵|靶材|难熔/.test(text) ? '材料/设备能力匹配 88%' : '客户需求与内部能力匹配 76%',
    why: truncateText(`这条信息包含可验证的客户/采购/技术需求信号：${String(text).replace(/\s+/g, ' ')}`, 260),
    action: /招标|采购/.test(text)
      ? '核实招标来源、报名条件、技术参数和截止时间，再决定是否转报价。'
      : '让负责同事确认客户背景、预算、技术参数和下一步沟通窗口。',
    urgency: /今天|紧急|招标|采购|航天/.test(text) ? '24 小时内验证。' : '本周内完成初步验证。',
    quality,
    recommendation: quality.recommendation,
    owner: ownerId,
    createdBy: actorId,
    date: new Date().toISOString().slice(0, 10)
  };
}

function evaluateTextOpportunity(text = '') {
  const demand = /客户|需求|采购|招标|询价|预算|升级|试制/.test(text) ? 4 : 2;
  const budget = /预算|报价|采购|招标|钱|价格|合同/.test(text) ? 4 : 2;
  const timing = /今天|紧急|尽快|本周|招标|截止/.test(text) ? 5 : /下周|近期|采购/.test(text) ? 4 : 2;
  const advantage = /悬浮|真空|熔炼|冷坩埚|难熔|高熵|靶材|材料|设备/.test(text) ? 5 : 3;
  return {
    demand,
    budget,
    timing,
    advantage,
    total: Math.max(10, Math.min(100, Math.round((demand + budget + timing + advantage) * 5))),
    recommendation:
      demand >= 4 && advantage >= 4
        ? '建议进入线索池并生成客户跟进任务。'
        : '建议先补充客户背景、预算和采购时间。'
  };
}

function createKnowledgeFromText({ text, ownerId, actorId, source, agent }) {
  const type = /报价/.test(text) ? '报价经验' : /客户|商机/.test(text) ? '客户经验' : /材料|合金|靶材/.test(text) ? '材料专家' : /设备|参数|熔炼/.test(text) ? '设备专家' : '工作经验';
  return {
    id: `knowledge-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    type,
    title: `${type}沉淀：${inferTaskTitle(text)}`,
    text: truncateText(String(text).replace(/\s+/g, ' '), 500),
    source,
    owner: ownerId,
    agent: agent?.name || `${ownerId}_AI`,
    createdAt: new Date().toISOString(),
    createdBy: actorId
  };
}

function knowledgeToInsight(item) {
  return {
    id: item.id,
    at: item.createdAt,
    title: item.title,
    text: item.text,
    source: `${item.agent} / ${item.source}`,
    asset: `${item.type}.md`,
    learning: `系统已把 ${getOwnerLabel(item.owner)} 的信息抽象成 ${item.type}，供内部信息 Agent 后续沉淀，不暴露私密原文。`
  };
}

function getOwnerLabel(ownerId) {
  return defaultUsers.find((user) => user.id === ownerId)?.name || ownerId;
}

function upsertCustomers(store, customers) {
  for (const customer of customers) {
    const existing = store.customers.find((item) => item.name === customer.name);
    if (existing) {
      Object.assign(existing, customer, { id: existing.id, updatedAt: new Date().toISOString() });
    } else {
      store.customers.unshift(customer);
    }
  }
  store.customers = store.customers.slice(0, 80);
}

function normalizeExistingCustomerStages(store) {
  let changed = false;
  for (const customer of store.customers ?? []) {
    const combined = [customer.name, customer.stage, customer.last, customer.next, customer.note, customer.source]
      .filter(Boolean)
      .join(' ');
    if (normalizeCustomerStage(customer.stage) === '已接触' && isFutureContactText(combined)) {
      customer.stage = '未接触';
      customer.updatedAt = new Date().toISOString();
      customer.stageNote = '系统根据“准备/计划联系、尚未实际沟通”的语义自动校正为未接触。';
      changed = true;
    }
  }
  return changed;
}

function dedupeByTitleAndOwner(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.title}-${item.owner}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeByName(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function persistSystemAgentArtifacts(store, id, output, actorId) {
  const createdTasks = [];
  if (id === 'task' && Array.isArray(output.tasks)) {
    for (const task of output.tasks) {
      createdTasks.push(normalizeTaskInput({
        title: task.title,
        owner: task.owner || WORKFLOW_OWNER_ID,
        priority: task.priority,
        due: task.due,
        tag: task.source || '任务 Agent',
        source: task.source || '任务 Agent',
        next: task.next
      }, actorId));
    }
  }
  if (id === 'quote' && output.quote) {
    const quote = {
      id: `quote-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      at: new Date().toISOString(),
      owner: WORKFLOW_OWNER_ID,
      customer: output.quote.customer || '待确认客户',
      type: output.quote.type || '打包方案',
      summary: output.quote.summary || output.text || '',
      components: Array.isArray(output.quote.components) ? output.quote.components : [],
      technicalParams: Array.isArray(output.quote.technicalParams) ? output.quote.technicalParams : [],
      costStructure: Array.isArray(output.quote.costStructure) ? output.quote.costStructure : [],
      basis: Array.isArray(output.quote.basis) ? output.quote.basis : [],
      priceRange: output.quote.priceRange || '待补齐参数后生成内部区间',
      negotiableSpace: output.quote.negotiableSpace || '待确认客户预算和服务范围',
      confirmQuestions: Array.isArray(output.quote.confirmQuestions) ? output.quote.confirmQuestions : [],
      missing: Array.isArray(output.quote.missing) ? output.quote.missing : [],
      risk: Array.isArray(output.quote.risk) ? output.quote.risk : [],
      next: output.quote.next || '补齐报价参数并形成内部草案。',
      approval: output.quote.approval || '内部确认',
      createdBy: actorId
    };
    store.quotes ??= [];
    store.quotes.unshift(quote);
    store.quotes = store.quotes.slice(0, 20);
    createdTasks.push(
      normalizeTaskInput({
        title: `补齐报价参数：${quote.customer}`,
        owner: WORKFLOW_OWNER_ID,
        priority: 'high',
        due: '本周',
        tag: '报价准备',
        source: '报价 Agent',
        next: [quote.next, quote.missing.length ? `缺失：${quote.missing.join('、')}` : ''].filter(Boolean).join('\n'),
        relatedQuoteId: quote.id
      }, actorId)
    );
  }
  if (id === 'customer' && Array.isArray(output.customers)) {
    store.customers ??= [];
    for (const customer of output.customers.slice(0, 8)) {
      const normalizedCustomer = normalizeCustomerInsight(customer, actorId);
      const existing = store.customers.find((item) => item.name === normalizedCustomer.name);
      if (existing) {
        Object.assign(existing, normalizedCustomer, { id: existing.id, updatedAt: new Date().toISOString() });
      } else {
        store.customers.unshift(normalizedCustomer);
      }
      createdTasks.push(
        normalizeTaskInput({
          title: `跟进客户：${normalizedCustomer.name}`,
          owner: normalizedCustomer.owner || WORKFLOW_OWNER_ID,
          priority: normalizedCustomer.priority || 'medium',
          due: normalizedCustomer.priority === 'high' ? '今天' : '本周',
          tag: '客户跟进',
          source: '客户管理 Agent',
          next: normalizedCustomer.next || '确认客户阶段和下一步动作。'
        }, actorId)
      );
    }
    store.customers = store.customers.slice(0, 50);
  }
  if (createdTasks.length) {
    store.tasks ??= [];
    store.tasks.unshift(...createdTasks);
  }
  return createdTasks;
}

function normalizeCustomerInsight(customer, actorId) {
  const name = String(customer.name || '待确认客户').slice(0, 120);
  return {
    id: customer.id || `customer-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    name,
    type: String(customer.type || '未知').slice(0, 40),
    stage: normalizeCustomerStage(customer.stage),
    owner: String(customer.owner || WORKFLOW_OWNER_ID).toLowerCase(),
    collaborators: Array.isArray(customer.collaborators) ? customer.collaborators.map((id) => String(id).toLowerCase()) : [],
    contact: String(customer.contact || '待确认').slice(0, 80),
    phone: String(customer.phone || '待确认').slice(0, 40),
    last: String(customer.last || '待确认').slice(0, 40),
    next: String(customer.next || '确认客户需求和下一步动作。').slice(0, 500),
    priority: ['high', 'medium', 'low'].includes(customer.priority) ? customer.priority : 'medium',
    createdAt: new Date().toISOString(),
    createdBy: actorId
  };
}

function normalizeCustomerStage(stage = '') {
  const value = String(stage || '').trim();
  if (/未接触|线索/.test(value)) return '未接触';
  if (/已接触|洽谈|沟通/.test(value)) return '已接触';
  if (/有意向|意向|方案/.test(value)) return '有意向';
  if (/待报价|报价/.test(value)) return '待报价';
  if (/待成交|商务|谈判|合同/.test(value)) return '待成交';
  if (/已成交|成交|维护/.test(value)) return '已成交';
  return '未接触';
}

function fallbackCustomerInsights() {
  return [
    {
      name: '待验证材料实验室客户',
      type: '科研机构',
      stage: '线索',
      owner: 'luyang',
      contact: '待确认',
      phone: '待确认',
      last: '待确认',
      next: '确认是否存在悬浮真空熔炼设备升级或材料试制需求。',
      priority: 'medium'
    }
  ];
}

function fallbackSystemAgentOutput(id, detail = '', tenderSignals = []) {
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
  if (id === 'customer') {
    return normalizeSystemAgentOutput(
      'customer',
      {
        title: '客户管理 Agent：客户跟进建议',
        text: `建议先把客户按线索、洽谈中、报价阶段、商务谈判、成交维护分层，并为每个客户生成下一步动作。${detail}`,
        learning: '客户管理 Agent 将持续学习客户阶段、报价需求和商机价值之间的关系。',
        customers: fallbackCustomerInsights(),
        broadcast: {
          type: '客户跟进',
          title: '客户管理 Agent 提醒：请补齐客户阶段和下一步',
          content: '请相关同事补齐客户联系人、当前阶段、是否需要报价和下一步跟进动作。'
        }
      },
      detail
    );
  }
  if (id === 'external') {
    const tender = chooseBestTenderSignal(tenderSignals);
    return normalizeSystemAgentOutput(
      'external',
      {
        title: tender?.title || '待验证：材料试制切入悬浮真空熔炼设备客户',
        source: tender?.source || '外部机会 Agent / 本地降级',
        match: tender?.match || '材料专家与设备专家能力匹配 80%',
        why: tender?.why || `可先围绕高校材料实验室、航空航天材料团队、特种合金小试线寻找材料试制需求。${detail}`,
        action: tender?.action || '收藏后让个人助理生成客户清单、验证问题和首轮沟通话术。',
        urgency: tender?.urgency || '48 小时内先验证 10 个潜在客户名单。',
        url: tender?.url || '',
        date: tender?.date || '',
        learning: tenderSignals.length
          ? '外部机会 Agent 已接入国内招标网站抓取结果，并优先筛选熔炼炉、真空熔炼、新材料相关线索。'
          : '外部机会 Agent 通过内部材料/设备能力，优先寻找材料试制切入设备销售的机会。',
        broadcast: {
          title: tender?.title ? `外部机会 Agent 发现招标线索：${tender.title}` : '外部机会 Agent 发现：材料试制可切入悬浮真空熔炼设备客户',
          content: tender?.action || '请大家补充高校材料实验室、航天材料团队、特种合金小试线等潜在客户线索；收藏后可让个人助理拆客户画像和验证问题。'
        }
      },
      detail,
      tenderSignals
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
    users: store.users.map(({ password, passwordHash, ...user }) => user),
    pendingRegistrations: (store.pendingRegistrations ?? []).map(({ passwordHash, ...item }) => item)
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
