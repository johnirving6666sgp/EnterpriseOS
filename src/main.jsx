import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Bot,
  Bookmark,
  BookmarkCheck,
  Brain,
  ChartNoAxesColumnIncreasing,
  CircleDollarSign,
  Cpu,
  Layers3,
  Mic,
  Newspaper,
  Paperclip,
  Send,
  Sparkles,
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
    id: 'internal',
    name: '内部信息 Agent',
    job: '读取小团队试用对话、提炼协作洞察、沉淀专家资产',
    defaultProvider: 'openrouter',
    defaultModel: 'openrouter/openai/gpt-4.1-mini',
    reason: '需要稳定归纳和较低试用成本，默认走 OpenRouter 的 GPT-4.1 mini；重要专家资产可临时升 GPT-4.1。'
  },
  {
    id: 'external',
    name: '外部机会 Agent',
    job: '抓取新闻和企业动态，筛选商机并匹配内部专家能力',
    defaultProvider: 'openrouter',
    defaultModel: 'openrouter/openai/gpt-4.1-mini',
    reason: '需要高吞吐、多来源路由和成本控制，默认走 OpenRouter GPT-4.1 mini；深度研判再升 GPT-4.1。'
  }
];

const teammates = [
  { id: 'jamie', name: 'Jamie', agent: 'Jamie_AI', model: 'strong', role: '小团队试用负责人' },
  { id: 'larry', name: 'Larry', agent: 'Larry_AI', model: 'balanced', role: '客户与设备现场' },
  { id: 'gu', name: 'Gu', agent: 'Gu_AI', model: 'strong', role: '工艺与设备参数' },
  { id: 'xiaodong', name: 'Xiaodong', agent: 'Xiaodong_AI', model: 'balanced', role: '项目协作' },
  { id: 'heli', name: 'Heli', agent: 'Heli_AI', model: 'lite', role: '运营支持' },
  { id: 'guihua', name: 'Guihua', agent: 'Guihua_AI', model: 'lite', role: '材料与供应' },
  { id: 'zhiping', name: 'Zhiping', agent: 'Zhiping_AI', model: 'strong', role: '设备选型' }
];

const recommendedAgentRoutes = {
  jamie: { modelTier: 'strong', provider: 'openrouter', apiModel: 'openrouter/openai/gpt-4.1' },
  larry: { modelTier: 'balanced', provider: 'openrouter', apiModel: 'openrouter/openai/gpt-4.1-mini' },
  gu: { modelTier: 'strong', provider: 'openrouter', apiModel: 'openrouter/openai/gpt-4.1' },
  xiaodong: { modelTier: 'balanced', provider: 'openrouter', apiModel: 'openrouter/openai/gpt-4.1-mini' },
  heli: { modelTier: 'lite', provider: 'openrouter', apiModel: 'openrouter/anthropic/claude-3.5-haiku' },
  guihua: { modelTier: 'balanced', provider: 'openrouter', apiModel: 'openrouter/openai/gpt-4.1-mini' },
  zhiping: { modelTier: 'strong', provider: 'openrouter', apiModel: 'openrouter/openai/gpt-4.1' }
};

const recommendedSystemRoutes = {
  internal: { provider: 'openrouter', apiModel: 'openrouter/openai/gpt-4.1-mini' },
  external: { provider: 'openrouter', apiModel: 'openrouter/openai/gpt-4.1-mini' }
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
  zhiping: [{ from: 'agent', text: '我会用强模型帮你处理复杂设备选型和专家级判断。' }]
};

const opportunitySeed = [
  {
    id: 'aerospace-valve',
    title: '某航天厂急需高压阀门',
    source: '招投标 / 企业新闻',
    match: '设备专家能力匹配 92%',
    why: '需求涉及高压阀门、快速报价、可靠交付，和内部设备经验高度相关。',
    action: '收藏后让个人助理生成设备报价方案。'
  },
  {
    id: 'nuclear-valve',
    title: '4代核电阀门参数讨论升温',
    source: '行业论坛 / 技术文章',
    match: '阀门专家资产匹配 87%',
    why: 'Gu_AI 近期沉淀了大量阀门参数问答，可转化为系统级专家资产。',
    action: '推送给设备专家学习，并广播给全员助理。'
  },
  {
    id: 'material-price',
    title: '耐腐蚀合金材料价格波动',
    source: '供应链新闻',
    match: '材料专家能力匹配 81%',
    why: '材料价格变化会影响报价策略和客户采购时机。',
    action: '收藏后让材料相关同事判断替代方案。'
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
  const [page, setPage] = useState('workspace');
  const [workspaceId, setWorkspaceId] = useState(auth.user.role === 'super_admin' ? 'larry' : auth.user.id);
  const [messagesByUser, setMessagesByUser] = useState(baseMessages);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [thinkingByUser, setThinkingByUser] = useState({});
  const [listening, setListening] = useState(false);
  const [savedByUser, setSavedByUser] = useState({ larry: ['aerospace-valve'] });
  const [broadcasted, setBroadcasted] = useState([]);
  const [systemOutputs, setSystemOutputs] = useState({ internal: [], external: [] });
  const [generatedOpportunities, setGeneratedOpportunities] = useState([]);
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

  const isJamie = auth.user.role === 'super_admin';
  const visibleTeammates = isJamie ? teammates : teammates.filter((item) => item.id === auth.user.id);
  const visiblePage = isJamie ? page : page === 'commander' ? 'workspace' : page;
  const coworker = teammates.find((item) => item.id === workspaceId) ?? teammates[1];
  const access = accessByUser[workspaceId] ?? { active: true, ownerName: coworker.name };
  const model = getModel(modelByUser[workspaceId]);
  const route = routeByUser[workspaceId] ?? { provider: 'claude', apiModel: model.apiModel };
  const messages = messagesByUser[workspaceId] ?? [];
  const isThinking = thinkingByUser[workspaceId] === true;
  const usage = usageByUser[workspaceId] ?? { calls: 0, input: 0, output: 0, cost: 0 };
  const allOpportunities = [...generatedOpportunities, ...opportunitySeed];
  const allInsightCards = [...(systemOutputs.internal ?? []), ...insightCards];
  const savedCards = allOpportunities.filter((item) => (savedByUser[workspaceId] ?? []).includes(item.id));
  const inboxBroadcasts = broadcasts.filter((item) => item.recipients.includes(workspaceId));
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
        setSystemOutputs({ internal: [], external: [], ...(state.systemAgentOutputs ?? {}) });
        setGeneratedOpportunities(state.generatedOpportunities ?? []);
        setSavedByUser(state.savedOpportunities ?? {});
        setBroadcasts(state.broadcasts ?? []);
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
    if ((!text && attachments.length === 0) || !access.active || isThinking) return;
    const id = workspaceId;
    const attachedFiles = attachments;
    const messageText = text || '请分析我上传的附件。';
    const displayText = formatMessageWithAttachments(messageText, attachedFiles);
    const thinkingId = `thinking-${Date.now()}`;
    setThinkingByUser((current) => ({ ...current, [id]: true }));
    setMessagesByUser((current) => ({
      ...current,
      [id]: [
        ...(current[id] ?? []),
        { from: 'user', text: displayText, attachments: attachedFiles },
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

  const addAttachments = (files) => {
    const incoming = Array.from(files ?? []).slice(0, 8).map((file, index) => ({
      id: `${file.name}-${file.size}-${Date.now()}-${index}`,
      name: file.name,
      size: file.size,
      type: file.type || '未知类型'
    }));
    if (!incoming.length) return;
    setAttachments((current) => [...current, ...incoming].slice(0, 8));
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

  const startVoice = () => {
    if (!SpeechRecognition || !access.active || voiceActiveRef.current) return;
    voiceActiveRef.current = true;
    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onstart = () => setListening(true);
    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join('');
      setDraft(text);
    };
    recognition.onend = () => {
      voiceActiveRef.current = false;
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopVoice = () => {
    if (!voiceActiveRef.current) return;
    voiceActiveRef.current = false;
    recognitionRef.current?.stop();
    setListening(false);
  };

  const saveOpportunity = (id) => {
    setSavedByUser((current) => {
      const existing = current[workspaceId] ?? [];
      return existing.includes(id) ? current : { ...current, [workspaceId]: [...existing, id] };
    });
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
      })
      .catch(() => {});
  };

  return (
    <main className="app-shell">
      <header className="app-top">
        <div>
          <p className="eyebrow">ClawOS Enterprise MVP</p>
          <h1>从私密助理到组织记忆，再到外部商机雷达</h1>
        </div>
        <nav className="top-nav" aria-label="页面导航">
          <button className={visiblePage === 'workspace' ? 'active' : ''} onClick={() => setPage('workspace')}>
            同事桌面
          </button>
          <button className={visiblePage === 'insight' ? 'active' : ''} onClick={() => setPage('insight')}>
            内部信息仓
          </button>
          <button className={visiblePage === 'opportunity' ? 'active' : ''} onClick={() => setPage('opportunity')}>
            商机雷达
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
          savedCards={savedCards}
          selectedId={workspaceId}
          isJamie={isJamie}
          discussionTeammates={teammates}
          visibleTeammates={visibleTeammates}
          setDraft={setDraft}
          setWorkspaceId={setWorkspaceId}
          startVoice={startVoice}
          stopVoice={stopVoice}
          sendMessage={sendMessage}
          clearConversation={clearConversation}
          analyzeSaved={analyzeSaved}
          addAttachments={addAttachments}
          removeAttachment={removeAttachment}
          submitFeedback={submitFeedback}
        />
      )}

      {visiblePage === 'insight' && (
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

function CoworkerWorkspace({
  access,
  analyzeSaved,
  addAttachments,
  attachments,
  coworker,
  discussionTeammates,
  draft,
  listening,
  messages,
  isThinking,
  broadcasts,
  savedCards,
  selectedId,
  isJamie,
  visibleTeammates,
  setDraft,
  setWorkspaceId,
  startVoice,
  stopVoice,
  sendMessage,
  clearConversation,
  removeAttachment,
  submitFeedback
}) {
  const uploadInputId = `upload-${selectedId}`;
  const [discussionDraft, setDiscussionDraft] = useState({ broadcastId: '', discussWith: [], note: '' });

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
            <button onClick={clearConversation} disabled={isThinking}>清空对话</button>
          </div>
        </div>
        <div className="message-stream">
          {messages.length ? (
            messages.map((message, index) => (
              <div className={`message ${message.from} ${message.thinking ? 'thinking' : ''}`} key={message.id ?? `${message.from}-${index}`}>
                {message.text}
              </div>
            ))
          ) : (
            <WorkspaceStarter coworker={coworker} />
          )}
        </div>
        <div className="voice-composer">
          <div className="composer-input-row">
            <input
              value={draft}
              disabled={!access.active || isThinking}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') sendMessage();
              }}
              placeholder={isThinking ? 'Agent 正在思考中...' : '说出现场信息、客户问题或报价想法...'}
            />
            <button className="send-button" onClick={sendMessage} disabled={!access.active || isThinking}>
              <Send size={18} />
            </button>
          </div>
          {attachments.length > 0 && (
            <div className="attachment-preview">
              {attachments.map((file) => (
                <span className="attachment-chip" key={file.id}>
                  <Paperclip size={14} />
                  {file.name}
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
              disabled={!access.active || isThinking}
            >
              <Mic size={20} />
              {listening ? '松开结束' : '按住说话'}
            </button>
            <label className={`upload-button ${!access.active || isThinking ? 'disabled' : ''}`} htmlFor={uploadInputId}>
              <Paperclip size={18} />
              上传文件/图片
              <input
                id={uploadInputId}
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md"
                disabled={!access.active || isThinking}
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
        <Metric label="助理 Agent" value="7" />
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

function OpportunityBoard({ opportunities, savedIds, saveOpportunity, workspaceName, runExternalAgent, running }) {
  return (
    <section className="opportunity-page">
      <div className="radar-hero">
        <p className="eyebrow">External Opportunity Board</p>
        <h2>全网行业线索 ──► AI 匹配内部专家能力 ──► 收藏至我的助理</h2>
        <span>商业绿色雷达 · 当前收藏目标：{workspaceName} 的助理</span>
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
              {card.urgency && <p className="urgency-note">紧急度：{card.urgency}</p>}
              {card.action && <p className="action-note">{card.action}</p>}
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
  modelByUser,
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
      '5. 对全员试用：让 Jamie、Larry、Gu、Xiaodong、Heli、Guihua、Zhiping 都围绕自己的真实工作输入信息，系统再从全员信息流里沉淀商机、任务和专家资产。'
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
  if (/报价|航天|阀门|设备/.test(text)) {
    return `我先把它拆成四件事：客户应用场景、关键设备参数、报价风险、下一步沟通提纲。当前用${model.label}（${model.short}）可以做初筛；如果要形成正式报价方案，建议 Jamie 临时切到强模型。`;
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

function formatFileSize(size = 0) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${size} B`;
}

createRoot(document.getElementById('root')).render(<App />);
