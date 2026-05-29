import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Bot,
  Bookmark,
  BookmarkCheck,
  Brain,
  ChartNoAxesColumnIncreasing,
  ClipboardList,
  CircleDollarSign,
  Cpu,
  FileText,
  Layers3,
  Mic,
  Newspaper,
  Paperclip,
  Radio,
  Send,
  Sparkles,
  Users,
  UserCheck,
  UserRound
} from 'lucide-react';
import './styles.css';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const API_BASE =
  import.meta.env.VITE_API_BASE ??
  (['localhost', '127.0.0.1'].includes(window.location.hostname) ? 'http://localhost:8787' : '');

const modelOptions = [
  {
    id: 'lite',
    label: '便宜模型',
    short: 'Haiku',
    apiModel: 'claude-3-5-haiku',
    inputPer1k: 0.0008,
    outputPer1k: 0.004
  },
  {
    id: 'balanced',
    label: '均衡模型',
    short: 'Sonnet',
    apiModel: 'claude-3-7-sonnet',
    inputPer1k: 0.003,
    outputPer1k: 0.015
  },
  {
    id: 'strong',
    label: '强模型',
    short: 'Max / Opus',
    apiModel: 'claude-opus-4',
    inputPer1k: 0.015,
    outputPer1k: 0.075
  }
];

const providerOptions = [
  {
    id: 'claude',
    label: 'Claude',
    models: ['claude-3-5-haiku', 'claude-3-7-sonnet', 'claude-opus-4']
  },
  {
    id: 'gpt',
    label: 'GPT',
    models: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-5.2']
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    models: ['openrouter/openai/gpt-4.1-mini', 'openrouter/openai/gpt-4.1', 'openrouter/anthropic/claude-3.5-haiku']
  }
];

const systemAgents = [
  {
    id: 'external',
    name: '外部机会 Agent',
    job: '扫描行业、招标、新闻，只输出外部线索和商机评分',
    defaultProvider: 'openrouter',
    defaultModel: 'openrouter/openai/gpt-4.1-mini',
    reason: '需要高吞吐、多来源路由和成本控制，默认走 OpenRouter GPT-4.1 mini；深度研判再升 GPT-4.1。'
  },
  {
    id: 'customer',
    name: '客户管理 Agent',
    job: '维护客户阶段、负责人、联系人和下一步跟进建议',
    defaultProvider: 'openrouter',
    defaultModel: 'openrouter/openai/gpt-4.1-mini',
    reason: '客户管理需要频繁整理和跟进，默认 GPT-4.1 mini；复杂客户画像可升 GPT-4.1。'
  },
  {
    id: 'task',
    name: '任务看板 Agent',
    job: '从对话、会议纪要、广播反馈和商机收藏中提取、分配、跟进任务',
    defaultProvider: 'openrouter',
    defaultModel: 'openrouter/openai/gpt-4.1-mini',
    reason: '需要高频提取行动项，默认用低成本模型；复杂会议纪要可临时升 GPT-4.1。'
  },
  {
    id: 'quote',
    name: '报价 Agent',
    job: '生成报价方案、报价构成、参考依据、缺失参数和风险',
    defaultProvider: 'openrouter',
    defaultModel: 'openrouter/openai/gpt-4.1-mini',
    reason: '报价需要稳妥、结构化和可审批，默认 GPT-4.1 mini；关键客户报价可升 GPT-4.1。'
  },
  {
    id: 'internal',
    name: '内部信息 Agent',
    job: '沉淀知识、经验、任务复盘和专家资产',
    defaultProvider: 'openrouter',
    defaultModel: 'openrouter/openai/gpt-4.1-mini',
    reason: '需要稳定归纳和较低试用成本，默认走 OpenRouter 的 GPT-4.1 mini；重要专家资产可临时升 GPT-4.1。'
  }
];

const agentResponsibilityRules = [
  { name: '个人助理 Agent', owner: '每位同事一个', scope: '个人私密交流、上传纪要、获得工作帮助', boundary: '不替系统 Agent 管理组织流程' },
  { name: '外部机会 Agent', owner: '系统', scope: '扫描行业、招标、新闻', boundary: '不管客户阶段、不生成报价、不分配任务' },
  { name: '客户管理 Agent', owner: '全员可用', scope: '维护客户阶段和跟进建议', boundary: '不扫外部网站、不生成报价金额' },
  { name: '任务看板 Agent', owner: 'Larry 日常负责', scope: '提取、分配、跟进任务', boundary: '不维护客户漏斗、不生成报价依据' },
  { name: '报价 Agent', owner: 'Larry 日常负责', scope: '生成报价方案和报价依据', boundary: '不承诺正式对外价格' },
  { name: '内部信息 Agent', owner: 'Jamie 审查', scope: '沉淀知识、经验、复盘', boundary: '不向普通同事暴露私密原文' }
];

const teammates = [
  { id: 'jamie', name: 'Jamie', agent: 'Jamie_AI', model: 'strong', role: '小团队试用负责人' },
  { id: 'larry', name: 'Larry', agent: 'Larry_AI', model: 'balanced', role: '任务/报价流程负责人' },
  { id: 'gu', name: 'Gu', agent: 'Gu_AI', model: 'strong', role: '工艺与设备参数' },
  { id: 'xiaodong', name: 'Xiaodong', agent: 'Xiaodong_AI', model: 'balanced', role: '项目协作' },
  { id: 'heli', name: 'Heli', agent: 'Heli_AI', model: 'lite', role: '运营支持' },
  { id: 'guihua', name: 'Guihua', agent: 'Guihua_AI', model: 'lite', role: '材料与供应' },
  { id: 'zhiping', name: 'Zhiping', agent: 'Zhiping_AI', model: 'strong', role: '设备选型' },
  { id: 'luyang', name: 'Luyang', agent: 'Luyang_AI', model: 'balanced', role: '客户与项目协作' },
  { id: 'kingsong', name: 'Kingsong', agent: 'Kingsong_AI', model: 'balanced', role: '设备与供应协作' }
];

const recommendedAgentRoutes = {
  jamie: { modelTier: 'strong', provider: 'openrouter', apiModel: 'openrouter/openai/gpt-4.1' },
  larry: { modelTier: 'balanced', provider: 'openrouter', apiModel: 'openrouter/openai/gpt-4.1-mini' },
  gu: { modelTier: 'strong', provider: 'openrouter', apiModel: 'openrouter/openai/gpt-4.1' },
  xiaodong: { modelTier: 'balanced', provider: 'openrouter', apiModel: 'openrouter/openai/gpt-4.1-mini' },
  heli: { modelTier: 'lite', provider: 'openrouter', apiModel: 'openrouter/anthropic/claude-3.5-haiku' },
  guihua: { modelTier: 'balanced', provider: 'openrouter', apiModel: 'openrouter/openai/gpt-4.1-mini' },
  zhiping: { modelTier: 'strong', provider: 'openrouter', apiModel: 'openrouter/openai/gpt-4.1' },
  luyang: { modelTier: 'balanced', provider: 'openrouter', apiModel: 'openrouter/openai/gpt-4.1-mini' },
  kingsong: { modelTier: 'balanced', provider: 'openrouter', apiModel: 'openrouter/openai/gpt-4.1-mini' }
};

const recommendedSystemRoutes = {
  internal: { provider: 'openrouter', apiModel: 'openrouter/openai/gpt-4.1-mini' },
  external: { provider: 'openrouter', apiModel: 'openrouter/openai/gpt-4.1-mini' },
  task: { provider: 'openrouter', apiModel: 'openrouter/openai/gpt-4.1-mini' },
  quote: { provider: 'openrouter', apiModel: 'openrouter/openai/gpt-4.1-mini' },
  customer: { provider: 'openrouter', apiModel: 'openrouter/openai/gpt-4.1-mini' }
};

const baseMessages = {
  jamie: [{ from: 'agent', text: '我负责帮你观察这个小团队试用：权限、模型成本、同事反馈和专家资产。' }],
  larry: [
    { from: 'agent', text: 'Larry，我会保留你的客户现场上下文，并帮你把收藏商机转成报价和跟进方案。' },
    { from: 'user', text: '某航天厂可能急需高压阀门，我想先判断是否值得跟进。' }
  ],
  gu: [
    { from: 'agent', text: '我会帮你沉淀工艺 bug、设备参数和阀门选型经验。' },
    { from: 'user', text: '4代核电阀门参数最近问答很多，需要形成系统资产。' }
  ],
  xiaodong: [{ from: 'agent', text: '我会帮你把项目过程里的风险和机会变成可执行动作。' }],
  heli: [{ from: 'agent', text: '我会整理运营侧信息，并把共性问题送入内部信息 Agent。' }],
  guihua: [{ from: 'agent', text: '我会沉淀材料选型、供应信息和客户采购顾虑。' }],
  zhiping: [{ from: 'agent', text: '我会用强模型帮你处理复杂设备选型和专家级判断。' }],
  luyang: [{ from: 'agent', text: '我会帮你把客户需求、项目协作和跟进动作整理清楚。' }],
  kingsong: [{ from: 'agent', text: '我会帮你沉淀设备、供应和项目交付中的关键信息。' }]
};

const opportunitySeed = [
  {
    id: 'aerospace-valve',
    title: '某航天厂急需高压阀门',
    source: '招投标 / 企业新闻',
    match: '设备专家能力匹配 92%',
    why: '需求涉及高压阀门、快速报价、可靠交付，和内部设备经验高度相关。',
    action: '收藏后让个人助理生成设备报价方案。',
    quality: { demand: 5, budget: 4, timing: 5, advantage: 4, total: 92, recommendation: '优先跟进：先确认真实采购窗口和报价参数。' }
  },
  {
    id: 'nuclear-valve',
    title: '4代核电阀门参数讨论升温',
    source: '行业论坛 / 技术文章',
    match: '阀门专家资产匹配 87%',
    why: 'Gu_AI 近期沉淀了大量阀门参数问答，可转化为系统级专家资产。',
    action: '推送给设备专家学习，并广播给全员助理。',
    quality: { demand: 3, budget: 2, timing: 3, advantage: 5, total: 72, recommendation: '观察跟进：先沉淀专家资产，再找对应客户。' }
  },
  {
    id: 'material-price',
    title: '耐腐蚀合金材料价格波动',
    source: '供应链新闻',
    match: '材料专家能力匹配 81%',
    why: '材料价格变化会影响报价策略和客户采购时机。',
    action: '收藏后让材料相关同事判断替代方案。',
    quality: { demand: 3, budget: 3, timing: 4, advantage: 4, total: 76, recommendation: '转报价参考：用于调整材料试制和设备方案。' }
  }
];

const insightCards = [
  {
    id: 'asset-valve',
    title: '设备专家资产自动固化',
    text: '系统检测到 Gu_AI 近期在“4代核电阀门参数”上沉淀了大量高质量问答，已提取核心直觉，准备固化为「系统级阀门专家资产.md」。',
    source: 'Gu_AI 原始对话 + 设备参数问答',
    asset: '系统级阀门专家资产.md'
  },
  {
    id: 'blindspot-quote',
    title: '跨团队盲点：报价话术不统一',
    text: 'Larry_AI、Guihua_AI 和 Zhiping_AI 的对话显示，客户对材料成本、设备可靠性、交付周期的疑问分散在不同同事手里，需要统一成报价知识卡。',
    source: '销售对话 + 材料对话 + 设备选型',
    asset: '报价决策知识卡.md'
  }
];

const expertTracks = [
  { name: '材料专家', level: 48, note: '学习材料选型、替代方案、价格波动和供应风险。' },
  { name: '设备专家', level: 56, note: '学习设备参数、阀门选型、维护约束和报价触发点。' }
];

const taskColumns = [
  {
    id: 'todo',
    title: '待办',
    items: [
      { title: '联系华东有色金属研究院，确认设备升级预算', tag: '客户跟进', owner: 'Luyang', due: '5 天后', priority: 'high' },
      { title: '整理 4 代核电阀门参数文档', tag: '专家资产', owner: 'Gu', due: '已逾期', priority: 'high' },
      { title: '对比 3 家真空熔炼设备供应商报价', tag: '设备选型', owner: 'Kingsong', due: '2 天后', priority: 'medium' }
    ]
  },
  {
    id: 'progress',
    title: '进行中',
    items: [
      { title: '生成某航天厂高压阀门报价方案', tag: '报价方案', owner: 'Jamie', due: '今天', priority: 'high' },
      { title: '耐腐蚀合金材料价格走势分析', tag: '市场分析', owner: 'Guihua', due: '1 天后', priority: 'medium' }
    ]
  },
  {
    id: 'review',
    title: '待审核',
    items: [{ title: 'Gu 提交的阀门专家资产文档', tag: '专家资产', owner: 'Gu', due: '1 天后', priority: 'medium' }]
  },
  {
    id: 'done',
    title: '已完成',
    items: [
      { title: '某航天厂需求初筛判断', tag: '商机跟进', owner: 'Larry', due: '已完成', priority: 'low' },
      { title: '全网行业线索汇总报告', tag: '市场信息', owner: 'Xiaodong', due: '已完成', priority: 'low' }
    ]
  }
];

const taskStatusColumns = [
  { id: 'todo', title: '待办' },
  { id: 'progress', title: '进行中' },
  { id: 'review', title: '等待反馈' },
  { id: 'done', title: '已完成' }
];

const customerStageColumns = ['未接触', '已接触', '有意向', '待报价', '待成交', '已成交'];
const taskStatusColumnsWithClosed = [...taskStatusColumns, { id: 'closed', title: '已关闭' }];

const businessRoleOptions = [
  { id: 'sales', label: '销售' },
  { id: 'technical', label: '技术' },
  { id: 'management', label: '管理' },
  { id: 'admin', label: '行政' },
  { id: 'tester', label: '测试' }
];

const customerSeed = [
  { name: '华东有色金属研究院', type: '科研机构', stage: '有意向', owner: 'luyang', contact: '张主任', phone: '138****8888', last: '5 天前', next: '确认设备升级预算和技术负责人。' },
  { name: '上海航天设备制造', type: '航天军工', stage: '待报价', owner: 'larry', contact: '李工', phone: '139****6666', last: '今天', next: '补齐高压阀门参数和交付周期。' },
  { name: '广州高校材料实验室', type: '高校科研', stage: '待成交', owner: 'guihua', contact: '王教授', phone: '137****5555', last: '2 天前', next: '确认样品试制方案和检测要求。' },
  { name: '北京半导体材料公司', type: '半导体', stage: '已成交', owner: 'kingsong', contact: '赵经理', phone: '136****4444', last: '1 周前', next: '沉淀复购机会和交付复盘。' }
];

function App() {
  const [auth, setAuth] = useState(() => {
    const raw = window.localStorage.getItem('enterprise-os-auth');
    return raw ? JSON.parse(raw) : null;
  });

  const handleAuth = (payload) => {
    window.localStorage.setItem('enterprise-os-auth', JSON.stringify(payload));
    setAuth(payload);
  };

  const logout = () => {
    window.localStorage.removeItem('enterprise-os-auth');
    setAuth(null);
  };

  if (!auth) {
    return <AuthScreen onAuth={handleAuth} />;
  }

  return <EnterpriseApp auth={auth} onLogout={logout} />;
}

function EnterpriseApp({ auth, onLogout }) {
  const [page, setPage] = useState('dashboard');
  const [workspaceId, setWorkspaceId] = useState(auth.user.role === 'super_admin' ? 'larry' : auth.user.id);
  const [messagesByUser, setMessagesByUser] = useState(baseMessages);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [attachmentLoading, setAttachmentLoading] = useState(false);
  const [thinkingByUser, setThinkingByUser] = useState({});
  const [listening, setListening] = useState(false);
  const [savedByUser, setSavedByUser] = useState({ larry: ['aerospace-valve'] });
  const [broadcasted, setBroadcasted] = useState([]);
  const [systemOutputs, setSystemOutputs] = useState({ internal: [], external: [], task: [], quote: [], customer: [] });
  const [generatedOpportunities, setGeneratedOpportunities] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [customers, setCustomers] = useState(customerSeed);
  const [lastWorkflowArtifacts, setLastWorkflowArtifacts] = useState(null);
  const [agentFeedback, setAgentFeedback] = useState([]);
  const [taskNotice, setTaskNotice] = useState(null);
  const [systemRunning, setSystemRunning] = useState({});
  const [broadcasts, setBroadcasts] = useState([
    {
      id: 'bc-plan-larry-gu',
      type: '工作计划',
      title: '高压阀门报价准备',
      content: 'Larry 负责客户场景确认，Gu 补充关键设备参数，明天形成一页报价草案。',
      recipients: ['larry', 'gu'],
      feedback: {},
      readBy: {}
    }
  ]);
  const [workflowOwnerId, setWorkflowOwnerId] = useState('larry');
  const [workflowAgentsForAll, setWorkflowAgentsForAll] = useState(true);
  const [pendingRegistrations, setPendingRegistrations] = useState([]);
  const [modelByUser, setModelByUser] = useState(Object.fromEntries(teammates.map((item) => [item.id, item.model])));
  const [routeByUser, setRouteByUser] = useState(
    Object.fromEntries(
      teammates.map((item) => {
        const model = getModel(item.model);
        return [item.id, { provider: 'claude', apiModel: model.apiModel }];
      })
    )
  );
  const [routeBySystem, setRouteBySystem] = useState(
    Object.fromEntries(
      systemAgents.map((agent) => [agent.id, { provider: agent.defaultProvider, apiModel: agent.defaultModel }])
    )
  );
  const [usageByUser, setUsageByUser] = useState(
    Object.fromEntries(
      teammates.map((item, index) => [
        item.id,
        { calls: index + 2, input: 420 * (index + 1), output: 190 * (index + 1), cost: 0.18 * (index + 1) }
      ])
    )
  );
  const [accessByUser, setAccessByUser] = useState(
    Object.fromEntries(teammates.map((item) => [item.id, { active: true, ownerName: item.name }]))
  );
  const recognitionRef = useRef(null);
  const voiceActiveRef = useRef(false);
  const voicePressedRef = useRef(false);
  const voiceBaseDraftRef = useRef('');
  const voiceFinalTranscriptRef = useRef('');

  const isJamie = auth.user.role === 'super_admin';
  const permissions = auth.user.permissions ?? { agents: true, customers: true, quote: true, tasks: true, insight: isJamie };
  const isWorkflowOwner = auth.user.id === workflowOwnerId;
  const canManageWorkflow = (isJamie || isWorkflowOwner || workflowAgentsForAll) && permissions.tasks !== false;
  const visibleTeammates = isJamie ? teammates : teammates.filter((item) => item.id === auth.user.id);
  const visiblePage = isJamie ? page : page === 'commander' ? 'dashboard' : page;
  const coworker = teammates.find((item) => item.id === workspaceId) ?? teammates[1];
  const access = accessByUser[workspaceId] ?? { active: true, ownerName: coworker.name };
  const model = getModel(modelByUser[workspaceId]);
  const route = routeByUser[workspaceId] ?? { provider: 'claude', apiModel: model.apiModel };
  const messages = messagesByUser[workspaceId] ?? [];
  const isThinking = thinkingByUser[workspaceId] === true;
  const usage = usageByUser[workspaceId] ?? { calls: 0, input: 0, output: 0, cost: 0 };
  const allOpportunities = [...generatedOpportunities, ...opportunitySeed].sort((a, b) => opportunityScore(b) - opportunityScore(a));
  const allInsightCards = [...(systemOutputs.internal ?? []), ...insightCards];
  const savedCards = allOpportunities.filter((item) => (savedByUser[workspaceId] ?? []).includes(item.id));
  const inboxBroadcasts = broadcasts.filter((item) => item.recipients.includes(workspaceId));
  const myTasks = tasks.filter((task) => task.owner === workspaceId || (task.collaborators ?? []).includes(workspaceId));
  const myCustomers = customers.filter((customer) => customer.owner === workspaceId || (customer.collaborators ?? []).includes(workspaceId) || isJamie);
  const pendingQuotes = quotes.filter((quote) => quote.owner === workspaceId || (quote.collaborators ?? []).includes(workspaceId) || isJamie);
  const totalUsage = Object.values(usageByUser).reduce(
    (sum, item) => ({
      calls: sum.calls + item.calls,
      input: sum.input + item.input,
      output: sum.output + item.output,
      cost: sum.cost + item.cost
    }),
    { calls: 0, input: 0, output: 0, cost: 0 }
  );

  const apiFetch = (path, options = {}) =>
    fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
        ...(options.headers ?? {})
      }
    });

  useEffect(() => {
    if (!isJamie && workspaceId !== auth.user.id) {
      setWorkspaceId(auth.user.id);
    }
  }, [auth.user.id, isJamie, workspaceId]);

  useEffect(() => {
    let alive = true;
    apiFetch('/api/state')
      .then((response) => {
        if (response.status === 401) {
          onLogout();
          throw new Error('session_expired');
        }
        if (!response.ok) throw new Error('state_load_failed');
        return response.json();
      })
      .then((state) => {
        if (!alive) return;
        const usersById = Object.fromEntries((state.users ?? []).map((user) => [user.id, user]));
        const agentEntries = Object.entries(state.agents ?? {});

        setMessagesByUser({ ...baseMessages, ...(state.conversations ?? {}) });
        setSystemOutputs({ internal: [], external: [], task: [], quote: [], customer: [], ...(state.systemAgentOutputs ?? {}) });
        setGeneratedOpportunities(state.generatedOpportunities ?? []);
        setTasks(state.tasks ?? []);
        setQuotes(state.quotes ?? []);
        setCustomers(state.customers ?? customerSeed);
        setSavedByUser(state.savedOpportunities ?? {});
        setBroadcasts(state.broadcasts ?? []);
        setWorkflowOwnerId(state.workflowOwnerId ?? 'larry');
        setWorkflowAgentsForAll(state.workflowAgentsForAll !== false);
        setPendingRegistrations(state.pendingRegistrations ?? []);
        setAgentFeedback(state.agentFeedback ?? []);
        setUsageByUser((current) => ({ ...current, ...(state.usage ?? {}) }));
        setModelByUser((current) => ({
          ...current,
          ...Object.fromEntries(agentEntries.map(([id, agent]) => [id, agent.modelTier ?? current[id] ?? 'lite']))
        }));
        setRouteByUser((current) => ({
          ...current,
          ...Object.fromEntries(
            agentEntries.map(([id, agent]) => [
              id,
              {
                provider: agent.provider ?? current[id]?.provider ?? 'claude',
                apiModel: agent.apiModel ?? current[id]?.apiModel ?? 'claude-3-5-haiku'
              }
            ])
          )
        }));
        setRouteBySystem((current) => ({ ...current, ...(state.systemAgents ?? {}) }));
        setAccessByUser((current) => ({
          ...current,
          ...Object.fromEntries(
            agentEntries.map(([id, agent]) => [
              id,
              {
                active: usersById[id]?.active !== false && agent.active !== false,
                ownerName: usersById[id]?.name ?? current[id]?.ownerName ?? id
              }
            ])
          )
        }));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [auth.token, onLogout]);

  const sendMessage = () => {
    const text = draft.trim();
    if ((!text && attachments.length === 0) || !access.active || isThinking || attachmentLoading) return;
    const id = workspaceId;
    const attachedFiles = attachments;
    const messageText = text || '请分析我上传的附件。';
    const displayText = formatMessageWithAttachments(messageText, attachedFiles);
    const displayAttachments = attachedFiles.map(stripAttachmentPayload);
    const thinkingId = `thinking-${Date.now()}`;
    setThinkingByUser((current) => ({ ...current, [id]: true }));
    setMessagesByUser((current) => ({
      ...current,
      [id]: [
        ...(current[id] ?? []),
        { from: 'user', text: displayText, attachments: displayAttachments },
        { id: thinkingId, from: 'agent', text: '思考中...', thinking: true }
      ]
    }));
    setDraft('');
    setAttachments([]);

    const conversationContext = messages.slice(-6);
    apiFetch(`/api/agents/${id}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message: messageText, attachments: attachedFiles })
    })
      .then((response) => {
        if (!response.ok) throw new Error('agent_reply_failed');
        return response.json();
      })
      .then((payload) => {
        const reply = payload.reply ?? makeReply(displayText, coworker, model, savedCards, conversationContext);
        setMessagesByUser((current) => ({
          ...current,
          [id]: (current[id] ?? []).map((message) =>
            message.id === thinkingId ? { from: 'agent', text: reply } : message
          )
        }));
        if (payload.usage) {
          setUsageByUser((current) => ({ ...current, [id]: payload.usage }));
        } else {
          recordUsage(id, displayText, reply);
        }
        if (payload.createdTasks?.length) {
          setTasks((current) => mergeById(payload.createdTasks, current));
        }
        if (payload.createdArtifacts) {
          setLastWorkflowArtifacts(payload.createdArtifacts);
        }
        if (payload.quotes) {
          setQuotes(payload.quotes);
        }
        if (payload.customers) {
          setCustomers(payload.customers);
        }
        if (payload.generatedOpportunities) {
          setGeneratedOpportunities(payload.generatedOpportunities);
        }
        if (payload.systemAgentOutputs) {
          setSystemOutputs((current) => ({ ...current, ...payload.systemAgentOutputs }));
        }
      })
      .catch(() => {
        const reply = makeReply(displayText, coworker, model, savedCards, conversationContext);
        recordUsage(id, displayText, reply);
        setMessagesByUser((current) => ({
          ...current,
          [id]: (current[id] ?? []).map((message) =>
            message.id === thinkingId ? { from: 'agent', text: `${reply}\n\n（后端暂时没有返回，已使用本地降级回复。）` } : message
          )
        }));
      })
      .finally(() => {
        setThinkingByUser((current) => ({ ...current, [id]: false }));
      });
  };

  const clearConversation = () => {
    if (isThinking) return;
    const id = workspaceId;
    const ok = window.confirm('确认清空这段对话吗？系统会先归档再清空，但当前页面会立即变为空。');
    if (!ok) return;
    setMessagesByUser((current) => ({ ...current, [id]: [] }));
    apiFetch(`/api/agents/${id}/conversation/clear`, { method: 'POST' }).catch(() => {});
  };

  const appendConversation = (id, userText, agentText) => {
    setMessagesByUser((current) => ({
      ...current,
      [id]: [...(current[id] ?? []), { from: 'user', text: userText }, { from: 'agent', text: agentText }]
    }));
    recordUsage(id, userText, agentText);
  };

  const addAttachments = async (files) => {
    const selectedFiles = Array.from(files ?? []).slice(0, 8);
    if (!selectedFiles.length) return;
    setAttachmentLoading(true);
    try {
      const incoming = await Promise.all(
        selectedFiles.map(async (file, index) => {
          const type = file.type || inferFileType(file.name);
          const base = {
            id: `${file.name}-${file.size}-${Date.now()}-${index}`,
            name: file.name,
            size: file.size,
            type
          };
          if (!canEmbedFile(file, type)) {
            return {
              ...base,
              parseNote:
                file.size > MAX_EMBEDDED_ATTACHMENT_BYTES
                  ? '文件超过 2MB，本轮只发送文件名；请拆小后再上传。'
                  : '当前先支持 PDF/TXT/MD/CSV 正文解析；图片会作为附件记录。'
            };
          }
          try {
            return { ...base, dataUrl: await readFileAsDataUrl(file) };
          } catch {
            return { ...base, parseNote: '浏览器未能读取该附件正文。' };
          }
        })
      );
      setAttachments((current) => [...current, ...incoming].slice(0, 8));
    } finally {
      setAttachmentLoading(false);
    }
  };

  const removeAttachment = (fileId) => {
    setAttachments((current) => current.filter((file) => file.id !== fileId));
  };

  const recordUsage = (id, inputText, outputText) => {
    const activeModel = getModel(modelByUser[id]);
    const input = estimateTokens(inputText);
    const output = estimateTokens(outputText);
    const cost = (input / 1000) * activeModel.inputPer1k + (output / 1000) * activeModel.outputPer1k;
    setUsageByUser((current) => {
      const prev = current[id] ?? { calls: 0, input: 0, output: 0, cost: 0 };
      return {
        ...current,
        [id]: { calls: prev.calls + 1, input: prev.input + input, output: prev.output + output, cost: prev.cost + cost }
      };
    });
  };

  const composeVoiceDraft = (interimText = '') => {
    const base = voiceBaseDraftRef.current.trimEnd();
    const voiceText = `${voiceFinalTranscriptRef.current}${interimText}`.trim();
    return [base, voiceText].filter(Boolean).join(base && voiceText ? ' ' : '');
  };

  const startRecognition = () => {
    if (!SpeechRecognition || !access.active || voiceActiveRef.current || !voicePressedRef.current) return;
    voiceActiveRef.current = true;
    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => setListening(true);
    recognition.onresult = (event) => {
      let interimText = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript ?? '';
        if (event.results[index].isFinal) {
          voiceFinalTranscriptRef.current = `${voiceFinalTranscriptRef.current}${transcript}`;
        } else {
          interimText = `${interimText}${transcript}`;
        }
      }
      setDraft(composeVoiceDraft(interimText));
    };
    recognition.onend = () => {
      voiceActiveRef.current = false;
      if (voicePressedRef.current) {
        window.setTimeout(startRecognition, 80);
        return;
      }
      setDraft(composeVoiceDraft());
      setListening(false);
    };
    recognition.onerror = () => {
      voiceActiveRef.current = false;
      if (voicePressedRef.current) {
        window.setTimeout(startRecognition, 120);
        return;
      }
      setListening(false);
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  const startVoice = () => {
    if (!SpeechRecognition || !access.active || voicePressedRef.current) return;
    voicePressedRef.current = true;
    voiceBaseDraftRef.current = draft;
    voiceFinalTranscriptRef.current = '';
    startRecognition();
  };

  const stopVoice = () => {
    voicePressedRef.current = false;
    voiceActiveRef.current = false;
    setDraft(composeVoiceDraft());
    try {
      recognitionRef.current?.stop();
    } catch {
      recognitionRef.current?.abort?.();
    }
    setListening(false);
  };

  const saveOpportunity = (id) => {
    const card = allOpportunities.find((item) => item.id === id);
    setSavedByUser((current) => {
      const existing = current[workspaceId] ?? [];
      return existing.includes(id) ? current : { ...current, [workspaceId]: [...existing, id] };
    });
    apiFetch(`/api/opportunities/${id}/save`, {
      method: 'POST',
      body: JSON.stringify({ opportunity: card })
    })
      .then((response) => {
        if (!response.ok) throw new Error('opportunity_save_failed');
        return response.json();
      })
      .then((payload) => {
        if (payload.saved) setSavedByUser((current) => ({ ...current, [workspaceId]: payload.saved }));
        if (payload.tasks) setTasks(payload.tasks);
        if (payload.customers) setCustomers(payload.customers);
        if (payload.quotes) setQuotes(payload.quotes);
        if (payload.generatedOpportunities) setGeneratedOpportunities(payload.generatedOpportunities);
        if (payload.createdArtifacts) setLastWorkflowArtifacts(payload.createdArtifacts);
        if (payload.systemAgentOutputs) setSystemOutputs((current) => ({ ...current, ...payload.systemAgentOutputs }));
      })
      .catch(() => {});
  };

  const analyzeSaved = (card) => {
    appendConversation(
      workspaceId,
      `请基于收藏商机分析：${card.title}`,
      `针对“${card.title}”，建议 ${coworker.agent} 先做三步：确认客户场景与现有能力交集，生成一页报价/方案草稿，把关键参数同步给内部信息 Agent 做专家资产沉淀。商机动作：${card.action}`
    );
  };

  const suspend = (id) => {
    setAccessByUser((current) => ({ ...current, [id]: { ...current[id], active: false } }));
  };

  const transfer = (id) => {
    const previous = accessByUser[id]?.ownerName ?? teammates.find((item) => item.id === id)?.name ?? '同事';
    const nextName = `${previous} 接任者`;
    setAccessByUser((current) => ({ ...current, [id]: { active: true, ownerName: nextName, transferredFrom: previous } }));
    setMessagesByUser((current) => ({
      ...current,
      [id]: [...(current[id] ?? []), { from: 'agent', text: `资产已平移给 ${nextName}，历史商机、话术和专家直觉继续保留。` }]
    }));
  };

  const setModel = (id, modelId) => {
    setModelByUser((current) => ({ ...current, [id]: modelId }));
    apiFetch(`/api/agents/${id}/route`, {
      method: 'POST',
      body: JSON.stringify({ modelTier: modelId })
    }).catch(() => {});
  };

  const setRoute = (id, patch) => {
    let nextRoute;
    setRouteByUser((current) => {
      const previous = current[id] ?? { provider: 'claude', apiModel: getModel(modelByUser[id]).apiModel };
      const nextProvider = patch.provider ?? previous.provider;
      const provider = providerOptions.find((item) => item.id === nextProvider) ?? providerOptions[0];
      const nextModel = patch.provider ? provider.models[0] : patch.apiModel ?? previous.apiModel;
      nextRoute = { provider: nextProvider, apiModel: nextModel };
      return {
        ...current,
        [id]: nextRoute
      };
    });
    window.setTimeout(() => {
      apiFetch(`/api/agents/${id}/route`, {
        method: 'POST',
        body: JSON.stringify(nextRoute)
      }).catch(() => {});
    }, 0);
  };

  const setSystemRoute = (id, patch) => {
    let nextRoute;
    setRouteBySystem((current) => {
      const agent = systemAgents.find((item) => item.id === id) ?? systemAgents[0];
      const previous = current[id] ?? { provider: agent.defaultProvider, apiModel: agent.defaultModel };
      const nextProvider = patch.provider ?? previous.provider;
      const provider = providerOptions.find((item) => item.id === nextProvider) ?? providerOptions[0];
      nextRoute = {
        provider: nextProvider,
        apiModel: patch.provider ? provider.models[0] : patch.apiModel ?? previous.apiModel
      };
      return {
        ...current,
        [id]: nextRoute
      };
    });
    window.setTimeout(() => {
      apiFetch(`/api/system-agents/${id}/route`, {
        method: 'POST',
        body: JSON.stringify(nextRoute)
      }).catch(() => {});
    }, 0);
  };

  const applyRecommendedRoutes = () => {
    setModelByUser((current) => ({
      ...current,
      ...Object.fromEntries(Object.entries(recommendedAgentRoutes).map(([id, route]) => [id, route.modelTier]))
    }));
    setRouteByUser((current) => ({
      ...current,
      ...Object.fromEntries(Object.entries(recommendedAgentRoutes).map(([id, route]) => [id, { provider: route.provider, apiModel: route.apiModel }]))
    }));
    setRouteBySystem((current) => ({ ...current, ...recommendedSystemRoutes }));

    Object.entries(recommendedAgentRoutes).forEach(([id, route]) => {
      apiFetch(`/api/agents/${id}/route`, {
        method: 'POST',
        body: JSON.stringify(route)
      }).catch(() => {});
    });
    Object.entries(recommendedSystemRoutes).forEach(([id, route]) => {
      apiFetch(`/api/system-agents/${id}/route`, {
        method: 'POST',
        body: JSON.stringify(route)
      }).catch(() => {});
    });
  };

  const createBroadcast = ({ type, title, content, recipients }) => {
    const cleanRecipients = recipients.filter(Boolean);
    if (!title.trim() || !content.trim() || !cleanRecipients.length) return;
    const tempId = `bc-${Date.now()}`;
    const localBroadcast = {
      id: tempId,
      type,
      title: title.trim(),
      content: content.trim(),
      recipients: cleanRecipients,
      feedback: {},
      readBy: {}
    };
    setBroadcasts((current) => [
      localBroadcast,
      ...current
    ]);
    apiFetch('/api/broadcasts', {
      method: 'POST',
      body: JSON.stringify({
        type: localBroadcast.type,
        title: localBroadcast.title,
        content: localBroadcast.content,
        recipients: localBroadcast.recipients
      })
    })
      .then((response) => {
        if (!response.ok) throw new Error('broadcast_create_failed');
        return response.json();
      })
      .then((payload) => {
        if (!payload.broadcast) return;
        setBroadcasts((current) => current.map((item) => (item.id === tempId ? payload.broadcast : item)));
      })
      .catch(() => {});
  };

  const sendInsightBroadcast = (card, recipients = teammates.filter((item) => item.id !== 'jamie').map((item) => item.id)) => {
    createBroadcast({
      type: '专家资产',
      title: card.title,
      content: `${card.text} 已沉淀为：${card.asset}`,
      recipients
    });
    setBroadcasted((current) => (current.includes(card.id) ? current : [...current, card.id]));
  };

  const startQuickPrompt = (text) => {
    setDraft(text);
    setPage('workspace');
  };

  const submitAgentFeedback = (agentId, message, rating) => {
    const localFeedback = {
      id: `local-feedback-${Date.now()}`,
      agentId,
      rating,
      messageText: message.text,
      createdBy: auth.user.id,
      at: new Date().toISOString()
    };
    setAgentFeedback((current) => [localFeedback, ...current].slice(0, 30));
    apiFetch('/api/agent-feedback', {
      method: 'POST',
      body: JSON.stringify({
        agentId,
        rating,
        messageText: message.text
      })
    })
      .then((response) => {
        if (!response.ok) throw new Error('feedback_save_failed');
        return response.json();
      })
      .then((payload) => {
        if (payload.agentFeedback) setAgentFeedback(payload.agentFeedback);
        if (payload.systemAgentOutputs) {
          setSystemOutputs((current) => ({ ...current, ...payload.systemAgentOutputs }));
        }
      })
      .catch(() => {});
  };

  const runSystemAgent = (id) => {
    if ((id === 'internal' && !isJamie) || systemRunning[id]) return;
    setSystemRunning((current) => ({ ...current, [id]: true }));
    apiFetch(`/api/system-agents/${id}/run`, { method: 'POST' })
      .then((response) => {
        if (!response.ok) throw new Error('system_agent_failed');
        return response.json();
      })
      .then((payload) => {
        if (payload.output?.opportunity) {
          setGeneratedOpportunities((current) => [payload.output.opportunity, ...current]);
        }
        if (payload.broadcast) {
          setBroadcasts((current) => {
            const exists = current.some((item) => item.id === payload.broadcast.id);
            return exists ? current : [payload.broadcast, ...current];
          });
        }
        if (payload.createdTasks?.length) {
          setTasks((current) => mergeById(payload.createdTasks, current));
        }
        if (payload.quotes?.length) {
          setQuotes(payload.quotes);
        }
        if (payload.customers?.length) {
          setCustomers(payload.customers);
        }
        setSystemOutputs((current) => ({
          ...current,
          [id]: [payload.output, ...(current[id] ?? [])].slice(0, 12)
        }));
      })
      .finally(() => setSystemRunning((current) => ({ ...current, [id]: false })));
  };

  const submitFeedback = (broadcastId, status) => {
    const detail = typeof status === 'object' ? status : { status };
    const feedback = {
      status: detail.status,
      note: detail.note ?? '',
      discussWith: detail.discussWith ?? [],
      at: new Date().toLocaleString()
    };
    setBroadcasts((current) =>
      current.map((item) =>
        item.id === broadcastId
          ? { ...item, feedback: { ...item.feedback, [workspaceId]: feedback } }
          : item
      )
    );
    apiFetch(`/api/broadcasts/${broadcastId}/feedback`, {
      method: 'POST',
      body: JSON.stringify(feedback)
    })
      .then((response) => {
        if (!response.ok) throw new Error('feedback_failed');
        return response.json();
      })
      .then((payload) => {
        setBroadcasts((current) => {
          const updated = current.map((item) => (item.id === broadcastId && payload.broadcast ? payload.broadcast : item));
          if (!payload.discussionBroadcast) return updated;
          const alreadyExists = updated.some((item) => item.id === payload.discussionBroadcast.id);
          return alreadyExists ? updated : [payload.discussionBroadcast, ...updated];
        });
        if (payload.task) setTasks((current) => mergeById([payload.task], current));
      })
      .catch(() => {});
  };

  const createTask = (task = {}) => {
    const localTask = {
      id: `local-task-${Date.now()}`,
      title: task.title || '新的跟进任务',
      tag: task.tag || '工作任务',
      owner: task.owner || workspaceId,
      due: task.due || '本周',
      priority: task.priority || 'medium',
      status: task.status || 'todo',
      source: task.source || '手动创建',
      next: task.next || '确认下一步动作。'
    };
    setTasks((current) => [localTask, ...current]);
    apiFetch('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(localTask)
    })
      .then((response) => {
        if (!response.ok) throw new Error('task_create_failed');
        return response.json();
      })
      .then((payload) => {
        if (payload.tasks) setTasks(payload.tasks);
      })
      .catch(() => {});
  };

  const createTaskFromMessage = (message) => {
    setTaskNotice({ status: 'loading', text: '正在生成任务...' });
    apiFetch('/api/tasks/from-message', {
      method: 'POST',
      body: JSON.stringify({ ownerId: workspaceId, text: message.text, source: `${coworker.agent} 对话` })
    })
      .then((response) => {
        if (!response.ok) throw new Error('task_from_message_failed');
        return response.json();
      })
      .then((payload) => {
        if (payload.tasks) setTasks(payload.tasks);
        if (payload.task) {
          setTaskNotice({ status: 'success', text: `已生成任务：${payload.task.title}` });
          setLastWorkflowArtifacts((current) => ({
            ...(current ?? {}),
            tasks: [payload.task, ...((current?.tasks ?? []).filter((item) => item.id !== payload.task.id))]
          }));
        }
      })
      .catch(() => {
        setTaskNotice({ status: 'error', text: '任务生成失败，请稍后再试。' });
      });
  };

  const updateTask = (taskId, patch) => {
    setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, ...patch } : task)));
    apiFetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch)
    })
      .then((response) => {
        if (!response.ok) throw new Error('task_update_failed');
        return response.json();
      })
      .then((payload) => {
        if (payload.tasks) setTasks(payload.tasks);
        if (payload.systemAgentOutputs) {
          setSystemOutputs((current) => ({ ...current, ...payload.systemAgentOutputs }));
        }
      })
      .catch(() => {});
  };

  const approveRegistration = (id, options = {}) => {
    apiFetch(`/api/admin/registrations/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(options)
    })
      .then((response) => {
        if (!response.ok) throw new Error('approve_failed');
        return response.json();
      })
      .then((payload) => {
        setPendingRegistrations(payload.pendingRegistrations ?? []);
      })
      .catch(() => {});
  };

  const rejectRegistration = (id) => {
    apiFetch(`/api/admin/registrations/${id}/reject`, { method: 'POST' })
      .then((response) => {
        if (!response.ok) throw new Error('reject_failed');
        return response.json();
      })
      .then((payload) => setPendingRegistrations(payload.pendingRegistrations ?? []))
      .catch(() => {});
  };

  return (
    <main className="app-shell">
      <header className="app-top">
        <div>
          <p className="eyebrow">ClawOS Enterprise MVP</p>
          <h1>从线索到客户，再到任务、报价和复盘</h1>
        </div>
        <nav className="top-nav" aria-label="页面导航">
          <button className={visiblePage === 'dashboard' ? 'active' : ''} onClick={() => setPage('dashboard')}>
            业务工作台
          </button>
          <button className={visiblePage === 'workspace' ? 'active' : ''} onClick={() => setPage('workspace')}>
            我的 Agent
          </button>
          <button className={visiblePage === 'opportunity' ? 'active' : ''} onClick={() => setPage('opportunity')}>
            商机雷达
          </button>
          {permissions.customers !== false && (
            <button className={visiblePage === 'crm' ? 'active' : ''} onClick={() => setPage('crm')}>
              客户管理
            </button>
          )}
          {permissions.tasks !== false && (
            <button className={visiblePage === 'tasks' ? 'active' : ''} onClick={() => setPage('tasks')}>
              任务看板
            </button>
          )}
          {permissions.quote !== false && (
            <button className={visiblePage === 'quote' ? 'active' : ''} onClick={() => setPage('quote')}>
              报价方案
            </button>
          )}
          {permissions.insight === true && (
            <button className={visiblePage === 'insight' ? 'active' : ''} onClick={() => setPage('insight')}>
              内部信息仓
            </button>
          )}
          <button className={visiblePage === 'broadcast' ? 'active' : ''} onClick={() => setPage('broadcast')}>
            广播中心
          </button>
          {isJamie && (
            <button className={visiblePage === 'commander' ? 'active' : ''} onClick={() => setPage('commander')}>
              Jamie Central
            </button>
          )}
          <span className="login-chip">当前登录：{auth.user.name}</span>
          <button onClick={onLogout}>退出登录</button>
        </nav>
      </header>
      <BusinessFlowStrip />

      {visiblePage === 'dashboard' && (
        <BusinessDashboard
          agentFeedback={agentFeedback}
          broadcasts={inboxBroadcasts}
          customers={myCustomers}
          opportunities={allOpportunities}
          quotes={pendingQuotes}
          savedCards={savedCards}
          setPage={setPage}
          startQuickPrompt={startQuickPrompt}
          systemOutputs={systemOutputs}
          tasks={myTasks}
          workspaceName={access.ownerName}
        />
      )}

      {visiblePage === 'workspace' && (
        <CoworkerWorkspace
          access={access}
          attachments={attachments}
          coworker={coworker}
          draft={draft}
          listening={listening}
          messages={messages}
          isThinking={isThinking}
          broadcasts={inboxBroadcasts}
          createTaskFromMessage={createTaskFromMessage}
          savedCards={savedCards}
          selectedId={workspaceId}
          isJamie={isJamie}
          discussionTeammates={teammates}
          visibleTeammates={visibleTeammates}
          setDraft={setDraft}
          setPage={setPage}
          setWorkspaceId={setWorkspaceId}
          startVoice={startVoice}
          stopVoice={stopVoice}
          sendMessage={sendMessage}
          clearConversation={clearConversation}
          analyzeSaved={analyzeSaved}
          addAttachments={addAttachments}
          attachmentLoading={attachmentLoading}
          removeAttachment={removeAttachment}
          submitFeedback={submitFeedback}
          submitAgentFeedback={submitAgentFeedback}
          taskNotice={taskNotice}
          lastWorkflowArtifacts={lastWorkflowArtifacts}
        />
      )}

      {visiblePage === 'insight' && permissions.insight === true && (
        <InsightAgent
          broadcasted={broadcasted}
          broadcasts={broadcasts}
          createBroadcast={createBroadcast}
          sendInsightBroadcast={sendInsightBroadcast}
          totalUsage={totalUsage}
          messagesByUser={messagesByUser}
          insightCards={allInsightCards}
          runSystemAgent={runSystemAgent}
          running={systemRunning.internal}
        />
      )}

      {visiblePage === 'tasks' && permissions.tasks !== false && (
        <TaskBoard
          canManageWorkflow={canManageWorkflow}
          createTask={createTask}
          runTaskAgent={() => runSystemAgent('task')}
          running={systemRunning.task}
          tasks={tasks}
          taskOutputs={systemOutputs.task ?? []}
          updateTask={updateTask}
        />
      )}

      {visiblePage === 'crm' && permissions.customers !== false && (
        <CustomerManager
          canManageWorkflow={canManageWorkflow}
          customers={customers}
          customerOutputs={systemOutputs.customer ?? []}
          opportunities={allOpportunities}
          quotes={quotes}
          running={systemRunning.customer}
          runCustomerAgent={() => runSystemAgent('customer')}
          setPage={setPage}
          tasks={tasks}
        />
      )}

      {visiblePage === 'quote' && permissions.quote !== false && (
        <QuoteBuilder
          canManageWorkflow={canManageWorkflow}
          quotes={quotes}
          quoteOutputs={systemOutputs.quote ?? []}
          running={systemRunning.quote}
          runQuoteAgent={() => runSystemAgent('quote')}
          setPage={setPage}
        />
      )}

      {visiblePage === 'broadcast' && (
        <BroadcastCenter broadcasts={broadcasts} createBroadcast={createBroadcast} totalUsage={totalUsage} />
      )}

      {visiblePage === 'opportunity' && (
        <OpportunityBoard
          opportunities={allOpportunities}
          savedIds={savedByUser[workspaceId] ?? []}
          saveOpportunity={saveOpportunity}
          workspaceName={access.ownerName}
          runExternalAgent={() => runSystemAgent('external')}
          running={systemRunning.external}
        />
      )}

      {visiblePage === 'commander' && (
        <JamieCommander
          accessByUser={accessByUser}
          modelByUser={modelByUser}
          routeByUser={routeByUser}
          routeBySystem={routeBySystem}
          setModel={setModel}
          setRoute={setRoute}
          setSystemRoute={setSystemRoute}
          applyRecommendedRoutes={applyRecommendedRoutes}
          approveRegistration={approveRegistration}
          pendingRegistrations={pendingRegistrations}
          rejectRegistration={rejectRegistration}
          suspend={suspend}
          teammates={teammates}
          totalUsage={totalUsage}
          transfer={transfer}
          usageByUser={usageByUser}
        />
      )}
    </main>
  );
}

function BusinessFlowStrip() {
  const steps = ['个人助理', '外部机会', '客户管理', '任务看板', '报价方案', '内部沉淀'];
  return (
    <section className="business-flow" aria-label="业务闭环">
      {steps.map((step, index) => (
        <React.Fragment key={step}>
          <span>{step}</span>
          {index < steps.length - 1 && <i>→</i>}
        </React.Fragment>
      ))}
    </section>
  );
}

function BusinessDashboard({ agentFeedback, broadcasts, customers, opportunities, quotes, savedCards, setPage, startQuickPrompt, systemOutputs, tasks, workspaceName }) {
  const focusLeads = opportunities.slice(0, 3);
  const activeTasks = tasks.filter((task) => !['done', 'closed', 'cancelled'].includes(task.status)).slice(0, 5);
  const activeQuotes = quotes.filter((quote) => quote.approval !== '已完成').slice(0, 3);
  const unreadBroadcasts = broadcasts.slice(0, 4);
  const learningItems = buildLearningDigest({ agentFeedback, systemOutputs, tasks, quotes, customers, savedCards });
  return (
    <section className="dashboard-page">
      <div className="dashboard-hero">
        <div>
          <p className="eyebrow">Business Workspace</p>
          <h2>{workspaceName} 今天先看这里</h2>
          <p>系统会把线索、客户、任务、报价和广播收拢到这里，先告诉你今天该推进什么。</p>
          <div className="quick-start-row">
            <button onClick={() => startQuickPrompt('我今天拜访了一个客户，请帮我整理客户需求、下一步任务和是否需要报价。')}>客户拜访</button>
            <button onClick={() => startQuickPrompt('请根据这份会议纪要，帮我提取任务、负责人、截止时间和风险。')}>会议纪要</button>
            <button onClick={() => startQuickPrompt('我需要准备一个报价方案，请先列出必须确认的参数和报价依据。')}>报价准备</button>
          </div>
        </div>
        <button className="agent-run-button" onClick={() => setPage('workspace')}>进入我的 Agent 对话</button>
      </div>
      <div className="dashboard-grid">
        <DashboardPanel title="今日重点线索" action="去线索池" onAction={() => setPage('opportunity')}>
          {focusLeads.map((item) => (
            <button className="dashboard-row" key={item.id} onClick={() => setPage('opportunity')}>
              <strong>{item.title}</strong>
              <span>{opportunityScore(item)} 分 · {item.recommendedOwner ? `建议 ${getTeammateName(item.recommendedOwner)}` : item.recommendation || item.quality?.recommendation || '待判断'}</span>
            </button>
          ))}
        </DashboardPanel>
        <DashboardPanel title="我的客户" action="去客户管理" onAction={() => setPage('crm')}>
          {customers.slice(0, 5).map((customer) => (
            <button className="dashboard-row" key={customer.id || customer.name} onClick={() => setPage('crm')}>
              <strong>{customer.name}</strong>
              <span>{normalizeStageLabel(customer.stage)} · 下一步：{customer.next || '待确认'}</span>
            </button>
          ))}
        </DashboardPanel>
        <DashboardPanel title="我的待办" action="去任务看板" onAction={() => setPage('tasks')}>
          {activeTasks.map((task) => (
            <button className="dashboard-row" key={task.id} onClick={() => setPage('tasks')}>
              <strong>{task.title}</strong>
              <span>{getTeammateName(task.owner)} · {task.due} · {task.source}</span>
            </button>
          ))}
        </DashboardPanel>
        <DashboardPanel title="待处理报价" action="去报价方案" onAction={() => setPage('quote')}>
          {activeQuotes.length ? activeQuotes.map((quote) => (
            <button className="dashboard-row" key={quote.id} onClick={() => setPage('quote')}>
              <strong>{quote.customer}</strong>
              <span>{quote.type} · {quote.priceRange || quote.approval || '待补齐参数'}</span>
            </button>
          )) : <p className="empty-hint">暂无待处理报价。</p>}
        </DashboardPanel>
        <DashboardPanel title="内部广播/协作邀请" action="去广播中心" onAction={() => setPage('broadcast')}>
          {unreadBroadcasts.length ? unreadBroadcasts.map((item) => (
            <button className="dashboard-row" key={item.id} onClick={() => setPage('broadcast')}>
              <strong>{item.title}</strong>
              <span>{item.type} · {Object.keys(item.feedback ?? {}).length} 人反馈</span>
            </button>
          )) : <p className="empty-hint">暂无新的广播。</p>}
        </DashboardPanel>
        <DashboardPanel title="Agent 学习状态" action="继续训练" onAction={() => setPage('workspace')}>
          {learningItems.map((item) => (
            <div className="learning-row" key={item.title}>
              <strong>{item.title}</strong>
              <span>{item.text}</span>
            </div>
          ))}
        </DashboardPanel>
      </div>
    </section>
  );
}

function DashboardPanel({ action, children, onAction, title }) {
  return (
    <section className="dashboard-panel">
      <div className="dashboard-panel-head">
        <strong>{title}</strong>
        <button onClick={onAction}>{action}</button>
      </div>
      <div className="dashboard-panel-body">{children}</div>
    </section>
  );
}

function CoworkerWorkspace({
  access,
  analyzeSaved,
  addAttachments,
  attachmentLoading,
  attachments,
  coworker,
  discussionTeammates,
  draft,
  listening,
  lastWorkflowArtifacts,
  messages,
  isThinking,
  broadcasts,
  savedCards,
  selectedId,
  isJamie,
  visibleTeammates,
  setDraft,
  setPage,
  setWorkspaceId,
  startVoice,
  stopVoice,
  sendMessage,
  clearConversation,
  createTaskFromMessage,
  removeAttachment,
  submitFeedback,
  submitAgentFeedback,
  taskNotice
}) {
  const uploadInputId = `upload-${selectedId}`;
  const messageStreamRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const [discussionDraft, setDiscussionDraft] = useState({ broadcastId: '', discussWith: [], note: '' });

  useEffect(() => {
    stickToBottomRef.current = true;
    window.requestAnimationFrame(() => {
      const stream = messageStreamRef.current;
      if (stream) stream.scrollTop = stream.scrollHeight;
    });
  }, [selectedId]);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    window.requestAnimationFrame(() => {
      const stream = messageStreamRef.current;
      if (stream) stream.scrollTop = stream.scrollHeight;
    });
  }, [messages.length, selectedId]);

  const toggleDiscussWith = (teammateId) => {
    setDiscussionDraft((current) => ({
      ...current,
      discussWith: current.discussWith.includes(teammateId)
        ? current.discussWith.filter((id) => id !== teammateId)
        : [...current.discussWith, teammateId]
    }));
  };

  const openDiscussionInvite = (broadcast) => {
    const fallbackInvitees = broadcast.recipients.filter((id) => id !== selectedId);
    setDiscussionDraft({
      broadcastId: broadcast.id,
      discussWith: fallbackInvitees.length ? fallbackInvitees : [],
      note: ''
    });
  };

  const confirmDiscussionInvite = (broadcastId) => {
    if (!discussionDraft.discussWith.length) return;
    submitFeedback(broadcastId, {
      status: '需要讨论',
      note: discussionDraft.note,
      discussWith: discussionDraft.discussWith
    });
    setDiscussionDraft({ broadcastId: '', discussWith: [], note: '' });
  };

  return (
    <section className="workspace-page">
      <aside className="panel coworker-switcher">
        <h2>{isJamie ? '同事空间' : '我的空间'}</h2>
        {visibleTeammates.map((item) => (
          <button
            key={item.id}
            className={selectedId === item.id ? 'active' : ''}
            onClick={() => {
              if (isJamie) setWorkspaceId(item.id);
            }}
          >
            <UserRound size={17} />
            <span>
              <strong>{item.name}</strong>
              <small>{item.agent}</small>
            </span>
          </button>
        ))}
      </aside>

      <section className="panel private-desktop">
        <div className="identity-line">
          <span>👤 {access.ownerName} 的数字空间</span>
          <div className="identity-actions">
            <strong>{coworker.agent}</strong>
            <button className="return-dashboard-button" onClick={() => setPage('dashboard')}>返回业务工作台</button>
            <button onClick={clearConversation} disabled={isThinking}>清空对话</button>
          </div>
        </div>
        <div
          className="message-stream"
          ref={messageStreamRef}
          onScroll={(event) => {
            const stream = event.currentTarget;
            stickToBottomRef.current = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 90;
          }}
        >
          {messages.length ? (
            messages.map((message, index) => (
              <div className={`message ${message.from} ${message.thinking ? 'thinking' : ''}`} key={message.id ?? `${message.from}-${index}`}>
                {message.text}
                {message.from === 'agent' && !message.thinking && (
                  <div className="message-feedback-actions">
                    <button onClick={() => createTaskFromMessage(message)}>生成任务</button>
                    <button onClick={() => submitAgentFeedback(selectedId, message, 'useful')}>有用</button>
                    <button onClick={() => submitAgentFeedback(selectedId, message, 'inaccurate')}>不准</button>
                    <button onClick={() => submitAgentFeedback(selectedId, message, 'need_detail')}>需更具体</button>
                  </div>
                )}
              </div>
            ))
          ) : (
            <WorkspaceStarter coworker={coworker} />
          )}
        </div>
        {taskNotice && (
          <div className={`task-notice ${taskNotice.status}`}>
            <span>{taskNotice.text}</span>
            <button onClick={() => setPage('tasks')}>去任务看板查看</button>
          </div>
        )}
        <div className="voice-composer">
          <div className="composer-input-row">
            <input
              value={draft}
              disabled={!access.active || isThinking || attachmentLoading}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') sendMessage();
              }}
              placeholder={
                attachmentLoading
                  ? '附件读取中...'
                  : isThinking
                    ? 'Agent 正在思考中...'
                    : '说出现场信息、客户问题或报价想法...'
              }
            />
            <button className="send-button" onClick={sendMessage} disabled={!access.active || isThinking || attachmentLoading}>
              <Send size={18} />
            </button>
          </div>
          {attachments.length > 0 && (
            <div className="attachment-preview">
              {attachments.map((file) => (
                <span className="attachment-chip" key={file.id}>
                  <Paperclip size={14} />
                  {file.name}
                  {file.dataUrl ? <em>已读取</em> : file.parseNote ? <em>仅记录</em> : null}
                  <button type="button" onClick={() => removeAttachment(file.id)} aria-label={`移除 ${file.name}`}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="composer-tool-row">
            <button
              className={`mic-button ${listening ? 'recording' : ''}`}
              onMouseDown={startVoice}
              onMouseUp={stopVoice}
              onMouseLeave={stopVoice}
              onTouchStart={(event) => {
                event.preventDefault();
                startVoice();
              }}
              onTouchEnd={stopVoice}
              onTouchCancel={stopVoice}
              disabled={!access.active || isThinking || attachmentLoading}
            >
              <Mic size={20} />
              {listening ? '松开结束' : '按住说话'}
            </button>
            <label className={`upload-button ${!access.active || isThinking || attachmentLoading ? 'disabled' : ''}`} htmlFor={uploadInputId}>
              <Paperclip size={18} />
              {attachmentLoading ? '附件读取中' : '上传文件/图片'}
              <input
                id={uploadInputId}
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md"
                disabled={!access.active || isThinking || attachmentLoading}
                onChange={(event) => {
                  addAttachments(event.target.files);
                  event.target.value = '';
                }}
              />
            </label>
          </div>
        </div>
        <div className="saved-dock">
          <strong>雷达商机传送门</strong>
          {savedCards.length ? (
            savedCards.map((card) => (
              <button key={card.id} onClick={() => analyzeSaved(card)}>
                <BookmarkCheck size={15} />
                {card.title}
              </button>
            ))
          ) : (
            <p>从外部商机雷达收藏后，会吸附到这里。</p>
          )}
        </div>
        <div className="business-shortcuts">
          <strong>业务工作台</strong>
          <div>
            <button onClick={() => setWorkspaceId(selectedId)} disabled>
              当前助理
            </button>
            <button onClick={() => setPage('tasks')}>任务</button>
            <button onClick={() => setPage('crm')}>客户</button>
            <button onClick={() => setPage('quote')}>报价</button>
          </div>
        </div>
        <WorkflowArtifactsDock artifacts={lastWorkflowArtifacts} setPage={setPage} />
        <div className="broadcast-inbox">
          <strong>内部广播</strong>
          {broadcasts.length ? (
            broadcasts.map((item) => (
              <article key={item.id} className="broadcast-item">
                <small>{item.type}</small>
                <h3>{item.title}</h3>
                <p>{item.content}</p>
                <div className="feedback-row">
                  {['收到', '跟进中', '需要讨论'].map((status) => (
                    <button
                      key={status}
                      className={item.feedback?.[selectedId]?.status === status ? 'active' : ''}
                      onClick={() => (status === '需要讨论' ? openDiscussionInvite(item) : submitFeedback(item.id, status))}
                    >
                      {status}
                    </button>
                  ))}
                </div>
                {discussionDraft.broadcastId === item.id && (
                  <div className="discussion-panel">
                    <strong>邀请谁一起讨论</strong>
                    <div className="recipient-picker">
                      {discussionTeammates
                        .filter((teammate) => teammate.id !== selectedId)
                        .map((teammate) => (
                          <button
                            key={teammate.id}
                            className={discussionDraft.discussWith.includes(teammate.id) ? 'active' : ''}
                            onClick={() => toggleDiscussWith(teammate.id)}
                          >
                            {teammate.name}
                          </button>
                        ))}
                    </div>
                    <textarea
                      value={discussionDraft.note}
                      onChange={(event) => setDiscussionDraft((current) => ({ ...current, note: event.target.value }))}
                      placeholder="补一句想讨论的问题，例如：请 Gu 一起确认关键参数。"
                    />
                    <div className="discussion-actions">
                      <button onClick={() => setDiscussionDraft({ broadcastId: '', discussWith: [], note: '' })}>取消</button>
                      <button className="active" onClick={() => confirmDiscussionInvite(item.id)} disabled={!discussionDraft.discussWith.length}>
                        发起讨论邀请
                      </button>
                    </div>
                  </div>
                )}
                {item.feedback?.[selectedId]?.status === '需要讨论' && item.feedback?.[selectedId]?.discussWith?.length > 0 && (
                  <p className="discussion-summary">
                    已邀请{' '}
                    {item.feedback[selectedId].discussWith
                      .map((id) => discussionTeammates.find((teammate) => teammate.id === id)?.name ?? id)
                      .join('、')}
                    讨论
                  </p>
                )}
              </article>
            ))
          ) : (
            <p>内部信息 Agent 或 Jamie 发来的计划、商机会出现在这里。</p>
          )}
        </div>
      </section>
    </section>
  );
}

function WorkflowArtifactsDock({ artifacts, setPage }) {
  if (!artifacts) return null;
  const groups = [
    { key: 'tasks', label: '任务', page: 'tasks' },
    { key: 'customers', label: '客户', page: 'crm' },
    { key: 'quotes', label: '报价草案', page: 'quote' },
    { key: 'opportunities', label: '商机', page: 'opportunity' },
    { key: 'knowledge', label: '知识沉淀', page: 'insight' }
  ].map((group) => ({ ...group, items: artifacts[group.key] ?? [] })).filter((group) => group.items.length);

  if (!groups.length) return null;

  return (
    <div className="workflow-artifacts-dock">
      <strong>本次对话已进入业务流</strong>
      <p>Agent 已把原始信息分流成可跟进的结构化资产。</p>
      <div className="workflow-artifact-grid">
        {groups.map((group) => (
          <button key={group.key} onClick={() => setPage(group.page)}>
            <span>{group.label}</span>
            <b>{group.items.length}</b>
            <small>{artifactPreview(group.items[0])}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ userId: '', name: '', password: '', inviteCode: '' });
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setStatus('正在提交...');
    setBusy(true);
    const endpoint = mode === 'login' ? '/api/login' : '/api/register';
    const body =
      mode === 'login'
        ? { userId: form.userId.trim().toLowerCase(), password: form.password }
        : { name: form.name.trim(), userId: form.userId.trim().toLowerCase(), password: form.password, inviteCode: form.inviteCode.trim() };

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'auth_failed');
      if (payload.pending) {
        setStatus('注册已提交，等待 Jamie 审批开通权限。');
        setMode('login');
        return;
      }
      onAuth(payload);
    } catch (error) {
      const message = ['Failed to fetch', 'Load failed'].includes(error.message)
        ? '无法连接后端 API，请确认 npm run dev:api 或 npm start 正在运行。'
        : authErrorText(error.message);
      setStatus(`失败：${message}`);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setStatus('');
    setForm((current) => ({
      ...current,
      userId: '',
      name: '',
      password: '',
      inviteCode: ''
    }));
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">EnterpriseOS · 小团队试用</p>
        <h1>{mode === 'login' ? '进入你的私密 Agent 工作台' : '创建新的同事 Agent'}</h1>
        <p className="auth-subtitle">账号仅用于当前全员试用；每位同事只能进入自己的空间，Jamie 负责权限和模型配置。</p>
        <div className="auth-tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>
            登录
          </button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>
            注册
          </button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {mode === 'register' && (
            <label>
              姓名
              <input autoComplete="name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
          )}
          <label>
            用户 ID
            <input autoCapitalize="none" autoComplete="username" value={form.userId} onChange={(event) => setForm((current) => ({ ...current, userId: event.target.value }))} />
          </label>
          <label>
            密码
            <input
              type="password"
              value={form.password}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            />
          </label>
          {mode === 'register' && (
            <label>
              团队邀请码
              <input value={form.inviteCode} onChange={(event) => setForm((current) => ({ ...current, inviteCode: event.target.value }))} />
            </label>
          )}
          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? '处理中...' : mode === 'login' ? '登录' : '创建账号和 Agent'}
          </button>
        </form>
        <p className="auth-hint">
          {mode === 'login' ? '请使用本人账号登录；试用密码由 Jamie 单独发给各同事。' : '注册需要 Jamie 提供的邀请码；密码至少 8 位。'}
        </p>
        {status && <div className="auth-status">{status}</div>}
      </section>
    </main>
  );
}

function WorkspaceStarter({ coworker }) {
  const dailyLine = getWorkspaceDailyLine(coworker);
  return (
    <div className="workspace-starter">
      <strong>{coworker.agent} 已准备好</strong>
      <p>{dailyLine}</p>
    </div>
  );
}

function authErrorText(code) {
  const messages = {
    invalid_credentials: '用户 ID 或密码不正确。',
    registration_pending: '注册已提交，正在等待 Jamie 审批。',
    user_suspended: '这个账号已被中止权限，请联系 Jamie。',
    invalid_invite_code: '团队邀请码不正确。',
    password_too_short: '密码至少需要 8 位。',
    user_exists: '这个用户 ID 已存在。',
    name_userid_password_required: '请填写姓名、用户 ID 和密码。',
    auth_failed: '认证失败，请稍后再试。'
  };
  return messages[code] ?? code;
}

function InsightAgent({ broadcasted, broadcasts, createBroadcast, insightCards, messagesByUser, runSystemAgent, running, sendInsightBroadcast, totalUsage }) {
  const eventCount = Object.values(messagesByUser).flat().length;
  const [draft, setDraft] = useState({
    type: '工作计划',
    title: '本周商机跟进',
    content: '请相关同事根据收藏商机补充客户背景、设备参数和报价风险。',
    recipients: teammates.filter((item) => item.id !== 'jamie').map((item) => item.id)
  });
  const toggleRecipient = (id) => {
    setDraft((current) => ({
      ...current,
      recipients: current.recipients.includes(id)
        ? current.recipients.filter((item) => item !== id)
        : [...current.recipients, id]
    }));
  };
  return (
    <section className="insight-page">
      <div className="funnel-row">
        <Metric label="助理 Agent" value={String(teammates.length)} />
        <Metric label="原始对话事件" value={eventCount} />
        <Metric label="今日 Token" value={totalUsage.input + totalUsage.output} />
        <Metric label="专家资产" value="2" />
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>内部信息流动仓</h2>
            <p>隐秘读取原始聊天，抹去具体字句，沉淀专家资产和跨团队盲点。</p>
          </div>
          <button className="agent-run-button" onClick={() => runSystemAgent('internal')} disabled={running}>
            <Sparkles size={18} />
            {running ? '内部 Agent 思考中...' : '运行内部信息 Agent'}
          </button>
        </div>
        <div className="insight-wall">
          {insightCards.map((card) => {
            const isPublished = broadcasted.includes(card.id);
            return (
              <article className="insight-card" key={card.id}>
                <small>{card.source}</small>
                <h3>💡 {card.title}</h3>
                <p>{card.text}</p>
                {card.learning && <p className="learning-note">学习：{card.learning}</p>}
                {card.opportunity && (
                  <div className="system-opportunity">
                    <strong>{card.opportunity.title}</strong>
                    <span>{card.opportunity.match}</span>
                    <p>{card.opportunity.why}</p>
                    <p>{card.opportunity.action}</p>
                  </div>
                )}
                <div className="asset-name">{card.asset}</div>
                <button
                  className={isPublished ? 'published-button' : 'broadcast-button'}
                  onClick={() => sendInsightBroadcast(card)}
                >
                  {isPublished ? '已广播至全员助理' : '📢 广播给全员助理'}
                </button>
              </article>
            );
          })}
        </div>
      </section>
      <section className="panel broadcast-composer">
        <div className="panel-heading">
          <div>
            <h2>定向广播</h2>
            <p>可以向一个或多个同事广播工作计划、商机或专家资产，并收集反馈。</p>
          </div>
          <Send size={22} />
        </div>
        <div className="broadcast-form">
          <label>
            类型
            <select value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value }))}>
              <option>工作计划</option>
              <option>商机</option>
              <option>专家资产</option>
            </select>
          </label>
          <label>
            标题
            <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <label className="wide-field">
            内容
            <input value={draft.content} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} />
          </label>
          <div className="recipient-picker">
            {teammates
              .filter((item) => item.id !== 'jamie')
              .map((item) => (
                <button
                  key={item.id}
                  className={draft.recipients.includes(item.id) ? 'active' : ''}
                  onClick={() => toggleRecipient(item.id)}
                >
                  {item.name}
                </button>
              ))}
          </div>
          <button className="broadcast-button" onClick={() => createBroadcast(draft)}>
            发送广播
          </button>
        </div>
        <div className="feedback-summary">
          {broadcasts.slice(0, 4).map((item) => {
            const readIds = Object.keys(item.readBy ?? {}).filter((id) => item.recipients.includes(id));
            const readNames = readIds.map(getTeammateName).join('、');
            const feedbackText = Object.entries(item.feedback ?? {}).length
              ? Object.entries(item.feedback)
                  .map(([id, feedback]) => `${getTeammateName(id)}: ${feedback.status}`)
                  .join(' · ')
              : '等待反馈';
            return (
              <article key={item.id}>
                <strong>{item.title}</strong>
                <span>{readIds.length}/{item.recipients.length} 已读 · {item.recipients.length} 位收件人</span>
                <p className="read-receipt">{readNames ? `已读：${readNames}` : '暂未有人读取'}</p>
                <p>{feedbackText}</p>
              </article>
            );
          })}
        </div>
      </section>
      <section className="expert-row">
        {expertTracks.map((track) => (
          <article className="panel expert-card" key={track.name}>
            <div className="expert-head">
              <span>{track.name === '材料专家' ? <Layers3 size={18} /> : <Cpu size={18} />}</span>
              <div>
                <h3>{track.name}</h3>
                <small>学习进度 {track.level}%</small>
              </div>
            </div>
            <div className="progress-bar">
              <span style={{ width: `${track.level}%` }} />
            </div>
            <p>{track.note}</p>
          </article>
        ))}
      </section>
    </section>
  );
}

function TaskBoard({ canManageWorkflow, createTask, runTaskAgent, running, tasks, taskOutputs, updateTask }) {
  const latestOutput = taskOutputs[0];
  const extractedTasks = latestOutput?.tasks ?? [];
  const groupedTasks = taskStatusColumnsWithClosed.map((column) => ({
    ...column,
    items: tasks.filter((task) => task.status === column.id)
  }));
  return (
    <section className="business-page">
      <div className="business-heading">
        <div>
          <h2>任务看板</h2>
          <p>把 Agent 对话、会议纪要、商机跟进沉淀为可执行任务。</p>
        </div>
        <button
          className="broadcast-button compact-button"
          disabled={!canManageWorkflow}
          onClick={() => createTask({ owner: 'larry', title: '新的客户跟进任务', source: '手动创建', next: '补充任务目标、负责人和截止时间。' })}
        >
          <ClipboardList size={17} />
          新建任务
        </button>
      </div>
      <WorkflowAgentPanel
        canManageWorkflow={canManageWorkflow}
        icon={<ClipboardList size={18} />}
        title="任务看板 Agent"
        description="从聊天、会议纪要、广播反馈和商机收藏里提取任务，形成负责人、优先级、截止时间和下一步动作。"
        running={running}
        runLabel="运行任务 Agent"
        runningLabel="任务 Agent 提取中..."
        onRun={runTaskAgent}
        latestTitle={latestOutput?.title}
        latestText={latestOutput?.text || latestOutput?.learning}
      />
      {extractedTasks.length > 0 && (
        <section className="workflow-output-list">
          <strong>任务 Agent 最新提取</strong>
          <div className="workflow-task-grid">
            {extractedTasks.map((task, index) => (
              <article className="task-card" key={`${task.title}-${index}`}>
                <h3>{task.title}</h3>
                <div className="task-meta">
                  <span>{getTeammateName(task.owner)}</span>
                  <span>{task.due}</span>
                  <span>{task.source}</span>
                </div>
                <p>{task.next}</p>
                <div className={`priority ${task.priority || 'medium'}`}>{priorityLabel(task.priority || 'medium')}</div>
              </article>
            ))}
          </div>
        </section>
      )}
      <div className="task-board">
        {groupedTasks.map((column) => (
          <section className="task-column" key={column.id}>
            <div className="task-column-head">
              <strong>{column.title}</strong>
              <span>{column.items.length}</span>
            </div>
            {column.items.map((task) => (
              <article className="task-card" key={task.title}>
                <h3>{task.title}</h3>
                <div className="task-meta">
                  <span>{task.tag || task.source}</span>
                  <span>{getTeammateName(task.owner)}</span>
                  <span className={task.due === '已逾期' ? 'danger-text' : ''}>{task.due}</span>
                </div>
                <p>{task.next}</p>
                <div className={`priority ${task.priority}`}>{priorityLabel(task.priority)}</div>
                <div className="task-actions">
                  {column.id !== 'progress' && column.id !== 'done' && (
                    <button onClick={() => updateTask(task.id, { status: 'progress' })}>开始跟进</button>
                  )}
                  {column.id !== 'review' && column.id !== 'done' && (
                    <button onClick={() => updateTask(task.id, { status: 'review' })}>等待反馈</button>
                  )}
                  {column.id !== 'done' && (
                    <button onClick={() => updateTask(task.id, { status: 'done', result: '已完成，等待系统沉淀结果。' })}>已完成</button>
                  )}
                  {column.id !== 'closed' && (
                    <button onClick={() => updateTask(task.id, { status: 'closed', evaluation: task.result || '已关闭，等待后续评估。' })}>关闭</button>
                  )}
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>
    </section>
  );
}

function CustomerManager({ canManageWorkflow, customers, customerOutputs, opportunities, quotes, running, runCustomerAgent, setPage, tasks }) {
  const latestOutput = customerOutputs[0];
  const latestCustomers = latestOutput?.customers ?? [];
  const groupedCustomers = customerStageColumns.map((stage) => ({
    stage,
    items: customers.filter((customer) => normalizeStageLabel(customer.stage) === stage)
  }));
  return (
    <section className="business-page">
      <div className="business-heading">
        <div>
          <h2>客户管理</h2>
          <p>按客户增长漏斗管理：未接触 → 已接触 → 有意向 → 待报价 → 待成交 → 已成交。</p>
        </div>
        <button className="broadcast-button compact-button" disabled={!canManageWorkflow} onClick={runCustomerAgent}>
          <Users size={17} />
          运行客户 Agent
        </button>
      </div>
      <WorkflowAgentPanel
        canManageWorkflow={canManageWorkflow}
        icon={<Users size={18} />}
        title="客户管理 Agent"
        description="从对话、任务、报价草案和商机收藏里整理客户阶段、负责人、联系人和下一步跟进动作。"
        running={running}
        runLabel="运行客户 Agent"
        runningLabel="客户 Agent 整理中..."
        onRun={runCustomerAgent}
        latestTitle={latestOutput?.title}
        latestText={latestOutput?.text || latestOutput?.learning}
      />
      {latestCustomers.length > 0 && (
        <section className="workflow-output-list">
          <strong>客户 Agent 最新建议</strong>
          <div className="workflow-task-grid">
            {latestCustomers.map((customer, index) => (
              <article className="task-card" key={`${customer.name}-${index}`}>
                <h3>{customer.name}</h3>
                <div className="task-meta">
                  <span>{customer.stage}</span>
                  <span>{getTeammateName(customer.owner)}</span>
                  <span>{customer.priority || 'medium'}</span>
                </div>
                <p>{customer.next}</p>
              </article>
            ))}
          </div>
        </section>
      )}
      <div className="customer-funnel">
        {groupedCustomers.map((column) => (
          <section className="customer-stage-column" key={column.stage}>
            <div className="task-column-head">
              <strong>{column.stage}</strong>
              <span>{column.items.length}</span>
            </div>
            {column.items.map((customer) => (
              <article className="customer-card" key={customer.name}>
                <div className="customer-head">
                  <div className="customer-avatar">{customer.name[0]}</div>
                  <div>
                    <h3>{customer.name}</h3>
                    <span>{customer.type} · {getTeammateName(customer.owner)}</span>
                  </div>
                </div>
                <div className="stage-pill">{normalizeStageLabel(customer.stage)}</div>
                <p>联系人：{customer.contact} · {customer.phone}</p>
                <p>上次联系：{customer.last}</p>
                <p>下一步：{customer.next}</p>
                <p>关联任务：{relatedTaskCount(customer, tasks)} · 关联商机：{relatedOpportunityCount(customer, opportunities)} · 关联报价：{relatedQuoteCount(customer, quotes)}</p>
                <div className="customer-actions">
                  <button onClick={() => setPage('tasks')}>跟进</button>
                  <button onClick={() => setPage('quote')}>报价</button>
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>
    </section>
  );
}

function QuoteBuilder({ canManageWorkflow, quotes, quoteOutputs, running, runQuoteAgent, setPage }) {
  const latestOutput = quoteOutputs[0];
  const quote = latestOutput?.quote ?? quotes[0];
  return (
    <section className="business-page">
      <div className="business-heading">
        <div>
          <h2>报价方案</h2>
          <p>把客户需求、设备参数和历史报价组合成内部报价草案。</p>
        </div>
        <button className="broadcast-button compact-button" disabled={!canManageWorkflow}>
          <FileText size={17} />
          保存报价
        </button>
      </div>
      <WorkflowAgentPanel
        canManageWorkflow={canManageWorkflow}
        icon={<CircleDollarSign size={18} />}
        title="报价 Agent"
        description="理解设备、熔炼服务、材料试制和工艺验证的报价结构，输出内部报价草案、缺失参数和风险提醒。"
        running={running}
        runLabel="运行报价 Agent"
        runningLabel="报价 Agent 分析中..."
        onRun={runQuoteAgent}
        latestTitle={latestOutput?.title}
        latestText={latestOutput?.text || latestOutput?.learning}
      />
      <div className="quote-layout">
        <section className="quote-form-panel">
          <label>
            客户名称
            <select defaultValue="上海航天设备制造">
              {customerSeed.map((customer) => (
                <option key={customer.name}>{customer.name}</option>
              ))}
            </select>
          </label>
          <label>
            报价编号
            <input defaultValue="BQ-2026-001" />
          </label>
          <label className="wide-field">
            项目描述
            <input defaultValue="高压阀门设备选型与供应方案" />
          </label>
          <div className="quote-line">
            <span>高压截止阀 DN50</span>
            <span>J41H-16C</span>
            <span>2 件</span>
            <strong>¥25,600</strong>
          </div>
          <div className="quote-line">
            <span>高压安全阀</span>
            <span>A42Y-16C</span>
            <span>1 件</span>
            <strong>¥8,600</strong>
          </div>
          <div className="quote-total">合计金额：<strong>¥34,200</strong></div>
        </section>
        <aside className="quote-ai-panel">
          <strong>报价 Agent 建议</strong>
          {quote ? (
            <>
              <p>{quote.summary}</p>
              <p>报价类型：{quote.type} · 审批：{quote.approval}</p>
              <p>建议区间：{quote.priceRange || '待补齐参数后生成内部区间'}</p>
              <p>报价构成：{(quote.components ?? []).join('、') || '待补充'}</p>
              <p>技术参数：{(quote.technicalParams ?? []).join('、') || '待确认'}</p>
              <p>成本构成：{(quote.costStructure ?? []).join('、') || '待拆分'}</p>
              <p>参考依据：{(quote.basis ?? []).join('；') || '需要匹配历史报价和市场价格。'}</p>
              <p>可谈判空间：{quote.negotiableSpace || '待确认'}</p>
              <p>人工确认：{(quote.confirmQuestions ?? []).join('、') || '暂无'}</p>
              <p>缺失参数：{(quote.missing ?? []).join('、') || '暂无'}</p>
              <p>风险：{(quote.risk ?? []).join('、') || '暂无'}</p>
              <p>下一步：{quote.next}</p>
            </>
          ) : (
            <>
              <p>利润率约 32%，价格竞争力良好；建议补充交付周期、质保范围和关键材料说明。</p>
              <p>推荐话术：基于贵方航天级高压阀门需求，我们建议采用成熟型号并预留参数确认窗口。</p>
            </>
          )}
          <button onClick={() => setPage('broadcast')}>广播给相关同事审核</button>
        </aside>
      </div>
      {quotes.length > 0 && (
        <section className="workflow-output-list">
          <strong>报价草案记录</strong>
          <div className="workflow-task-grid">
            {quotes.slice(0, 4).map((item) => (
              <article className="task-card" key={item.id}>
                <h3>{item.customer}</h3>
                <div className="task-meta">
                  <span>{item.type}</span>
                  <span>{item.approval}</span>
                </div>
                <p>{item.summary}</p>
                <p>下一步：{item.next}</p>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

function WorkflowAgentPanel({
  canManageWorkflow,
  description,
  icon,
  latestText,
  latestTitle,
  onRun,
  runLabel,
  running,
  runningLabel,
  title
}) {
  return (
    <section className="workflow-agent-panel">
      <div>
        <strong>{icon}{title}</strong>
        <p>{description}</p>
      </div>
      <button className="agent-run-button" onClick={onRun} disabled={!canManageWorkflow || running}>
        {running ? runningLabel : runLabel}
      </button>
      {latestTitle && (
        <article>
          <b>{latestTitle}</b>
          <p>{latestText}</p>
        </article>
      )}
    </section>
  );
}

function BroadcastCenter({ broadcasts, createBroadcast, totalUsage }) {
  const [draft, setDraft] = useState({
    type: '工作计划',
    title: '本周重点跟进',
    content: '请各位同步客户进展、报价风险和需要协助的事项。',
    recipients: teammates.filter((item) => item.id !== 'jamie').map((item) => item.id)
  });
  return (
    <section className="business-page">
      <div className="business-heading">
        <div>
          <h2>广播中心</h2>
          <p>发布工作计划、商机线索和讨论邀请，并查看已读与反馈。</p>
        </div>
        <button className="broadcast-button compact-button" onClick={() => createBroadcast(draft)}>
          <Radio size={17} />
          发布广播
        </button>
      </div>
      <div className="broadcast-center-grid">
        <section className="quote-form-panel">
          <label>
            类型
            <select value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value }))}>
              <option>工作计划</option>
              <option>商机线索</option>
              <option>专家资产</option>
            </select>
          </label>
          <label>
            标题
            <input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <label className="wide-field">
            内容
            <input value={draft.content} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} />
          </label>
          <div className="recipient-picker wide-field">
            {teammates
              .filter((item) => item.id !== 'jamie')
              .map((item) => (
                <button
                  key={item.id}
                  className={draft.recipients.includes(item.id) ? 'active' : ''}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      recipients: current.recipients.includes(item.id)
                        ? current.recipients.filter((id) => id !== item.id)
                        : [...current.recipients, item.id]
                    }))
                  }
                >
                  {item.name}
                </button>
              ))}
          </div>
        </section>
        <aside className="activity-panel">
          <strong>团队活跃度</strong>
          <p>本次试用已累计 Token：{totalUsage.input + totalUsage.output}</p>
          {teammates.slice(0, 6).map((item, index) => (
            <div className="activity-row" key={item.id}>
              <span>{item.name}</span>
              <div><i style={{ width: `${95 - index * 8}%` }} /></div>
            </div>
          ))}
        </aside>
      </div>
      <div className="feedback-summary">
        {broadcasts.slice(0, 6).map((item) => (
          <article key={item.id}>
            <strong>{item.title}</strong>
            <span>{Object.keys(item.readBy ?? {}).length}/{item.recipients.length} 已读</span>
            <p>{item.content}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function OpportunityBoard({ opportunities, savedIds, saveOpportunity, workspaceName, runExternalAgent, running }) {
  return (
    <section className="opportunity-page">
      <div className="radar-hero">
        <p className="eyebrow">External Opportunity Pool</p>
        <h2>外部线索池 ──► 真实需求 / 预算 / 时间 / 优势评分 ──► 转客户与任务</h2>
        <span>优先展示近 180 天线索；当前收藏目标：{workspaceName} 的助理</span>
        <button className="agent-run-button radar-run" onClick={runExternalAgent} disabled={running}>
          <Newspaper size={18} />
          {running ? '外部 Agent 搜索中...' : '运行外部机会 Agent'}
        </button>
      </div>
      <div className="masonry-board">
        {opportunities.map((card) => {
          const saved = savedIds.includes(card.id);
          return (
            <article className="radar-card" key={card.id}>
              <small>{card.source}</small>
              <h3>{card.title}</h3>
              <p>{card.why}</p>
              <div className="opportunity-score">
                <strong>{opportunityScore(card)}</strong>
                <span>综合评分</span>
              </div>
              <div className="quality-grid">
                <span>需求 {qualityValue(card, 'demand')}/5</span>
                <span>预算 {qualityValue(card, 'budget')}/5</span>
                <span>时间 {qualityValue(card, 'timing')}/5</span>
                <span>优势 {qualityValue(card, 'advantage')}/5</span>
              </div>
              <p className="action-note">推荐负责人：{getTeammateName(card.recommendedOwner || recommendOwnerFromOpportunity(card))}</p>
              {(card.recommendation || card.quality?.recommendation) && (
                <p className="action-note">{card.recommendation || card.quality.recommendation}</p>
              )}
              {card.urgency && <p className="urgency-note">紧急度：{card.urgency}</p>}
              {card.action && <p className="action-note">{card.action}</p>}
              {card.date && <p className="action-note">发布日期：{card.date}</p>}
              {card.url && (
                <a className="tender-link" href={card.url} target="_blank" rel="noreferrer">
                  打开招标来源
                </a>
              )}
              <div className="match-pill">{card.match}</div>
              <button className={saved ? 'saved-opportunity' : 'save-opportunity'} onClick={() => saveOpportunity(card.id)}>
                {saved ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}
                {saved ? '已钉入我的助理' : '⭐ 收藏至我的助理'}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function JamieCommander({
  accessByUser,
  applyRecommendedRoutes,
  approveRegistration,
  modelByUser,
  pendingRegistrations,
  rejectRegistration,
  routeBySystem,
  routeByUser,
  setModel,
  setRoute,
  setSystemRoute,
  suspend,
  teammates,
  totalUsage,
  transfer,
  usageByUser
}) {
  return (
    <section className="commander-page">
      <div className="commander-hero">
        <p className="eyebrow">Jamie 小团队试用负责人</p>
        <h2>小团队模型、权限、成本与专家资产控制台</h2>
        <button className="commander-action" onClick={applyRecommendedRoutes}>一键应用推荐 OpenRouter 配置</button>
      </div>
      <div className="funnel-row">
        <Metric label="小团队模型成本" value={`$${totalUsage.cost.toFixed(2)}`} />
        <Metric label="总调用" value={totalUsage.calls} />
        <Metric label="总 Token" value={totalUsage.input + totalUsage.output} />
        <Metric label="强模型助理" value={Object.values(modelByUser).filter((id) => id === 'strong').length} />
      </div>
      <RegistrationApprovalPanel
        approveRegistration={approveRegistration}
        pendingRegistrations={pendingRegistrations}
        rejectRegistration={rejectRegistration}
      />
      <section className="panel command-table-wrap">
        <h2>全员助理监控与模型干预矩阵</h2>
        <div className="command-table">
          <div className="table-head">同事/助理</div>
          <div className="table-head">权限状态</div>
          <div className="table-head">模型路由</div>
          <div className="table-head">今日 Token 成本</div>
          <div className="table-head">专家贡献</div>
          <div className="table-head">核心操作</div>
          {teammates.map((item, index) => {
            const usage = usageByUser[item.id] ?? { cost: 0 };
            const access = accessByUser[item.id] ?? { active: true, ownerName: item.name };
            return (
              <React.Fragment key={item.id}>
                <div>
                  <strong>{item.agent}</strong>
                  <small>{access.ownerName}</small>
                </div>
                <div>{item.id === 'jamie' ? '👑 试用负责人' : access.active ? '🟢 活跃中' : '🔴 已中止'}</div>
                <div>
                  <div className="route-stack">
                    <select value={modelByUser[item.id]} onChange={(event) => setModel(item.id, event.target.value)}>
                      {modelOptions.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label} ({model.short})
                        </option>
                      ))}
                    </select>
                    <select
                      value={routeByUser[item.id]?.provider ?? 'claude'}
                      onChange={(event) => setRoute(item.id, { provider: event.target.value })}
                    >
                      {providerOptions.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={routeByUser[item.id]?.apiModel ?? getModel(modelByUser[item.id]).apiModel}
                      onChange={(event) => setRoute(item.id, { apiModel: event.target.value })}
                    >
                      {(providerOptions.find((provider) => provider.id === (routeByUser[item.id]?.provider ?? 'claude')) ?? providerOptions[0]).models.map((apiModel) => (
                        <option key={apiModel} value={apiModel}>
                          {apiModel}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>${usage.cost.toFixed(2)}</div>
                <div>{index * 2 || '—'} 份</div>
                <div className="row-actions">
                  <button onClick={() => suspend(item.id)} disabled={item.id === 'jamie'}>
                    中止权限
                  </button>
                  <button onClick={() => transfer(item.id)} disabled={item.id === 'jamie'}>
                    🔗 一键资产平移
                  </button>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </section>
      <section className="panel agent-boundary-panel">
        <h2>固定 Agent 分工</h2>
        <div className="agent-boundary-grid">
          {agentResponsibilityRules.map((rule) => (
            <article key={rule.name}>
              <strong>{rule.name}</strong>
              <span>{rule.owner}</span>
              <p>{rule.scope}</p>
              <small>{rule.boundary}</small>
            </article>
          ))}
        </div>
      </section>
      <section className="panel system-agent-config">
        <h2>系统 Agent 模型配置</h2>
        <div className="system-agent-grid">
          {systemAgents.map((agent) => {
            const route = routeBySystem[agent.id] ?? { provider: agent.defaultProvider, apiModel: agent.defaultModel };
            const provider = providerOptions.find((item) => item.id === route.provider) ?? providerOptions[0];
            return (
              <article className="system-agent-card" key={agent.id}>
                <div>
                  <strong>{agent.name}</strong>
                  <p>{agent.job}</p>
                </div>
                <label>模型平台</label>
                <select value={route.provider} onChange={(event) => setSystemRoute(agent.id, { provider: event.target.value })}>
                  {providerOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <label>具体模型</label>
                <select value={route.apiModel} onChange={(event) => setSystemRoute(agent.id, { apiModel: event.target.value })}>
                  {provider.models.map((apiModel) => (
                    <option key={apiModel} value={apiModel}>
                      {apiModel}
                    </option>
                  ))}
                </select>
                <div className="route-reason">{agent.reason}</div>
              </article>
            );
          })}
        </div>
      </section>
      <section className="panel reviewer">
        <h2>内部信息 Agent 原始提炼审查器</h2>
        <p>Jamie 可查看提炼源、修正专家材料，并审批发布为全员助理后台知识。</p>
        <div className="review-actions">
          <button>修正</button>
          <button>审批发布</button>
        </div>
      </section>
    </section>
  );
}

function RegistrationApprovalPanel({ approveRegistration, pendingRegistrations, rejectRegistration }) {
  const [drafts, setDrafts] = useState({});
  const getDraft = (id) =>
    drafts[id] ?? {
      businessRole: 'sales',
      permissions: { agents: true, customers: true, quote: true, tasks: true, insight: false }
    };
  const patchDraft = (id, patch) => setDrafts((current) => ({ ...current, [id]: { ...getDraft(id), ...patch } }));
  const patchPermission = (id, key, value) =>
    patchDraft(id, { permissions: { ...getDraft(id).permissions, [key]: value } });

  return (
    <section className="panel registration-panel">
      <h2>注册审批与角色权限</h2>
      {pendingRegistrations.length ? (
        <div className="registration-list">
          {pendingRegistrations.map((item) => {
            const draft = getDraft(item.id);
            return (
              <article key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.id} · {new Date(item.requestedAt).toLocaleString()}</span>
                </div>
                <label>
                  角色
                  <select value={draft.businessRole} onChange={(event) => patchDraft(item.id, { businessRole: event.target.value })}>
                    {businessRoleOptions.map((role) => (
                      <option key={role.id} value={role.id}>{role.label}</option>
                    ))}
                  </select>
                </label>
                <div className="permission-grid">
                  {[
                    ['agents', '可使用 Agent'],
                    ['customers', '可看客户'],
                    ['quote', '可用报价 Agent'],
                    ['tasks', '可管理任务'],
                    ['insight', '可查看内部信息仓']
                  ].map(([key, label]) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={draft.permissions[key]}
                        onChange={(event) => patchPermission(item.id, key, event.target.checked)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <div className="row-actions">
                  <button onClick={() => approveRegistration(item.id, draft)}>审批开通</button>
                  <button onClick={() => rejectRegistration(item.id)}>拒绝</button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="empty-hint">暂无待审批注册。</p>
      )}
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function getModel(id) {
  return modelOptions.find((item) => item.id === id) ?? modelOptions[0];
}

function getTeammateName(id) {
  return teammates.find((item) => item.id === id)?.name ?? id;
}

function mergeById(incoming = [], current = []) {
  const seen = new Set();
  return [...incoming, ...current].filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function priorityLabel(priority) {
  return ({ high: '高优先级', medium: '中优先级', low: '低优先级' })[priority] ?? '普通';
}

function normalizeStageLabel(stage = '') {
  const value = String(stage || '');
  if (/未接触|线索/.test(value)) return '未接触';
  if (/已接触|洽谈|沟通/.test(value)) return '已接触';
  if (/有意向|意向|方案/.test(value)) return '有意向';
  if (/待报价|报价/.test(value)) return '待报价';
  if (/待成交|商务|谈判|合同/.test(value)) return '待成交';
  if (/已成交|成交|维护/.test(value)) return '已成交';
  return '未接触';
}

function opportunityScore(card) {
  return Number(card?.quality?.total ?? card?.score ?? String(card?.match ?? '').match(/\d+/)?.[0] ?? 60);
}

function qualityValue(card, key) {
  return Number(card?.quality?.[key] ?? 3);
}

function relatedTaskCount(customer, tasks = []) {
  return tasks.filter((task) => task.relatedCustomerId === customer.id || String(task.title).includes(customer.name) || String(task.next).includes(customer.name)).length;
}

function relatedQuoteCount(customer, quotes = []) {
  return quotes.filter((quote) => quote.customer === customer.name || quote.relatedCustomerId === customer.id).length;
}

function relatedOpportunityCount(customer, opportunities = []) {
  return opportunities.filter((item) => String(item.title).includes(customer.name) || String(item.why).includes(customer.name)).length;
}

function recommendOwnerFromOpportunity(card = {}) {
  const text = `${card.title ?? ''} ${card.why ?? ''}`;
  if (/材料|合金|靶材|高熵|难熔/.test(text)) return 'guihua';
  if (/设备|熔炼炉|真空炉|冷坩埚|感应|电弧/.test(text)) return 'kingsong';
  if (/客户|研究院|实验室|采购|招标|预算/.test(text)) return 'luyang';
  return 'larry';
}

function artifactPreview(item) {
  return item?.title || item?.name || item?.customer || item?.type || '已生成';
}

function buildLearningDigest({ agentFeedback = [], systemOutputs = {}, tasks = [], quotes = [], customers = [], savedCards = [] }) {
  const completedTasks = tasks.filter((task) => ['done', 'closed'].includes(task.status)).length;
  const internalLearnings = systemOutputs.internal?.filter((item) => item.learning).length ?? 0;
  const usefulFeedback = agentFeedback.filter((item) => item.rating === 'useful').length;
  const improvementFeedback = agentFeedback.filter((item) => item.rating && item.rating !== 'useful').length;
  return [
    {
      title: '个人助理',
      text: usefulFeedback || improvementFeedback
        ? `已收到 ${usefulFeedback} 条有用反馈、${improvementFeedback} 条改进反馈。`
        : '先从一次真实客户问题或会议纪要开始学习。'
    },
    {
      title: '任务/客户/报价 Agent',
      text: `当前沉淀 ${tasks.length} 个任务、${customers.length} 个客户、${quotes.length} 个报价草案。`
    },
    {
      title: '内部信息 Agent',
      text: `已吸收 ${completedTasks} 个任务结果和 ${internalLearnings} 条知识复盘。`
    },
    {
      title: '外部机会 Agent',
      text: savedCards.length ? `你已收藏 ${savedCards.length} 条线索，可继续带回对话分析。` : '收藏外部线索后，会自动进入个人助理和业务流程。'
    }
  ];
}

function getWorkspaceDailyLine(coworker) {
  const lines = [
    '今天把一个真实问题丢给我，我会帮你把它变成下一步行动。',
    '有客户问题、现场照片或会议纪要，都可以先放进来，我来帮你抓重点。',
    '今天遇到的小麻烦，可能就是团队下一条有价值的商机线索。',
    '不用想好怎么问，先把原始信息发给我，我们一起把它整理清楚。',
    '把今天最占脑子的那件事交给我，我会帮你拆成可执行的步骤。'
  ];
  const dayKey = Math.floor(Date.now() / 86400000);
  return lines[(dayKey + coworker.id.length) % lines.length];
}

function makeReply(text, coworker, model, savedCards = [], conversationContext = []) {
  const lastUserQuestion = [...conversationContext].reverse().find((message) => message.from === 'user')?.text ?? '';
  const asksForBetterAnswer = /不对|不正确|没回答|重新回答|换个回答|什么意思|没听懂|不满意/.test(text);
  if (asksForBetterAnswer) {
    return [
      '你说得对，刚才那个回答没有真正回答问题。我应该先判断你要的是“系统怎么更好服务同事”，而不是把这句话机械归档。',
      '更好的回答是：',
      '1. 同事入口要更像工作助手，而不是后台系统。每个人打开后只看到自己的任务、对话、收藏商机和需要反馈的广播。',
      '2. Agent 要先解决当下问题：把客户问题转成报价草稿、把会议纪要转成分工、把技术问题转成排查步骤，而不是只说“我会记录”。',
      '3. 组织学习要在后台发生：同事不需要理解内部信息 Agent，系统自动把高价值问答沉淀成材料专家、设备专家、报价知识卡。',
      '4. Jamie 的管理页只做三件事：看成本和模型、看权限和移交、审批哪些知识可以广播给大家。',
      '5. 下一版最该补的是“真实大模型回复 + 最近对话上下文 + 可追踪任务卡”。这样同事才会觉得它是在帮忙工作，而不是一个演示页面。',
      lastUserQuestion ? `我重新回答的是你前面这句：“${lastUserQuestion}”。` : ''
    ]
      .filter(Boolean)
      .join('\n\n');
  }
  if (/系统|平台|企业OS|更好|服务|同事|同志|怎么做|如何做/.test(text)) {
    return [
      '要让企业OS更好地服务同事，重点不是堆功能，而是让每次交流都变成可执行结果。',
      '1. 对同事：聊天后直接生成下一步动作，比如客户跟进、报价准备、技术确认、资料补充，而不是只回复一段话。',
      '2. 对 Jamie：把全员信息自动汇总成“今日风险、今日商机、待审批知识、模型成本”四个看板。',
      '3. 对组织：内部信息 Agent 不展示原始隐私聊天给其他同事，只抽象出材料专家、设备专家、报价话术这些可复用资产。',
      '4. 对商机：外部机会 Agent 不是简单放新闻，而是按公司能力匹配，提示谁适合跟、怎么开口、需要哪些技术资料。',
      `5. 对全员试用：让 ${teammates.map((item) => item.name).join('、')} 都围绕自己的真实工作输入信息，系统再从全员信息流里沉淀商机、任务和专家资产。`
    ].join('\n\n');
  }
  if (/报价|航天|阀门|设备/.test(text)) {
    return [
      '我先按报价工作流处理，不只是聊天回复。',
      '1. 客户与场景：先确认采购单位、应用工况、预算范围、交付时间和是否有招标节点。',
      '2. 技术参数：补齐材料体系、温度/真空度、单炉重量、批次、检测要求和验收标准。',
      '3. 报价边界：区分设备整机、熔炼服务、材料试制或组合方案，避免直接给出不完整价格。',
      '4. 下一步：我会同步生成报价草案、客户跟进任务和需要确认的参数清单；正式报价前交给 Larry/Jamie 审核。'
    ].join('\n\n');
  }
  if (/悬浮|真空|熔炼|新型金属|金属材料|材料|市场/.test(text)) {
    return [
      '我先按“材料专家 + 市场开发助理”的方式处理，不只是记录这句话。',
      '1. 目标客户：优先找高校/研究院材料实验室、航空航天材料团队、金属粉末/增材制造企业、特种合金小试线。这些客户更可能需要悬浮真空熔炼设备，或需要新型金属材料研发能力。',
      '2. 核心卖点：不要先卖设备，先卖“高纯熔炼、少污染、适合活泼/难熔金属、小批量研发验证、工艺参数可沉淀”。',
      '3. 线索动作：本周整理 30 个潜在客户，按“已有材料课题、是否采购设备、是否有中试需求、联系人清晰度”打分。',
      '4. 对外打法：先提供材料试制或工艺验证，再推进设备方案；这样客户决策门槛更低，也更容易发现真实预算。',
      `5. 我会把这条需求沉淀成 ${coworker.agent} 的私密市场开发任务，并同步给内部信息 Agent 提炼“材料专家资产”。当前用 ${model.label}，如果要写正式客户方案，建议临时升到均衡或强模型。`
    ].join('\n\n');
  }
  if (/商机|收藏|机会/.test(text)) {
    const saved = savedCards.length ? `当前已收藏 ${savedCards.length} 条雷达线索，我会优先匹配这些线索。` : '你还没有收藏雷达线索，我会先基于当前问题做初步判断。';
    return `${saved} 商机判断会只保留在 ${coworker.agent} 私密空间里，并抽象成不暴露原文的专家资产给内部信息 Agent。`;
  }
  return `收到。我会把这条信息放入 ${coworker.agent} 的私密上下文，先提取“客户、需求、参数、风险、下一步动作”五类要素，再把可复用经验抽象给内部信息 Agent。`;
}

function estimateTokens(text) {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const words = (text.replace(/[\u4e00-\u9fff]/g, ' ').match(/[A-Za-z0-9_]+/g) ?? []).length;
  return Math.max(1, Math.ceil(cjk * 0.75 + words * 1.25));
}

function formatMessageWithAttachments(text, attachments = []) {
  if (!attachments.length) return text;
  const files = attachments.map((file) => `- ${file.name}（${file.type}，${formatFileSize(file.size)}）`).join('\n');
  return `${text}\n\n[上传附件]\n${files}`;
}

const MAX_EMBEDDED_ATTACHMENT_BYTES = 2 * 1024 * 1024;

function canEmbedFile(file, type = '') {
  const name = file.name.toLowerCase();
  return (
    file.size <= MAX_EMBEDDED_ATTACHMENT_BYTES &&
    (type.includes('pdf') || type.startsWith('text/') || /\.(txt|md|csv)$/i.test(name))
  );
}

function inferFileType(name = '') {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.md')) return 'text/markdown';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.txt')) return 'text/plain';
  return '未知类型';
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function stripAttachmentPayload(file) {
  const { dataUrl, ...rest } = file;
  return rest;
}

function formatFileSize(size = 0) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${size} B`;
}

createRoot(document.getElementById('root')).render(<App />);
