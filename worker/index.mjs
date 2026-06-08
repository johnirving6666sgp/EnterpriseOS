const STORE_KEY = 'enterprise_os_store';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1/messages';
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions';
const WORKFLOW_SYSTEM_AGENTS = new Set(['task', 'quote', 'customer']);

const defaultUsers = [
  { id: 'jamie', name: 'Jamie', role: 'super_admin', password: 'jamie-demo', active: true, businessRole: 'management' },
  { id: 'larry', name: 'Larry', role: 'coworker', password: 'demo', active: true, businessRole: 'sales' },
  { id: 'gu', name: 'Gu', role: 'coworker', password: 'demo', active: true, businessRole: 'technical' },
  { id: 'xiaodong', name: 'Xiaodong', role: 'coworker', password: 'demo', active: true, businessRole: 'sales' },
  { id: 'heli', name: 'Heli', role: 'coworker', password: 'demo', active: true, businessRole: 'admin' },
  { id: 'guihua', name: 'Guihua', role: 'coworker', password: 'demo', active: true, businessRole: 'sales' },
  { id: 'zhiping', name: 'Zhiping', role: 'coworker', password: 'demo', active: true, businessRole: 'technical' },
  { id: 'luyang', name: 'Luyang', role: 'coworker', password: 'demo', active: true, businessRole: 'tester' },
  { id: 'kingsong', name: 'Kingsong', role: 'coworker', password: 'demo', active: true, businessRole: 'tester' }
];

const defaultAgents = Object.fromEntries(
  defaultUsers.map((user) => [
    user.id,
    {
      id: user.id,
      name: `${user.name}_AI`,
      ownerId: user.id,
      modelTier: user.id === 'heli' || user.id === 'guihua' ? 'lite' : user.id === 'xiaodong' || user.id === 'luyang' || user.id === 'kingsong' ? 'balanced' : 'strong',
      provider: 'claude',
      apiModel: user.id === 'heli' || user.id === 'guihua' ? 'claude-3-5-haiku' : user.id === 'xiaodong' || user.id === 'luyang' || user.id === 'kingsong' ? 'claude-sonnet-4' : 'claude-opus-4',
      active: true
    }
  ])
);

const seedStore = {
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
      ownerId: 'larry'
    },
    task: {
      name: '任务看板 Agent',
      scope: '从对话、会议纪要、广播反馈和商机收藏中提取、分配、跟进任务。',
      boundary: '不维护客户漏斗、不生成报价依据、不做行业扫描。',
      provider: 'openrouter',
      apiModel: 'openrouter/openai/gpt-4.1-mini',
      ownerId: 'larry'
    },
    quote: {
      name: '报价 Agent',
      scope: '生成报价方案、报价构成、参考依据、缺失参数和风险。',
      boundary: '不承诺正式对外价格、不管理客户阶段、不扫描外部线索。',
      provider: 'claude',
      apiModel: 'claude-sonnet-4',
      ownerId: 'larry'
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
  conversationArchives: {},
  savedOpportunities: { larry: ['aerospace-valve'] },
  generatedOpportunities: [
    {
      id: 'aerospace-valve',
      type: '招投标 / 企业新闻',
      title: '某航天厂急需高压阀门',
      source: '示例线索',
      company: '某航天设备制造单位',
      date: new Date().toISOString().slice(0, 10),
      score: 86,
      match: '需求涉及高压阀门、快速报价、可靠交付，和内部设备经验高度相关。',
      next: 'Larry 先确认采购窗口、规格参数和预算，再决定是否进入报价准备。',
      owner: 'larry',
      url: 'https://timeconnector.net'
    }
  ],
  systemAgentOutputs: { internal: [], external: [], task: [], quote: [], customer: [] },
  tasks: [
    {
      id: 'task-aerospace-quote',
      title: '生成某航天厂高压阀门报价方案',
      tag: '报价方案',
      owner: 'larry',
      collaborators: ['gu'],
      due: '今天',
      priority: 'high',
      status: 'progress',
      source: '商机收藏',
      next: '补齐客户场景和关键设备参数，形成内部报价草案。',
      createdAt: new Date().toISOString(),
      createdBy: 'system'
    }
  ],
  quotes: [],
  customers: [
    { id: 'customer-east-research', name: '华东有色金属研究院', type: '科研机构', stage: '未接触', owner: 'luyang', contact: '张主任', phone: '138****8888', last: '5 天前', next: '确认设备升级预算和材料试制需求。' },
    { id: 'customer-sh-aerospace', name: '上海航天设备制造', type: '航天军工', stage: '待报价', owner: 'larry', contact: '李工', phone: '139****6666', last: '今天', next: '补齐高压阀门参数和交付周期。' },
    { id: 'customer-gz-lab', name: '广州高校材料实验室', type: '高校科研', stage: '有意向', owner: 'guihua', contact: '王教授', phone: '137****5555', last: '2 天前', next: '判断是否用材料试制切入设备方案。' },
    { id: 'customer-bj-semi', name: '北京半导体材料公司', type: '半导体', stage: '已成交', owner: 'xiaodong', contact: '赵经理', phone: '136****4444', last: '1 周前', next: '维护复购和设备升级机会。' }
  ],
  broadcasts: [
    {
      id: 'bc-aerospace-reminder',
      type: '商机线索',
      title: '外部商机预警：高压阀门需求',
      content: '建议 Larry 和 Gu 协同确认客户需求、技术参数和报价风险。',
      recipients: ['larry', 'gu'],
      feedback: {},
      readBy: {},
      createdBy: 'jamie',
      createdAt: new Date().toISOString()
    }
  ],
  pendingRegistrations: [],
  agentFeedback: [],
  tenderScan: { seenIds: {}, runs: [] },
  usage: {},
  auditLog: [],
  meta: { cloudflareWorkerStore: true, fullTeamTrialActivated: true }
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), request);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    try {
      const response = await routeApi(request, env, url);
      return cors(response, request);
    } catch (error) {
      return cors(json({ error: 'server_error', message: error.message }, 500), request);
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runScheduledExternalScan(env));
  }
};

async function routeApi(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  if (method === 'GET' && path === '/api/health') {
    return json({ ok: true, app: 'EnterpriseOS', runtime: 'cloudflare-worker', storage: env.DB ? 'd1' : 'memory' });
  }

  if (method === 'POST' && path === '/api/login') return login(request, env);
  if (method === 'POST' && path === '/api/register') return register(request, env);

  const session = await requireSession(request, env);
  if (session instanceof Response) return session;

  if (method === 'GET' && path === '/api/state') return getState(env, session);
  if (method === 'POST' && match(path, /^\/api\/agents\/([^/]+)\/chat$/)) return agentChat(request, env, session, RegExp.$1);
  if (method === 'POST' && match(path, /^\/api\/agents\/([^/]+)\/conversation\/clear$/)) return clearConversation(env, session, RegExp.$1);
  if (method === 'POST' && match(path, /^\/api\/agents\/([^/]+)\/route$/)) return updateAgentRoute(request, env, session, RegExp.$1);
  if (method === 'POST' && match(path, /^\/api\/system-agents\/([^/]+)\/route$/)) return updateSystemAgentRoute(request, env, session, RegExp.$1);
  if (method === 'POST' && match(path, /^\/api\/system-agents\/([^/]+)\/run$/)) return runSystemAgentRoute(env, session, RegExp.$1);
  if (method === 'POST' && match(path, /^\/api\/opportunities\/([^/]+)\/save$/)) return saveOpportunity(request, env, session, RegExp.$1);
  if (method === 'POST' && path === '/api/broadcasts') return createBroadcast(request, env, session);
  if (method === 'POST' && match(path, /^\/api\/broadcasts\/([^/]+)\/feedback$/)) return broadcastFeedback(request, env, session, RegExp.$1);
  if (method === 'POST' && path === '/api/tasks') return createTask(request, env, session);
  if (method === 'POST' && path === '/api/tasks/from-message') return createTaskFromMessage(request, env, session);
  if (method === 'PATCH' && match(path, /^\/api\/tasks\/([^/]+)$/)) return updateTask(request, env, session, RegExp.$1);
  if (method === 'POST' && path === '/api/agent-feedback') return agentFeedback(request, env, session);
  if (method === 'POST' && path === '/api/llm/proxy') return llmProxy(request, env, session);
  if (method === 'POST' && path === '/api/speech/transcribe') return speechTranscribe(request, env);
  if (method === 'GET' && path === '/api/admin/model-health') return modelHealth(env, session, url.searchParams.get('live') === '1');
  if (method === 'POST' && match(path, /^\/api\/admin\/registrations\/([^/]+)\/approve$/)) return approveRegistration(request, env, session, RegExp.$1);
  if (method === 'POST' && match(path, /^\/api\/admin\/registrations\/([^/]+)\/reject$/)) return rejectRegistration(env, session, RegExp.$1);

  return json({ error: 'not_found' }, 404);
}

function match(value, pattern) {
  return pattern.test(value);
}

async function readBody(request) {
  if (!request.headers.get('content-type')?.includes('application/json')) return {};
  return request.json().catch(() => ({}));
}

async function ensureStore(env) {
  if (!env.DB) return structuredClone(seedStore);
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'
  ).run();
  const row = await env.DB.prepare('SELECT value FROM app_state WHERE key = ?').bind(STORE_KEY).first();
  if (!row?.value) {
    const store = structuredClone(seedStore);
    await writeStore(env, store);
    return store;
  }
  const store = JSON.parse(row.value);
  return normalizeStore(store);
}

async function writeStore(env, store) {
  normalizeStore(store);
  if (!env.DB) return;
  await env.DB.prepare(
    'INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP'
  )
    .bind(STORE_KEY, JSON.stringify(store))
    .run();
}

function normalizeStore(store) {
  store.users ??= structuredClone(defaultUsers);
  store.agents ??= structuredClone(defaultAgents);
  store.systemAgents ??= structuredClone(seedStore.systemAgents);
  store.conversations ??= {};
  store.conversationArchives ??= {};
  store.savedOpportunities ??= {};
  store.generatedOpportunities ??= [];
  store.systemAgentOutputs ??= { internal: [], external: [], task: [], quote: [], customer: [] };
  for (const id of ['internal', 'external', 'task', 'quote', 'customer']) store.systemAgentOutputs[id] ??= [];
  store.tasks ??= [];
  store.quotes ??= [];
  store.customers ??= [];
  store.broadcasts ??= [];
  store.pendingRegistrations ??= [];
  store.agentFeedback ??= [];
  store.tenderScan ??= { seenIds: {}, runs: [] };
  store.usage ??= {};
  store.auditLog ??= [];

  for (const user of defaultUsers) {
    if (!store.users.some((item) => item.id === user.id)) store.users.push({ ...user });
    if (!store.agents[user.id]) store.agents[user.id] = { ...defaultAgents[user.id] };
    store.conversations[user.id] ??= [];
    store.savedOpportunities[user.id] ??= [];
    store.usage[user.id] ??= emptyUsage();
  }
  for (const [id, agent] of Object.entries(seedStore.systemAgents)) {
    store.systemAgents[id] ??= { ...agent };
  }
  return store;
}

async function login(request, env) {
  const { userId, password } = await readBody(request);
  const store = await ensureStore(env);
  const user = store.users.find((item) => item.id === String(userId || '').trim().toLowerCase());
  const pending = store.pendingRegistrations.find((item) => item.id === String(userId || '').trim().toLowerCase());
  if (!user && pending) return json({ error: 'registration_pending' }, 403);
  if (!user || !verifyPassword(user, password)) return json({ error: 'invalid_credentials' }, 401);
  if (user.active === false) return json({ error: 'user_suspended' }, 403);
  const permissions = effectivePermissions(user);
  const token = await signToken(env, {
    userId: user.id,
    role: user.role,
    name: user.name,
    businessRole: user.businessRole || 'tester',
    permissions,
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS
  });
  return json({ token, user: { id: user.id, name: user.name, role: user.role, businessRole: user.businessRole || 'tester', permissions } });
}

async function register(request, env) {
  const { name, userId, password, inviteCode } = await readBody(request);
  if ((env.INVITE_CODE || 'team-test') && inviteCode !== (env.INVITE_CODE || 'team-test')) {
    return json({ error: 'invalid_invite_code' }, 403);
  }
  const cleanId = String(userId || name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!cleanId || String(password || '').length < 8) return json({ error: 'invalid_registration' }, 400);
  const store = await ensureStore(env);
  if (store.users.some((item) => item.id === cleanId) || store.pendingRegistrations.some((item) => item.id === cleanId)) {
    return json({ error: 'user_exists' }, 409);
  }
  store.pendingRegistrations.unshift({
    id: cleanId,
    name: String(name || cleanId).trim(),
    password,
    requestedAt: new Date().toISOString(),
    approvalStatus: 'pending'
  });
  audit(store, cleanId, 'user.registration_requested', { userId: cleanId });
  await writeStore(env, store);
  return json({ ok: true, pending: true });
}

async function getState(env, session) {
  const store = await ensureStore(env);
  markBroadcastsRead(store, session);
  await writeStore(env, store);
  if (session.role === 'super_admin') {
    return json({ ...redactStore(store), workflowOwnerId: env.WORKFLOW_OWNER_ID || 'larry', workflowAgentsForAll: true });
  }
  return json({
    users: [{ id: session.userId, name: session.name, role: session.role }],
    agents: { [session.userId]: store.agents[session.userId] },
    conversations: { [session.userId]: store.conversations[session.userId] ?? [] },
    systemAgentOutputs: store.systemAgentOutputs,
    generatedOpportunities: store.generatedOpportunities,
    tasks: visibleTasks(store, session),
    quotes: visibleQuotes(store, session),
    customers: visibleCustomers(store, session),
    broadcasts: store.broadcasts.filter((item) => item.recipients.includes(session.userId)),
    savedOpportunities: { [session.userId]: store.savedOpportunities[session.userId] ?? [] },
    usage: { [session.userId]: store.usage[session.userId] ?? emptyUsage() },
    systemAgents: store.systemAgents,
    agentFeedback: store.agentFeedback.filter((item) => item.agentId === session.userId || item.createdBy === session.userId).slice(0, 30),
    workflowOwnerId: env.WORKFLOW_OWNER_ID || 'larry',
    workflowAgentsForAll: true
  });
}

async function agentChat(request, env, session, id) {
  if (session.role !== 'super_admin' && session.userId !== id) return json({ error: 'private_workspace' }, 403);
  const { message = '', attachments = [] } = await readBody(request);
  const store = await ensureStore(env);
  const agent = store.agents[id];
  if (!agent || agent.active === false) return json({ error: 'agent_inactive' }, 403);
  const user = store.users.find((item) => item.id === id) ?? { id, name: id };
  const prompt = buildPersonalAgentPrompt(store, agent, user, message, attachments);
  let reply;
  let llm = { simulated: true };
  try {
    const result = await callModel(env, agent.provider, agent.apiModel, [{ role: 'user', content: prompt }]);
    reply = result.reply;
    llm = result;
  } catch (error) {
    reply = fallbackAgentReply(message, user, attachments);
    llm.error = error.message;
  }

  const createdArtifacts = inferArtifactsFromMessage(message, id, session.userId);
  store.conversations[id] ??= [];
  store.conversations[id].push({ at: new Date().toISOString(), from: 'user', text: formatMessageWithAttachments(message, attachments), actorId: session.userId });
  store.conversations[id].push({ at: new Date().toISOString(), from: 'agent', text: reply });
  store.usage[id] = mergeUsage(store.usage[id], calculateUsage(message, reply));
  persistArtifacts(store, createdArtifacts);
  audit(store, session.userId, 'chat.recorded', { agentId: id, llm });
  await writeStore(env, store);

  return json({
    reply,
    conversation: store.conversations[id],
    usage: store.usage[id],
    llm,
    createdArtifacts,
    createdTasks: createdArtifacts.tasks,
    quotes: visibleQuotes(store, session),
    customers: visibleCustomers(store, session),
    generatedOpportunities: store.generatedOpportunities,
    systemAgentOutputs: store.systemAgentOutputs
  });
}

async function clearConversation(env, session, id) {
  if (session.role !== 'super_admin' && session.userId !== id) return json({ error: 'private_workspace' }, 403);
  const store = await ensureStore(env);
  store.conversationArchives[id] ??= [];
  if (store.conversations[id]?.length) {
    store.conversationArchives[id].unshift({ id: `archive-${Date.now()}`, at: new Date().toISOString(), messages: store.conversations[id] });
  }
  store.conversations[id] = [];
  audit(store, session.userId, 'conversation.cleared', { agentId: id });
  await writeStore(env, store);
  return json({ conversation: [] });
}

async function updateAgentRoute(request, env, session, id) {
  if (session.role !== 'super_admin') return json({ error: 'jamie_only' }, 403);
  const { modelTier, provider, apiModel } = await readBody(request);
  const store = await ensureStore(env);
  if (!store.agents[id]) return json({ error: 'agent_not_found' }, 404);
  Object.assign(store.agents[id], compact({ modelTier, provider, apiModel }));
  audit(store, session.userId, 'agent.route.updated', { agentId: id, modelTier, provider, apiModel });
  await writeStore(env, store);
  return json({ agent: store.agents[id] });
}

async function updateSystemAgentRoute(request, env, session, id) {
  if (!canUseSystemAgentRoute(session, id, env)) return json({ error: 'forbidden' }, 403);
  const { provider, apiModel } = await readBody(request);
  const store = await ensureStore(env);
  if (!store.systemAgents[id]) return json({ error: 'system_agent_not_found' }, 404);
  Object.assign(store.systemAgents[id], compact({ provider, apiModel }));
  audit(store, session.userId, 'system-agent.route.updated', { id, provider, apiModel });
  await writeStore(env, store);
  return json({ systemAgent: store.systemAgents[id] });
}

async function runSystemAgentRoute(env, session, id) {
  if (id === 'internal' && session.role !== 'super_admin') return json({ error: 'jamie_only' }, 403);
  if (WORKFLOW_SYSTEM_AGENTS.has(id) && !canUseWorkflowAgent(session, env)) return json({ error: 'workflow_agent_forbidden' }, 403);
  const store = await ensureStore(env);
  const output = await buildSystemAgentOutput(env, store, id);
  store.systemAgentOutputs[id] ??= [];
  store.systemAgentOutputs[id].unshift(output);
  store.systemAgentOutputs[id] = store.systemAgentOutputs[id].slice(0, 12);
  if (id === 'external' && output.opportunity) upsertById(store.generatedOpportunities, output.opportunity);
  const createdTasks = persistSystemAgentArtifacts(store, id, output, session.userId);
  const broadcast = createSystemAgentBroadcast(store, session.userId, output);
  audit(store, session.userId, 'system-agent.run', { id, broadcastId: broadcast?.id });
  await writeStore(env, store);
  return json({ output, llm: output.llm ?? { simulated: true }, systemAgent: store.systemAgents[id], broadcast, createdTasks, quotes: visibleQuotes(store, session), customers: visibleCustomers(store, session) });
}

async function saveOpportunity(request, env, session, id) {
  const store = await ensureStore(env);
  const body = await readBody(request);
  const opportunity = body.opportunity || store.generatedOpportunities.find((item) => item.id === id) || { id, title: id };
  store.savedOpportunities[session.userId] ??= [];
  if (!store.savedOpportunities[session.userId].includes(id)) store.savedOpportunities[session.userId].push(id);
  const artifacts = materializeOpportunity(store, opportunity, session.userId);
  audit(store, session.userId, 'opportunity.saved', { id });
  await writeStore(env, store);
  return json({
    saved: store.savedOpportunities[session.userId],
    tasks: visibleTasks(store, session),
    customers: visibleCustomers(store, session),
    quotes: visibleQuotes(store, session),
    generatedOpportunities: store.generatedOpportunities,
    systemAgentOutputs: store.systemAgentOutputs,
    createdArtifacts: artifacts
  });
}

async function createBroadcast(request, env, session) {
  if (session.role !== 'super_admin') return json({ error: 'jamie_only' }, 403);
  const { type = '工作计划', title = '', content = '', recipients = [] } = await readBody(request);
  const store = await ensureStore(env);
  const allowed = new Set(store.users.filter((item) => item.role !== 'super_admin' && item.active !== false).map((item) => item.id));
  const cleanRecipients = recipients.filter((id) => allowed.has(id));
  if (!title.trim() || !content.trim() || !cleanRecipients.length) return json({ error: 'invalid_broadcast' }, 400);
  const broadcast = {
    id: `bc-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    type,
    title: title.trim(),
    content: content.trim(),
    recipients: cleanRecipients,
    feedback: {},
    readBy: {},
    createdBy: session.userId,
    createdAt: new Date().toISOString()
  };
  store.broadcasts.unshift(broadcast);
  audit(store, session.userId, 'broadcast.created', { broadcastId: broadcast.id });
  await writeStore(env, store);
  return json({ broadcast, broadcasts: store.broadcasts });
}

async function broadcastFeedback(request, env, session, id) {
  const { status = '收到', note = '', discussWith = [] } = await readBody(request);
  const store = await ensureStore(env);
  const broadcast = store.broadcasts.find((item) => item.id === id);
  if (!broadcast) return json({ error: 'broadcast_not_found' }, 404);
  if (!broadcast.recipients.includes(session.userId) && session.role !== 'super_admin') return json({ error: 'broadcast_forbidden' }, 403);
  broadcast.feedback[session.userId] = { status, note, discussWith, at: new Date().toISOString() };
  if (status === '需要讨论' && discussWith.length) {
    store.broadcasts.unshift({
      id: `bc-discuss-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
      type: '讨论邀请',
      title: `关于「${broadcast.title}」的讨论邀请`,
      content: note || `${session.name} 希望就这条广播进一步讨论。`,
      recipients: discussWith,
      feedback: {},
      readBy: {},
      createdBy: session.userId,
      createdAt: new Date().toISOString()
    });
  }
  audit(store, session.userId, 'broadcast.feedback', { id, status });
  await writeStore(env, store);
  return json({ broadcast, broadcasts: store.broadcasts, tasks: visibleTasks(store, session) });
}

async function createTask(request, env, session) {
  const store = await ensureStore(env);
  const task = normalizeTask(await readBody(request), session.userId);
  store.tasks.unshift(task);
  audit(store, session.userId, 'task.created', { taskId: task.id });
  await writeStore(env, store);
  return json({ task, tasks: visibleTasks(store, session) }, 201);
}

async function createTaskFromMessage(request, env, session) {
  const { ownerId = session.userId, text = '', source = '个人助理对话' } = await readBody(request);
  if (session.role !== 'super_admin' && session.userId !== ownerId) return json({ error: 'private_workspace' }, 403);
  const store = await ensureStore(env);
  const task = normalizeTask({ title: inferTaskTitle(text), owner: ownerId, source, next: String(text).slice(0, 180), priority: 'medium' }, session.userId);
  store.tasks.unshift(task);
  audit(store, session.userId, 'task.created_from_message', { taskId: task.id });
  await writeStore(env, store);
  return json({ task, tasks: visibleTasks(store, session) }, 201);
}

async function updateTask(request, env, session, id) {
  const store = await ensureStore(env);
  const task = store.tasks.find((item) => item.id === id);
  if (!task) return json({ error: 'task_not_found' }, 404);
  if (!canEditTask(session, task, env)) return json({ error: 'task_forbidden' }, 403);
  Object.assign(task, await readBody(request), { updatedAt: new Date().toISOString(), updatedBy: session.userId });
  if (task.status === 'done' || task.status === 'closed') {
    store.systemAgentOutputs.internal.unshift({
      id: `task-review-${Date.now()}`,
      title: `任务复盘：${task.title}`,
      type: '任务复盘',
      summary: task.result || task.next || '任务已关闭，需要补充结果评估。',
      createdAt: new Date().toISOString()
    });
  }
  audit(store, session.userId, 'task.updated', { taskId: id, status: task.status });
  await writeStore(env, store);
  return json({ task, tasks: visibleTasks(store, session), systemAgentOutputs: store.systemAgentOutputs });
}

async function agentFeedback(request, env, session) {
  const { agentId = session.userId, messageText = '', rating = 'useful', note = '' } = await readBody(request);
  if (session.role !== 'super_admin' && agentId !== session.userId) return json({ error: 'private_feedback' }, 403);
  const store = await ensureStore(env);
  const feedback = { id: `fb-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`, agentId, messageText, rating, note, createdBy: session.userId, createdAt: new Date().toISOString() };
  store.agentFeedback.unshift(feedback);
  store.agentFeedback = store.agentFeedback.slice(0, 300);
  store.systemAgentOutputs.internal.unshift({
    id: `agent-feedback-${feedback.id}`,
    title: `${agentId}_AI 改进反馈`,
    type: 'Agent 训练',
    summary: `${rating}: ${note || messageText.slice(0, 120)}`,
    createdAt: new Date().toISOString()
  });
  await writeStore(env, store);
  return json({ feedback, agentFeedback: store.agentFeedback, systemAgentOutputs: store.systemAgentOutputs });
}

async function llmProxy(request, env) {
  const { provider, apiModel, messages = [] } = await readBody(request);
  try {
    const result = await callModel(env, provider, apiModel, messages);
    return json({ provider: result.backend, apiModel: result.model, keySlot: result.keySlot, reply: result.reply, usage: calculateUsage(messages.map((m) => m.content).join('\n'), result.reply), simulated: false });
  } catch (error) {
    const reply = `模型暂时不可用：${error.message}。系统已保留这次请求，可稍后重试。`;
    return json({ provider, apiModel, reply, usage: calculateUsage('', reply), simulated: true });
  }
}

async function speechTranscribe(request, env) {
  const apiKey = String(env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return json({ error: 'openai_key_missing', message: 'OPENAI_API_KEY 未配置，无法进行后端语音转文字。' }, 503);
  const { audio = {} } = await readBody(request);
  const dataUrl = typeof audio.dataUrl === 'string' ? audio.dataUrl : '';
  const parsed = dataUrlToBlob(dataUrl, audio.type || 'audio/webm');
  if (!parsed) return json({ error: 'audio_required', message: '缺少录音数据。' }, 400);
  if (parsed.blob.size > 10 * 1024 * 1024) return json({ error: 'audio_too_large', message: '单段语音过长，请控制在 90 秒以内。' }, 413);
  const form = new FormData();
  form.append('model', env.OPENAI_TRANSCRIPTION_MODEL || 'whisper-1');
  form.append('language', 'zh');
  form.append('file', parsed.blob, audio.name || `voice-${Date.now()}.webm`);
  const response = await fetch(env.OPENAI_TRANSCRIPTION_URL || OPENAI_TRANSCRIPTION_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return json({ error: 'transcription_failed', message: payload.error?.message || `OpenAI transcription HTTP ${response.status}` }, 502);
  return json({ text: String(payload.text ?? '').trim() });
}

async function modelHealth(env, session, live) {
  if (session.role !== 'super_admin') return json({ error: 'jamie_only' }, 403);
  const openRouterConfigured = Boolean(env.OPENROUTER_API_KEY || env.OPENROUTER_BACKUP_API_KEY);
  const openAIConfigured = Boolean(env.OPENAI_API_KEY);
  const anthropicConfigured = Boolean(env.ANTHROPIC_API_KEY);
  return json({
    ok: true,
    live,
    keys: {
      openRouterConfigured,
      primaryOpenRouterConfigured: Boolean(env.OPENROUTER_API_KEY),
      backupOpenRouterConfigured: Boolean(env.OPENROUTER_BACKUP_API_KEY),
      openAIConfigured,
      anthropicConfigured
    },
    modelChecks: {},
    message: live ? 'Cloudflare Worker 已检查 key 配置；真模型请求会在各 Agent 调用时执行。' : '路由格式已检查；加 ?live=1 可查看 key 配置。'
  });
}

async function approveRegistration(request, env, session, id) {
  if (session.role !== 'super_admin') return json({ error: 'jamie_only' }, 403);
  const body = await readBody(request);
  const store = await ensureStore(env);
  const index = store.pendingRegistrations.findIndex((item) => item.id === id);
  if (index < 0) return json({ error: 'registration_not_found' }, 404);
  const pending = store.pendingRegistrations[index];
  const user = {
    id: pending.id,
    name: body.name || pending.name,
    role: 'coworker',
    password: pending.password,
    active: true,
    businessRole: body.businessRole || 'tester',
    permissions: body.permissions || { agents: true, customers: true, quote: true, tasks: true, insight: false },
    approvedBy: session.userId,
    approvedAt: new Date().toISOString()
  };
  store.users.push(user);
  store.agents[user.id] = { id: user.id, name: `${user.name}_AI`, ownerId: user.id, modelTier: 'lite', provider: 'openrouter', apiModel: 'openrouter/openai/gpt-4.1-mini', active: true };
  store.conversations[user.id] = [];
  store.savedOpportunities[user.id] = [];
  store.usage[user.id] = emptyUsage();
  store.pendingRegistrations.splice(index, 1);
  await writeStore(env, store);
  return json({ user: redactUser(user), pendingRegistrations: store.pendingRegistrations });
}

async function rejectRegistration(env, session, id) {
  if (session.role !== 'super_admin') return json({ error: 'jamie_only' }, 403);
  const store = await ensureStore(env);
  store.pendingRegistrations = store.pendingRegistrations.filter((item) => item.id !== id);
  await writeStore(env, store);
  return json({ pendingRegistrations: store.pendingRegistrations });
}

async function runScheduledExternalScan(env) {
  const store = await ensureStore(env);
  const output = await buildSystemAgentOutput(env, store, 'external');
  store.systemAgentOutputs.external.unshift(output);
  if (output.opportunity) upsertById(store.generatedOpportunities, output.opportunity);
  store.tenderScan.runs.unshift({ id: `cron-${Date.now()}`, at: new Date().toISOString(), found: output.opportunity ? 1 : 0 });
  store.tenderScan.runs = store.tenderScan.runs.slice(0, 30);
  await writeStore(env, store);
}

async function buildSystemAgentOutput(env, store, id) {
  if (id === 'external') {
    const opportunity = await scanExternalOpportunity(env, store);
    return {
      id: `external-${Date.now()}`,
      type: '外部机会',
      title: opportunity.title,
      summary: opportunity.match,
      action: opportunity.next,
      opportunity,
      createdAt: new Date().toISOString()
    };
  }
  if (id === 'customer') {
    return {
      id: `customer-${Date.now()}`,
      type: '客户管理',
      title: '客户阶段检查',
      summary: `当前系统记录 ${store.customers.length} 个客户，建议优先推进待报价和有意向客户。`,
      action: '逐一补齐最近沟通、下一步任务、关联商机和报价状态。',
      createdAt: new Date().toISOString()
    };
  }
  if (id === 'task') {
    const todo = store.tasks.filter((item) => item.status !== 'done' && item.status !== 'closed');
    return {
      id: `task-${Date.now()}`,
      type: '任务提取',
      title: '任务看板巡检',
      summary: `当前有 ${todo.length} 个待推进任务，建议先处理高优先级和已逾期事项。`,
      action: '要求负责人反馈进展、阻塞点和下一步时间。',
      createdAt: new Date().toISOString()
    };
  }
  if (id === 'quote') {
    return {
      id: `quote-${Date.now()}`,
      type: '报价方案',
      title: '报价依据补齐提醒',
      summary: '报价前需要补齐设备/服务范围、技术参数、成本构成、历史参考和风险点。',
      action: '请负责人上传参数或客户需求，报价 Agent 再生成报价区间。',
      createdAt: new Date().toISOString()
    };
  }
  return {
    id: `internal-${Date.now()}`,
    type: '内部沉淀',
    title: '组织经验沉淀',
    summary: '从对话、任务、客户和报价结果中沉淀可复用经验。',
    action: '优先整理高频客户问题、设备参数、报价风险和任务复盘。',
    createdAt: new Date().toISOString()
  };
}

async function scanExternalOpportunity(env, store) {
  const keywords = ['熔炼炉', '真空熔炼', '悬浮熔炼', '新材料', '金属材料', '高熵合金'];
  const keyword = keywords[Math.floor(Date.now() / 1800000) % keywords.length];
  const sourceUrl = `https://zb.yfb.qianlima.com/yfbsemsite/mesinfo/zbpglist`;
  let title = `【待核实线索】近期与${keyword}相关的招标/采购信息`;
  let company = '待核实采购单位';
  let snippet = '外部机会 Agent 会优先从千里马、中国招标投标公共服务平台等来源获取相关信息。';
  try {
    const response = await fetch(sourceUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': 'EnterpriseOS-Cloudflare-Opportunity-Agent/1.0'
      },
      body: new URLSearchParams({ pageNo: '1', pageSize: '10', searchword: keyword, kw: keyword, infoType: '1' })
    });
    const html = await response.text();
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const found = text.match(/([\u4e00-\u9fa5A-Za-z0-9（）()·\-]{6,80}(熔炼|真空|材料|合金|炉)[\u4e00-\u9fa5A-Za-z0-9（）()·\-]{0,80})/);
    if (found?.[1]) {
      title = found[1].slice(0, 90);
      snippet = text.slice(Math.max(0, found.index - 100), found.index + 260);
    }
    const org = snippet.match(/(采购人|招标人|采购单位|建设单位)[:：\s]*([\u4e00-\u9fa5A-Za-z0-9（）()·\-]{4,40})/);
    if (org?.[2]) company = org[2];
  } catch {
    // Public tender sites can block edge requests. Keep a useful manual lead instead of returning nothing.
  }
  const id = `tender-${simpleHash(`${title}-${keyword}`)}`;
  return {
    id,
    type: '招投标 / 外部线索',
    title,
    source: '全国招标采购信息平台 / 中国招标投标公共服务平台',
    company,
    date: new Date().toISOString().slice(0, 10),
    score: scoreOpportunity(`${title} ${snippet}`),
    match: `关键词「${keyword}」与公司悬浮真空熔炼设备、新型金属材料研发和材料试制业务相关。${snippet.slice(0, 120)}`,
    next: '先核实招标单位、预算、技术参数和截止时间；匹配后转客户管理和任务看板。',
    owner: recommendOwner(`${title} ${snippet}`),
    url: sourceUrl
  };
}

function materializeOpportunity(store, opportunity, ownerId) {
  upsertById(store.generatedOpportunities, opportunity);
  const customerName = opportunity.company && opportunity.company !== '待核实采购单位' ? opportunity.company : opportunity.title.replace(/[【】\[\]]/g, '').slice(0, 18);
  const customer = {
    id: `customer-${simpleHash(customerName)}`,
    name: customerName,
    type: opportunity.type || '外部线索',
    stage: '未接触',
    owner: ownerId,
    contact: '待确认',
    phone: '',
    last: '刚收藏',
    next: opportunity.next || '核实需求真实性、预算和采购窗口。',
    linkedOpportunityId: opportunity.id
  };
  upsertCustomer(store, customer);
  const task = normalizeTask({
    title: `核实商机：${opportunity.title}`,
    owner: ownerId,
    tag: '商机跟进',
    priority: opportunity.score >= 80 ? 'high' : 'medium',
    source: '商机收藏',
    next: opportunity.next,
    linkedOpportunityId: opportunity.id,
    linkedCustomerId: customer.id
  }, ownerId);
  store.tasks.unshift(task);
  const artifacts = { customers: [customer], tasks: [task], quotes: [], opportunities: [opportunity], knowledge: [] };
  return artifacts;
}

function persistSystemAgentArtifacts(store, id, output, actorId) {
  if (id !== 'task' && id !== 'external') return [];
  const task = normalizeTask({
    title: id === 'external' ? `跟进外部线索：${output.title}` : output.title,
    owner: output.opportunity?.owner || actorId,
    tag: id === 'external' ? '商机跟进' : '工作计划',
    source: output.type,
    priority: output.opportunity?.score >= 80 ? 'high' : 'medium',
    next: output.action || output.summary
  }, actorId);
  store.tasks.unshift(task);
  return [task];
}

function createSystemAgentBroadcast(store, actorId, output) {
  if (!output.title) return null;
  const recipients = store.users.filter((user) => user.role !== 'super_admin' && user.active !== false).map((user) => user.id);
  const broadcast = {
    id: `bc-system-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
    type: output.type || '系统提示',
    title: output.title,
    content: `${output.summary || ''}\n${output.action || ''}`.trim(),
    recipients,
    feedback: {},
    readBy: {},
    createdBy: actorId,
    createdAt: new Date().toISOString()
  };
  store.broadcasts.unshift(broadcast);
  return broadcast;
}

function inferArtifactsFromMessage(message, ownerId, actorId) {
  const text = String(message || '');
  const tasks = [];
  const customers = [];
  const quotes = [];
  const knowledge = [];
  if (/任务|跟进|明天|下周|拜访|确认|整理|准备|生成任务/.test(text)) {
    tasks.push(normalizeTask({ title: inferTaskTitle(text), owner: ownerId, source: '个人助理对话', next: text.slice(0, 180), priority: /急|今天|报价|客户/.test(text) ? 'high' : 'medium' }, actorId));
  }
  if (/客户|拜访|联系人|采购|招标|赛迈特|研究院|公司|实验室/.test(text)) {
    const name = inferCustomerName(text);
    customers.push({ id: `customer-${simpleHash(name)}`, name, type: '对话提取', stage: /已经|拜访了|沟通过/.test(text) ? '已接触' : '未接触', owner: ownerId, contact: '待补充', phone: '', last: '刚刚', next: '补齐客户需求、联系人、预算和下一步动作。' });
  }
  if (/报价|价格|预算|方案/.test(text)) {
    quotes.push({ id: `quote-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`, title: `报价准备：${inferTaskTitle(text)}`, owner: ownerId, collaborators: [], status: 'draft', scope: '待补齐设备/服务范围、技术参数和成本构成。', risk: '参数不足时不能形成正式报价。', createdAt: new Date().toISOString(), createdBy: actorId });
  }
  if (/经验|复盘|参数|工艺|材料|设备/.test(text)) {
    knowledge.push({ id: `knowledge-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`, title: inferTaskTitle(text), type: '岗位经验', summary: text.slice(0, 220), owner: ownerId, createdAt: new Date().toISOString() });
  }
  return { tasks, customers, quotes, opportunities: [], knowledge };
}

function persistArtifacts(store, artifacts) {
  for (const task of artifacts.tasks ?? []) store.tasks.unshift(task);
  for (const customer of artifacts.customers ?? []) upsertCustomer(store, customer);
  for (const quote of artifacts.quotes ?? []) store.quotes.unshift(quote);
  for (const opportunity of artifacts.opportunities ?? []) upsertById(store.generatedOpportunities, opportunity);
  for (const item of artifacts.knowledge ?? []) {
    store.systemAgentOutputs.internal.unshift({ id: item.id, type: item.type, title: item.title, summary: item.summary, createdAt: item.createdAt });
  }
  store.tasks = store.tasks.slice(0, 200);
  store.quotes = store.quotes.slice(0, 80);
  store.customers = store.customers.slice(0, 120);
  store.systemAgentOutputs.internal = store.systemAgentOutputs.internal.slice(0, 30);
}

async function callModel(env, provider = 'openrouter', apiModel = '', messages = []) {
  const backend = backendFor(provider, apiModel);
  if (backend === 'anthropic' && String(env.ANTHROPIC_API_KEY || '').trim()) return callAnthropic(env, apiModel, messages);
  if (backend === 'openai' && String(env.OPENAI_API_KEY || '').trim()) return callOpenAI(env, apiModel, messages);
  return callOpenRouter(env, normalizeOpenRouterModel(backend, apiModel), messages);
}

async function callOpenRouter(env, model, messages) {
  const keys = [
    env.OPENROUTER_API_KEY && ['primary', String(env.OPENROUTER_API_KEY).trim()],
    env.OPENROUTER_BACKUP_API_KEY && ['backup', String(env.OPENROUTER_BACKUP_API_KEY).trim()]
  ].filter((item) => item?.[1]);
  if (!keys.length) throw new Error('OPENROUTER_API_KEY / OPENROUTER_BACKUP_API_KEY missing');
  let lastError;
  for (const [slot, key] of keys) {
    try {
      const response = await fetch(OPENROUTER_BASE_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${key}`,
          'HTTP-Referer': env.OPENROUTER_SITE_URL || 'https://timeconnector.net',
          'X-Title': env.OPENROUTER_APP_NAME || 'EnterpriseOS'
        },
        body: JSON.stringify({ model, messages, temperature: 0.4, max_tokens: 900 })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || `OpenRouter HTTP ${response.status}`);
      return { backend: 'openrouter', model, keySlot: slot, reply: payload.choices?.[0]?.message?.content ?? '' };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function callAnthropic(env, model, messages) {
  const apiKey = String(env.ANTHROPIC_API_KEY || '').trim();
  const response = await fetch(env.ANTHROPIC_BASE_URL || ANTHROPIC_BASE_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': env.ANTHROPIC_VERSION || '2023-06-01'
    },
    body: JSON.stringify({ model: normalizeAnthropicModel(model), messages, temperature: 0.4, max_tokens: 900 })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `Anthropic HTTP ${response.status}`);
  return { backend: 'anthropic', model: normalizeAnthropicModel(model), keySlot: 'anthropic-direct', reply: payload.content?.map((item) => item.text).filter(Boolean).join('\n') ?? '' };
}

async function callOpenAI(env, model, messages) {
  const apiKey = String(env.OPENAI_API_KEY || '').trim();
  const response = await fetch(env.OPENAI_BASE_URL || OPENAI_CHAT_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: normalizeOpenAIModel(model), messages, temperature: 0.4, max_tokens: 900 })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || `OpenAI HTTP ${response.status}`);
  return { backend: 'openai', model: normalizeOpenAIModel(model), keySlot: 'openai-direct', reply: payload.choices?.[0]?.message?.content ?? '' };
}

function backendFor(provider, model) {
  const cleanProvider = String(provider || '').toLowerCase();
  if (cleanProvider === 'openrouter') return 'openrouter';
  if (cleanProvider === 'openai' || cleanProvider === 'gpt') return 'openai';
  if (cleanProvider === 'claude' || cleanProvider === 'anthropic') return 'anthropic';
  const raw = String(model || '').toLowerCase();
  if (raw.startsWith('openrouter/')) return 'openrouter';
  if (raw.startsWith('openai/') || raw.startsWith('gpt-')) return 'openai';
  if (raw.startsWith('anthropic/') || raw.includes('claude')) return 'anthropic';
  return 'openrouter';
}

function normalizeOpenRouterModel(backend, model) {
  const clean = String(model || '').replace(/^(openrouter\/)+/, '');
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
    'gpt-4o-mini': 'openai/gpt-4o-mini'
  };
  if (modelMap[clean]) return modelMap[clean];
  if (clean.includes('/')) return clean;
  if (backend === 'anthropic') return `anthropic/${clean || 'claude-3.5-haiku'}`;
  if (backend === 'openai') return `openai/${normalizeOpenAIModel(clean)}`;
  return clean || 'openai/gpt-4.1-mini';
}

function normalizeAnthropicModel(model = '') {
  if (model.includes('opus')) return 'claude-opus-4-20250514';
  if (model.includes('sonnet')) return 'claude-sonnet-4-20250514';
  if (model.includes('haiku')) return 'claude-3-5-haiku-20241022';
  return model || 'claude-sonnet-4-20250514';
}

function normalizeOpenAIModel(model = '') {
  return model.replace(/^openrouter\/openai\//, '').replace(/^openai\//, '') || 'gpt-4.1-mini';
}

async function signToken(env, payload) {
  const body = base64url(JSON.stringify(payload));
  const signature = await hmac(env.SESSION_SECRET || 'dev-enterprise-os-secret', body);
  return `${body}.${signature}`;
}

async function requireSession(request, env) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const session = await verifyToken(env, token);
  return session || json({ error: 'unauthorized' }, 401);
}

async function verifyToken(env, token) {
  const [body, signature] = String(token || '').split('.');
  if (!body || !signature) return null;
  const expected = await hmac(env.SESSION_SECRET || 'dev-enterprise-os-secret', body);
  if (expected !== signature) return null;
  const session = JSON.parse(new TextDecoder().decode(base64urlToBytes(body)));
  if (session.exp && Date.now() > session.exp) return null;
  return session;
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return bytesToBase64url(new Uint8Array(signature));
}

function verifyPassword(user, password) {
  if (!password) return false;
  if (user.password) return user.password === password;
  return password === 'demo' || (user.id === 'jamie' && password === 'jamie-demo');
}

function effectivePermissions(user) {
  if (user.role === 'super_admin') return { agents: true, customers: true, quote: true, tasks: true, insight: true };
  return { agents: true, customers: true, quote: true, tasks: true, insight: false, ...(user.permissions ?? {}) };
}

function canUseWorkflowAgent(session, env) {
  return session.role === 'super_admin' || session.userId === (env.WORKFLOW_OWNER_ID || 'larry') || session.permissions?.tasks !== false;
}

function canUseSystemAgentRoute(session, id, env) {
  if (session.role === 'super_admin') return true;
  return WORKFLOW_SYSTEM_AGENTS.has(id) && session.userId === (env.WORKFLOW_OWNER_ID || 'larry');
}

function canEditTask(session, task, env) {
  return session.role === 'super_admin' || session.userId === (env.WORKFLOW_OWNER_ID || 'larry') || task.owner === session.userId || (task.collaborators ?? []).includes(session.userId);
}

function visibleTasks(store, session) {
  if (session.role === 'super_admin' || session.userId === 'larry') return store.tasks;
  return store.tasks.filter((task) => task.owner === session.userId || (task.collaborators ?? []).includes(session.userId));
}

function visibleQuotes(store, session) {
  if (session.role === 'super_admin' || session.userId === 'larry') return store.quotes;
  return store.quotes.filter((quote) => quote.owner === session.userId || (quote.collaborators ?? []).includes(session.userId));
}

function visibleCustomers(store, session) {
  if (session.role === 'super_admin' || session.userId === 'larry') return store.customers;
  return store.customers.filter((customer) => customer.owner === session.userId || (customer.collaborators ?? []).includes(session.userId));
}

function normalizeTask(input, actorId) {
  return {
    id: input.id || `task-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
    title: String(input.title || '未命名任务').trim(),
    tag: input.tag || '工作计划',
    owner: input.owner || actorId,
    collaborators: input.collaborators || [],
    due: input.due || '待定',
    priority: input.priority || 'medium',
    status: input.status || 'todo',
    source: input.source || '手动创建',
    next: input.next || '',
    result: input.result || '',
    linkedCustomerId: input.linkedCustomerId,
    linkedOpportunityId: input.linkedOpportunityId,
    linkedQuoteId: input.linkedQuoteId,
    createdAt: input.createdAt || new Date().toISOString(),
    createdBy: input.createdBy || actorId
  };
}

function buildPersonalAgentPrompt(store, agent, user, message, attachments) {
  const recent = (store.conversations[user.id] ?? []).slice(-8).map((item) => `${item.from}: ${item.text}`).join('\n');
  const customers = visibleCustomers(store, { userId: user.id, role: user.role }).map((item) => `${item.name}/${item.stage}/${item.next}`).join('\n');
  const tasks = visibleTasks(store, { userId: user.id, role: user.role }).slice(0, 8).map((item) => `${item.title}/${item.status}/${item.next}`).join('\n');
  const attachmentText = attachments?.length ? `\n上传附件：\n${attachments.map((file) => `${file.name}: ${file.text || file.parseNote || file.type || ''}`).join('\n')}` : '';
  return `你是 ${user.name} 的企业OS个人助理 ${agent.name}。公司专注悬浮真空熔炼设备、新型金属材料研发、材料试制和相关设备/服务报价。

你的任务：帮助同事整理客户需求、下一步任务、报价准备、风险和商机。回答要具体、短、能推进工作。不要假装已经查看不能读取的文件；如果附件有文字，就基于文字分析。

最近对话：
${recent || '暂无'}

相关客户：
${customers || '暂无'}

相关任务：
${tasks || '暂无'}

用户这次说：
${message}${attachmentText}`;
}

function fallbackAgentReply(message, user, attachments) {
  const text = String(message || '');
  if (attachments?.length) return `我已收到附件。请优先确认：1. 客户或项目名称；2. 设备/服务范围；3. 关键参数；4. 预算和截止时间；5. 需要我生成任务、客户记录还是报价依据。`;
  if (/客户|拜访|采购|招标/.test(text)) return `我先把这条信息按“客户需求、下一步任务、是否需要报价”来整理。建议补齐客户名称、联系人、预算、技术参数和截止时间，然后我可以生成跟进任务。`;
  if (/报价|价格|预算/.test(text)) return `这条可以进入报价准备。需要补齐设备/服务范围、技术参数、成本构成、历史参考、风险点和可谈判空间。`;
  if (/任务|跟进|明天|下周/.test(text)) return `我可以把它生成任务。请确认负责人、截止时间、关联客户/商机，以及完成后如何评估结果。`;
  return `${user.name}，我已记录。为了让它进入系统闭环，你可以补一句：这是客户、任务、报价、商机还是经验沉淀。`;
}

function fallbackTenderKeywords() {
  return ['熔炼炉', '真空熔炼', '悬浮熔炼', '冷坩埚', '高熵合金', '金属材料', '新材料'];
}

function markBroadcastsRead(store, session) {
  if (session.role === 'super_admin') return;
  for (const broadcast of store.broadcasts) {
    if (broadcast.recipients.includes(session.userId)) {
      broadcast.readBy ??= {};
      broadcast.readBy[session.userId] ??= { at: new Date().toISOString() };
    }
  }
}

function redactStore(store) {
  return {
    ...store,
    users: store.users.map(redactUser),
    pendingRegistrations: store.pendingRegistrations.map(({ password, ...item }) => item)
  };
}

function redactUser(user) {
  const { password, passwordHash, ...safe } = user;
  return safe;
}

function emptyUsage() {
  return { calls: 0, input: 0, output: 0, cost: 0 };
}

function mergeUsage(prev = emptyUsage(), usage = emptyUsage()) {
  return {
    calls: (prev.calls ?? 0) + (usage.calls ?? 1),
    input: (prev.input ?? 0) + (usage.input ?? 0),
    output: (prev.output ?? 0) + (usage.output ?? 0),
    cost: (prev.cost ?? 0) + (usage.cost ?? 0)
  };
}

function calculateUsage(input = '', output = '') {
  const inputTokens = Math.ceil(String(input).length / 2);
  const outputTokens = Math.ceil(String(output).length / 2);
  return { calls: 1, input: inputTokens, output: outputTokens, cost: Number(((inputTokens / 1000) * 0.003 + (outputTokens / 1000) * 0.015).toFixed(4)) };
}

function formatMessageWithAttachments(message, attachments) {
  const files = attachments?.length
    ? `\n\n[上传附件]\n${attachments.map((file) => `- ${file.name}（${file.type || '未知类型'}，${Math.ceil((file.size || 0) / 1024)} KB）`).join('\n')}`
    : '';
  return `${message}${files}`;
}

function upsertCustomer(store, customer) {
  const existing = store.customers.find((item) => item.id === customer.id || item.name === customer.name);
  if (existing) Object.assign(existing, compact(customer));
  else store.customers.unshift(customer);
}

function upsertById(list, item) {
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index >= 0) list[index] = { ...list[index], ...item };
  else list.unshift(item);
}

function inferTaskTitle(text) {
  return String(text || '').replace(/\s+/g, ' ').slice(0, 28) || '跟进事项';
}

function inferCustomerName(text) {
  const match = String(text).match(/(?:客户|拜访|联系|招标|采购)?([\u4e00-\u9fa5A-Za-z0-9（）()·]{3,24}(?:公司|研究院|实验室|大学|学院|厂|中心|集团|单位|赛迈特))/);
  return match?.[1] || '待确认客户';
}

function scoreOpportunity(text) {
  let score = 50;
  for (const term of ['悬浮熔炼', '真空熔炼', '熔炼炉', '冷坩埚', '高熵合金', '新材料', '金属材料', '靶材']) {
    if (text.includes(term)) score += 6;
  }
  if (/招标|采购|急需|预算|截止/.test(text)) score += 10;
  return Math.min(96, score);
}

function recommendOwner(text) {
  if (/材料|合金|靶材|试制/.test(text)) return 'guihua';
  if (/参数|设备|工艺|真空|熔炼/.test(text)) return 'gu';
  return 'larry';
}

function simpleHash(value) {
  let hash = 0;
  for (const char of String(value)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash.toString(36);
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== ''));
}

function audit(store, actor, action, detail) {
  store.auditLog.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), actor, action, detail });
  store.auditLog = store.auditLog.slice(0, 500);
}

function dataUrlToBlob(dataUrl, fallbackMime) {
  const match = /^data:([^;,]+)?;base64,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const bytes = base64ToBytes(match[2]);
  return { blob: new Blob([bytes], { type: match[1] || fallbackMime }), mime: match[1] || fallbackMime };
}

function base64url(value) {
  return bytesToBase64url(new TextEncoder().encode(value));
}

function bytesToBase64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64urlToBytes(value) {
  return base64ToBytes(value.replace(/-/g, '+').replace(/_/g, '/'));
}

function base64ToBytes(value) {
  const padded = value.padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function cors(response, request) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get('origin') || '*';
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}
