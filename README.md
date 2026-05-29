# 企业OS

一个从“能跑”开始的企业 Agent 助手 MVP。设计重点不是先定义复杂架构，而是让企业内部信息持续流动、加工、分发，再从信息流里长出运作方式。

## 第一版范围

- 四页 UI 架构：同事桌面、内部信息流动仓、外部商机雷达看板、Jamie 小团队试用控制台
- 登录和注册模块：同事可登录自己的工作台，新同事可创建账号和默认 Agent
- 给每位同事配置一个个人 Agent，支持文字和语音输入入口
- 默认同事/Agent：Jamie、Larry、Gu、Xiaodong、Heli、Guihua、Zhiping、Luyang、Kingsong
- Agent 当前使用人姓名可修改，方便离职后转交给新同事
- 每个个人 Agent 可选择不同模型：简单工作用便宜模型，复杂判断用更强模型
- 每个 Agent 可选择模型平台与具体模型：Claude、GPT、OpenRouter 都可作为路由目标
- 内部信息 Agent 默认建议 Claude Sonnet，适合长上下文归纳和专家资产沉淀
- 外部机会 Agent 默认建议 OpenRouter 路由，适合多来源线索筛选、吞吐和成本控制
- 每个 Agent 预留大模型 API 标识，并统计调用次数、输入 token、输出 token 和预估成本
- 同事与个人 Agent 的原始聊天对其他同事保持私密
- 内部信息 Agent 作为系统级 Agent 可以读取原始聊天，加工成对各同事有价值的信息，再通过各自助手分发
- 同事离职时可中止其访问权限，助手 Agent 的工作记忆、收藏和上下文可移交给下个同事
- 外部机会 Agent 根据企业内部需求，全网寻找对公司发展有价值的信息或商机，并做成可收藏看板
- 同事收藏外部信息后，可以在自己的助手对话里一键继续分析，形成商机判断和下一步动作
- 内部信息 Agent 与外部机会 Agent 持续学习，逐步沉淀为材料专家和设备专家
- 网页端优先，兼容电脑和手机访问

## 固定 Agent 分工

系统 Agent 固定为以下几个，不再让一个 Agent 同时承担多个流程职责：

| Agent | 固定职责 | 边界 |
| --- | --- | --- |
| 个人助理 Agent | 每位同事一个，负责私密交流、上传纪要、获得个人工作帮助 | 不替代系统 Agent 管理组织流程 |
| 外部机会 Agent | 扫描行业、招标、新闻，输出外部线索和商机评分 | 不维护客户阶段、不生成报价、不分配任务 |
| 客户管理 Agent | 维护客户阶段、负责人、联系人和下一步跟进建议 | 不扫描外部网站、不生成报价金额 |
| 任务看板 Agent | 从对话、会议纪要、广播反馈和商机收藏中提取、分配、跟进任务 | 不维护客户漏斗、不生成报价依据 |
| 报价 Agent | 生成报价方案、报价构成、参考依据、缺失参数和风险 | 不承诺正式对外价格 |
| 内部信息 Agent | 沉淀知识、经验、任务复盘和专家资产 | 不向普通同事暴露他人私密原始聊天 |

## 页面流转

- 同事桌面：每位同事和自己的助理 Agent 1:1 私密交流，收藏的商机会吸附到对话区继续分析
- 内部信息流动仓：系统级读取原始聊天，去除具体字句后沉淀专家资产，可定向广播给一个或多个同事，并收集反馈
- 外部商机雷达：全网线索和内部专家能力匹配，同事可一键收藏至自己的助理
- Jamie Central：Jamie 管理模型、token 成本、权限熔断、资产平移和专家资产审批

## 信息流转

外部机会 Agent 发现线索后会进入线索池并生成 AI 评分。首次收藏线索时，系统会自动把线索转入后续业务流：

```text
外部机会 Agent 发现线索
  ↓
进入线索池
  ↓
AI 评分
  ↓
推荐给相关同事
  ↓
同事收藏/反馈
  ↓
客户管理 Agent 建客户或更新客户阶段
  ↓
任务看板 Agent 生成跟进任务
  ↓
需要报价时调用报价 Agent
  ↓
报价结果沉淀到客户和知识库
  ↓
内部信息 Agent 总结成组织经验
```

重复收藏同一线索不会重复生成客户、任务或报价，避免试用过程中看板被刷乱。

## 启动

```bash
npm install
npm run dev
```

本地开发需要同时启动前端和后端：

```bash
npm run dev
npm run dev:api
```

如果登录页提示“无法连接后端 API”，通常是 `8787` 后端没有启动。

## 生产运行

```bash
cp .env.example .env
npm run build
npm start
```

默认后端端口：

```text
http://localhost:8787/
```

演示账号：

- Jamie：`jamie` / `jamie-demo`
- 其他同事：用户 id 小写，例如 `larry` / `demo`
- 新增同事：`luyang` / `demo`，`kingsong` / `demo`

## 上线后端能力

- `/api/login`：登录并返回服务端签名 token
- `/api/register`：注册普通同事，并自动创建默认个人 Agent
- `/api/state`：按权限返回应用状态；普通同事只能拿到自己的工作区
- `/api/agents/:id/chat`：保存私密聊天并记录 token usage
- `/api/agents/:id/route`：Jamie 配置个人 Agent 模型路由
- `/api/system-agents/:id/route`：Jamie 配置内部/外部系统 Agent 模型
- `/api/agents/:id/suspend`：Jamie 中止同事访问权限
- `/api/agents/:id/transfer`：Jamie 一键资产平移给新同事
- `/api/opportunities/:id/save`：同事收藏外部商机
- `/api/broadcasts`：Jamie 创建定向广播，支持工作计划、商机、专家资产
- `/api/broadcasts/:id/feedback`：同事对广播反馈收到、跟进中、需要讨论等状态
- `/api/llm/proxy`：大模型代理入口，API Key 只放后端
- `/api/obsidian/sync`：将对话、Agent 注册表、审计日志和系统 Agent 配置写入 Obsidian Markdown

## OpenRouter

线上试用时在 Render 环境变量里设置：

```text
OPENROUTER_API_KEY=<your OpenRouter key>
OPENROUTER_SITE_URL=https://timeconnector.net
OPENROUTER_APP_NAME=EnterpriseOS
```

设置后，个人 Agent 对话会由后端调用 OpenRouter 生成真实回复；没有配置 key 时会自动使用本地降级回复。

## 招标商机抓取

外部机会 Agent 可先用独立脚本抓取国内招标线索，再整理成商机池：

```bash
npm run crawl:tenders
```

默认关键词覆盖熔炼、金属材料、新材料、悬浮熔炼、冷坩埚、高温难熔金属、高熵合金、靶材等方向。输出文件会写入 `data/tender-opportunities/`，同时生成 JSON 和 Markdown。中国招标投标公共服务平台如果需要浏览器渲染，脚本会生成精确关键词核验入口，不会把未验证内容当作真实招标。

招标来源配置在 `config/tender-sources.json`。以后增加类似网站时，优先新增一条 source 配置；如果页面结构不同，再在 `server/tender-scanner.mjs` 中增加一个 adapter。扫描器会记录 `seenIds` 和最近扫描日志，用于识别新发现、去重和排查失败来源。

## Auth

- 登录 token 默认 7 天过期，可用 `SESSION_TTL_MS` 调整。
- 新注册需要团队邀请码 `INVITE_CODE`。
- 旧的演示账号首次登录后会自动把明文密码迁移为 scrypt 哈希。

## 后续最小后端

当前已经加入轻量 Express 后端和文件数据库 `data/store.json`。下一步要替换成正式数据库、真实 LLM API 调用、真实新闻抓取和生产级登录系统。
