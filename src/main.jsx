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
  Send,
  ShieldCheck,
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
    models: ['openrouter/anthropic/claude-3.7-sonnet', 'openrouter/openai/gpt-4.1', 'openrouter/meta-llama/llama-3.3-70b']
  }
];

const systemAgents = [
  {
    id: 'internal',
    name: '内部信息 Agent',
    job: '读取原始聊天、提炼组织洞察、沉淀专家资产',
    defaultProvider: 'claude',
    defaultModel: 'claude-3-7-sonnet',
    reason: '需要长上下文、稳定归纳和较强推理，默认用 Sonnet；发布专家资产前可临时升 Opus。'
  },
  {
    id: 'external',
    name: '外部机会 Agent',
    job: '抓取新闻和企业动态，筛选商机并匹配内部专家能力',
    defaultProvider: 'openrouter',
    defaultModel: 'openrouter/openai/gpt-4.1',
    reason: '需要高吞吐、多来源路由和成本控制，默认走 OpenRouter；深度研判再交给强模型。'
  }
];

const teammates = [
  { id: 'jamie', name: 'Jamie', agent: 'Jamie_AI', model: 'strong', role: '系统最高权限' },
  { id: 'larry', name: 'Larry', agent: 'Larry_AI', model: 'balanced', role: '客户与设备现场' },
  { id: 'gu', name: 'Gu', agent: 'Gu_AI', model: 'strong', role: '工艺与设备参数' },
  { id: 'xiaodong', name: 'Xiaodong', agent: 'Xiaodong_AI', model: 'balanced', role: '项目协作' },
  { id: 'heli', name: 'Heli', agent: 'Heli_AI', model: 'lite', role: '运营支持' },
  { id: 'guihua', name: 'Guihua', agent: 'Guihua_AI', model: 'lite', role: '材料与供应' },
  { id: 'zhiping', name: 'Zhiping', agent: 'Zhiping_AI', model: 'strong', role: '设备选型' }
];

const baseMessages = {
  jamie: [{ from: 'agent', text: '我负责帮你监控全局成本、权限、模型和专家资产。' }],
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
  const [thinkingByUser, setThinkingByUser] = useState({});
  const [listening, setListening] = useState(false);
  const [savedByUser, setSavedByUser] = useState({ larry: ['aerospace-valve'] });
  const [broadcasted, setBroadcasted] = useState([]);
  const [broadcasts, setBroadcasts] = useState([
    {
      id: 'bc-plan-larry-gu',
      type: '工作计划',
      title: '高压阀门报价准备',
      content: 'Larry 负责客户场景确认，Gu 补充关键设备参数，明天形成一页报价草案。',
      recipients: ['larry', 'gu'],
      feedback: {}
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
    Object.fromEntries(teammates.map((item) => [item.id, { active: item.id !== 'zhiping', ownerName: item.name }]))
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
  const savedCards = opportunitySeed.filter((item) => (savedByUser[workspaceId] ?? []).includes(item.id));
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
        if (!response.ok) throw new Error('state_load_failed');
        return response.json();
      })
      .then((state) => {
        if (!alive) return;
        const usersById = Object.fromEntries((state.users ?? []).map((user) => [user.id, user]));
        const agentEntries = Object.entries(state.agents ?? {});

        setMessagesByUser({ ...baseMessages, ...(state.conversations ?? {}) });
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
  }, [auth.token]);

  const sendMessage = () => {
    const text = draft.trim();
    if (!text || !access.active || isThinking) return;
    const id = workspaceId;
    const thinkingId = `thinking-${Date.now()}`;
    setThinkingByUser((current) => ({ ...current, [id]: true }));
    setMessagesByUser((current) => ({
      ...current,
      [id]: [...(current[id] ?? []), { from: 'user', text }, { id: thinkingId, from: 'agent', text: '思考中...', thinking: true }]
    }));
    setDraft('');

    window.setTimeout(() => {
      const reply = makeReply(text, coworker, model, savedCards);
      setMessagesByUser((current) => ({
        ...current,
        [id]: (current[id] ?? []).map((message) =>
          message.id === thinkingId ? { from: 'agent', text: reply } : message
        )
      }));
      recordUsage(id, text, reply);
      setThinkingByUser((current) => ({ ...current, [id]: false }));
      apiFetch(`/api/agents/${id}/chat`, {
        method: 'POST',
        body: JSON.stringify({ message: text, reply })
      }).catch(() => {});
    }, 650);
  };

  const appendConversation = (id, userText, agentText) => {
    setMessagesByUser((current) => ({
      ...current,
      [id]: [...(current[id] ?? []), { from: 'user', text: userText }, { from: 'agent', text: agentText }]
    }));
    recordUsage(id, userText, agentText);
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
    setRouteByUser((current) => ({
      ...current,
      [id]: { ...(current[id] ?? { provider: 'claude' }), apiModel: getModel(modelId).apiModel }
    }));
  };

  const setRoute = (id, patch) => {
    setRouteByUser((current) => {
      const previous = current[id] ?? { provider: 'claude', apiModel: getModel(modelByUser[id]).apiModel };
      const nextProvider = patch.provider ?? previous.provider;
      const provider = providerOptions.find((item) => item.id === nextProvider) ?? providerOptions[0];
      const nextModel = patch.provider ? provider.models[0] : patch.apiModel ?? previous.apiModel;
      return {
        ...current,
        [id]: { provider: nextProvider, apiModel: nextModel }
      };
    });
  };

  const setSystemRoute = (id, patch) => {
    setRouteBySystem((current) => {
      const agent = systemAgents.find((item) => item.id === id) ?? systemAgents[0];
      const previous = current[id] ?? { provider: agent.defaultProvider, apiModel: agent.defaultModel };
      const nextProvider = patch.provider ?? previous.provider;
      const provider = providerOptions.find((item) => item.id === nextProvider) ?? providerOptions[0];
      return {
        ...current,
        [id]: {
          provider: nextProvider,
          apiModel: patch.provider ? provider.models[0] : patch.apiModel ?? previous.apiModel
        }
      };
    });
  };

  const createBroadcast = ({ type, title, content, recipients }) => {
    const cleanRecipients = recipients.filter(Boolean);
    if (!title.trim() || !content.trim() || !cleanRecipients.length) return;
    setBroadcasts((current) => [
      {
        id: `bc-${Date.now()}`,
        type,
        title: title.trim(),
        content: content.trim(),
        recipients: cleanRecipients,
        feedback: {}
      },
      ...current
    ]);
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

  const submitFeedback = (broadcastId, status) => {
    setBroadcasts((current) =>
      current.map((item) =>
        item.id === broadcastId
          ? { ...item, feedback: { ...item.feedback, [workspaceId]: { status, at: new Date().toLocaleString() } } }
          : item
      )
    );
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
          <button onClick={onLogout}>退出登录</button>
        </nav>
      </header>

      {visiblePage === 'workspace' && (
        <CoworkerWorkspace
          access={access}
          coworker={coworker}
          draft={draft}
          listening={listening}
          messages={messages}
          model={model}
          isThinking={isThinking}
          route={route}
          broadcasts={inboxBroadcasts}
          savedCards={savedCards}
          selectedId={workspaceId}
          isJamie={isJamie}
          visibleTeammates={visibleTeammates}
          setDraft={setDraft}
          setModel={setModel}
          setRoute={setRoute}
          setWorkspaceId={setWorkspaceId}
          startVoice={startVoice}
          stopVoice={stopVoice}
          sendMessage={sendMessage}
          usage={usage}
          analyzeSaved={analyzeSaved}
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
        />
      )}

      {visiblePage === 'opportunity' && (
        <OpportunityBoard
          opportunities={opportunitySeed}
          savedIds={savedByUser[workspaceId] ?? []}
          saveOpportunity={saveOpportunity}
          workspaceName={access.ownerName}
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
  coworker,
  draft,
  listening,
  messages,
  model,
  isThinking,
  route,
  broadcasts,
  savedCards,
  selectedId,
  isJamie,
  visibleTeammates,
  setDraft,
  setModel,
  setRoute,
  setWorkspaceId,
  startVoice,
  stopVoice,
  sendMessage,
  submitFeedback,
  usage
}) {
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
          <strong>{coworker.agent}</strong>
        </div>
        <div className="privacy-banner">
          <ShieldCheck size={17} />
          {isJamie
            ? 'Jamie 可审查组织学习链路；普通同事只能进入自己的私密空间。'
            : '这是你的私密工作区，其他同事不能进入；内部信息 Agent 只在系统底层做组织学习。'}
        </div>
        <div className="message-stream">
          {messages.map((message, index) => (
            <div className={`message ${message.from} ${message.thinking ? 'thinking' : ''}`} key={message.id ?? `${message.from}-${index}`}>
              {message.text}
            </div>
          ))}
        </div>
        <div className="voice-composer">
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
            disabled={!access.active}
          >
            <Mic size={22} />
            {listening ? '松开结束' : '按住说话'}
          </button>
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
                      onClick={() => submitFeedback(item.id, status)}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </article>
            ))
          ) : (
            <p>内部信息 Agent 或 Jamie 发来的计划、商机会出现在这里。</p>
          )}
        </div>
      </section>

      <aside className="panel model-capsule">
        <h2>模型与成本</h2>
        {isJamie ? (
          <select value={model.id} onChange={(event) => setModel(selectedId, event.target.value)}>
            {modelOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} · {item.short}
              </option>
            ))}
          </select>
        ) : null}
        <div className="capsule">{model.label} · {model.short}</div>
        <div className="route-card">
          {isJamie ? (
            <>
              <label htmlFor="provider">模型平台</label>
              <select id="provider" value={route.provider} onChange={(event) => setRoute(selectedId, { provider: event.target.value })}>
                {providerOptions.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.label}
                  </option>
                ))}
              </select>
              <label htmlFor="apiModel">具体模型</label>
              <select id="apiModel" value={route.apiModel} onChange={(event) => setRoute(selectedId, { apiModel: event.target.value })}>
                {(providerOptions.find((item) => item.id === route.provider) ?? providerOptions[0]).models.map((apiModel) => (
                  <option key={apiModel} value={apiModel}>
                    {apiModel}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <p className="route-readonly">
              模型由 Jamie 统一配置：{route.provider} / {route.apiModel}
            </p>
          )}
        </div>
        <div className="cost-card">
          <span>今日调用</span>
          <strong>{usage.calls}</strong>
          <span>Token</span>
          <strong>{usage.input + usage.output}</strong>
          <span>预估成本</span>
          <strong>${usage.cost.toFixed(2)}</strong>
        </div>
      </aside>
    </section>
  );
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ userId: 'jamie', name: '', password: 'jamie-demo' });
  const [status, setStatus] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setStatus('正在提交...');
    const endpoint = mode === 'login' ? '/api/login' : '/api/register';
    const body =
      mode === 'login'
        ? { userId: form.userId.trim().toLowerCase(), password: form.password }
        : { name: form.name.trim(), userId: form.userId.trim().toLowerCase(), password: form.password };

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
        : error.message;
      setStatus(`失败：${message}`);
    }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setStatus('');
    setForm((current) => ({
      ...current,
      userId: nextMode === 'login' ? 'jamie' : '',
      password: nextMode === 'login' ? 'jamie-demo' : ''
    }));
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">EnterpriseOS</p>
        <h1>{mode === 'login' ? '登录你的 Agent 工作台' : '注册新的同事 Agent'}</h1>
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
              <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
          )}
          <label>
            用户 ID
            <input value={form.userId} onChange={(event) => setForm((current) => ({ ...current, userId: event.target.value }))} />
          </label>
          <label>
            密码
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            />
          </label>
          <button className="auth-submit" type="submit">
            {mode === 'login' ? '登录' : '创建账号和 Agent'}
          </button>
        </form>
        <p className="auth-hint">
          演示账号：Jamie 使用 `jamie / jamie-demo`，其他同事可用 `larry / demo`。
        </p>
        {status && <div className="auth-status">{status}</div>}
      </section>
    </main>
  );
}

function InsightAgent({ broadcasted, broadcasts, createBroadcast, messagesByUser, sendInsightBroadcast, totalUsage }) {
  const eventCount = Object.values(messagesByUser).flat().length;
  const [draft, setDraft] = useState({
    type: '工作计划',
    title: '本周商机跟进',
    content: '请相关同事根据收藏商机补充客户背景、设备参数和报价风险。',
    recipients: ['larry', 'gu']
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
          <Sparkles size={23} />
        </div>
        <div className="insight-wall">
          {insightCards.map((card) => {
            const isPublished = broadcasted.includes(card.id);
            return (
              <article className="insight-card" key={card.id}>
                <small>{card.source}</small>
                <h3>💡 {card.title}</h3>
                <p>{card.text}</p>
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
          {broadcasts.slice(0, 4).map((item) => (
            <article key={item.id}>
              <strong>{item.title}</strong>
              <span>{item.recipients.length} 位收件人</span>
              <p>
                {Object.entries(item.feedback).length
                  ? Object.entries(item.feedback)
                      .map(([id, feedback]) => `${id}: ${feedback.status}`)
                      .join(' · ')
                  : '等待反馈'}
              </p>
            </article>
          ))}
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

function OpportunityBoard({ opportunities, savedIds, saveOpportunity, workspaceName }) {
  return (
    <section className="opportunity-page">
      <div className="radar-hero">
        <p className="eyebrow">External Opportunity Board</p>
        <h2>全网行业线索 ──► AI 匹配内部专家能力 ──► 收藏至我的助理</h2>
        <span>商业绿色雷达 · 当前收藏目标：{workspaceName} 的助理</span>
      </div>
      <div className="masonry-board">
        {opportunities.map((card) => {
          const saved = savedIds.includes(card.id);
          return (
            <article className="radar-card" key={card.id}>
              <small>{card.source}</small>
              <h3>{card.title}</h3>
              <p>{card.why}</p>
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
        <p className="eyebrow">Jamie 系统最高权限</p>
        <h2>全局模型、权限、成本与专家资产控制台</h2>
      </div>
      <div className="funnel-row">
        <Metric label="三家公司模型成本" value={`$${totalUsage.cost.toFixed(2)}`} />
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
                <div>{item.id === 'jamie' ? '👑 最高权限' : access.active ? '🟢 活跃中' : '🔴 已中止'}</div>
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

function makeReply(text, coworker, model, savedCards = []) {
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

createRoot(document.getElementById('root')).render(<App />);
