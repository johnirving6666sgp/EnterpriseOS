# 企业OS

一个从“能跑”开始的企业 Agent 助手 MVP。设计重点不是先定义复杂架构，而是让企业内部信息持续流动、加工、分发，再从信息流里长出运作方式。

## 第一版范围

- 四页 UI 架构：同事桌面、内部信息流动仓、外部商机雷达看板、Jamie 最高权限控制台
- 给每位同事配置一个个人 Agent，支持文字和语音输入入口
- 默认同事/Agent：Jamie、Larry、Gu、Xiaodong、Heli、Guihua、Zhiping
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

## 页面流转

- 同事桌面：每位同事和自己的助理 Agent 1:1 私密交流，收藏的商机会吸附到对话区继续分析
- 内部信息流动仓：系统级读取原始聊天，去除具体字句后沉淀专家资产，可定向广播给一个或多个同事，并收集反馈
- 外部商机雷达：全网线索和内部专家能力匹配，同事可一键收藏至自己的助理
- Jamie Central：Jamie 管理模型、token 成本、权限熔断、资产平移和专家资产审批

## 启动

```bash
npm install
npm run dev
```

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

## 上线后端能力

- `/api/login`：登录并返回服务端签名 token
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

## 后续最小后端

当前已经加入轻量 Express 后端和文件数据库 `data/store.json`。下一步要替换成正式数据库、真实 LLM API 调用、真实新闻抓取和生产级登录系统。
