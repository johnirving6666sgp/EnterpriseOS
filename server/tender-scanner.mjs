import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const fallbackTenderKeywords = [
  '熔炼',
  '熔炼炉',
  '真空熔炼',
  '悬浮熔炼',
  '悬浮真空感应熔炼',
  '冷坩埚',
  '高温难熔金属',
  '高熵合金',
  '靶材',
  '金属材料',
  '新材料',
  '材料试制',
  '特种合金',
  '真空炉',
  '电弧熔炼',
  '感应熔炼'
];

const relevantPattern =
  /熔炼|熔炼炉|真空熔炼|悬浮熔炼|悬浮真空感应熔炼|冷坩埚|真空炉|电弧炉|电弧熔炼|感应炉|感应熔炼|高温炉|实验炉|难熔金属|高温难熔金属|高熵合金|靶材|金属材料|新材料|材料试制|特种合金|合金/i;

const scoreTerms = [
  ['悬浮真空感应熔炼', 28],
  ['悬浮熔炼', 24],
  ['冷坩埚', 22],
  ['高温难熔金属', 20],
  ['高熵合金', 18],
  ['靶材', 16],
  ['真空熔炼', 16],
  ['熔炼炉', 14],
  ['真空炉', 12],
  ['金属材料', 10],
  ['新材料', 10],
  ['材料试制', 10],
  ['特种合金', 10],
  ['熔炼', 8]
];

export async function loadTenderConfig(rootDir) {
  const configPath = path.join(rootDir, 'config', 'tender-sources.json');
  try {
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    return {
      keywords: Array.isArray(config.keywords) && config.keywords.length ? config.keywords : fallbackTenderKeywords,
      sources: Array.isArray(config.sources) ? config.sources.filter((source) => source.enabled !== false) : []
    };
  } catch {
    return {
      keywords: fallbackTenderKeywords,
      sources: [
        {
          id: 'qianlima',
          name: '全国招标采购信息平台',
          adapter: 'qianlima',
          baseUrl: 'https://zb.yfb.qianlima.com/yfbsemsite/mesinfo/zbpglist',
          manualFallback: false
        },
        {
          id: 'ctbpsp',
          name: '中国招标投标公共服务平台',
          adapter: 'ctbpsp',
          baseUrl: 'https://ctbpsp.com/#/bulletinList',
          manualFallback: true
        }
      ]
    };
  }
}

export async function scanTenderSources({
  rootDir,
  keywords,
  limit = 100,
  maxKeywords = Infinity,
  includeManual = true,
  scanState = {}
}) {
  const startedAt = Date.now();
  const config = await loadTenderConfig(rootDir);
  const activeKeywords = unique((keywords?.length ? keywords : config.keywords).filter(Boolean)).slice(0, maxKeywords);
  const opportunities = [];
  const warnings = [];
  const sourceStats = {};

  for (const source of config.sources) {
    sourceStats[source.id] = { source: source.name, found: 0, verified: 0, manual: 0, errors: 0 };
    const adapter = adapters[source.adapter];
    if (!adapter) {
      warnings.push(`${source.name} 没有可用 adapter：${source.adapter}`);
      sourceStats[source.id].errors += 1;
      continue;
    }
    for (const keyword of activeKeywords) {
      try {
        const rows = await adapter({ source, keyword, includeManual, today: new Date().toISOString().slice(0, 10) });
        opportunities.push(...rows);
        sourceStats[source.id].found += rows.length;
        sourceStats[source.id].verified += rows.filter((item) => !item.manual).length;
        sourceStats[source.id].manual += rows.filter((item) => item.manual).length;
      } catch (error) {
        warnings.push(`${source.name} / ${keyword} 扫描失败：${error.message}`);
        sourceStats[source.id].errors += 1;
        if (includeManual && source.manualFallback) {
          const manual = manualOpportunity({ source, keyword, today: new Date().toISOString().slice(0, 10), reason: error.message });
          opportunities.push(manual);
          sourceStats[source.id].found += 1;
          sourceStats[source.id].manual += 1;
        }
      }
    }
  }

  const sorted = dedupe(opportunities).filter(isFreshOpportunity).sort(sortOpportunities);
  const resultOpportunities = [
    ...sorted.filter((item) => !item.manual).slice(0, limit),
    ...sorted.filter((item) => item.manual)
  ];
  const previousSeen = scanState.seenIds ?? {};
  const nextSeen = { ...previousSeen };
  let newCount = 0;
  const stamped = resultOpportunities.map((item) => {
    const firstSeenAt = previousSeen[item.id] || new Date().toISOString();
    if (!previousSeen[item.id]) newCount += 1;
    nextSeen[item.id] = firstSeenAt;
    return { ...item, firstSeenAt, isNew: !previousSeen[item.id] };
  });
  const run = {
    id: `scan-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    at: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    keywords: activeKeywords,
    found: stamped.length,
    verified: stamped.filter((item) => !item.manual).length,
    manual: stamped.filter((item) => item.manual).length,
    newCount,
    sources: sourceStats,
    warnings
  };

  return {
    opportunities: stamped,
    warnings,
    run,
    scanState: {
      seenIds: pruneSeenIds(nextSeen, 1000),
      runs: [run, ...(scanState.runs ?? [])].slice(0, 30)
    }
  };
}

const adapters = {
  async qianlima({ source, keyword }) {
    const sourceUrl = `${source.baseUrl}?keywords=${encodeURIComponent(keyword)}`;
    const rows = [];
    try {
      const html = await fetchText(source.baseUrl, {
        method: 'POST',
        body: new URLSearchParams({
          pageNo: '1',
          pageSize: '15',
          pageList: '15',
          searchword: keyword,
          searchword2: keyword,
          kw: keyword,
          kwname: keyword,
          infoType: '1',
          noticeTypes: '0',
          timeType: '2',
          searchType: '2',
          firstTime: '1',
          flag: '0',
          source: 'baidu'
        })
      });
      rows.push(...parseQianlimaRows(html, keyword, source, sourceUrl));
    } catch {
      // Public GET shapes below are a fallback when POST is blocked.
    }
    if (rows.length) return rows;

    const urls = [
      `${source.baseUrl}?keywords=${encodeURIComponent(keyword)}`,
      `${source.baseUrl}?key=${encodeURIComponent(keyword)}`,
      `${source.baseUrl}?search=${encodeURIComponent(keyword)}`
    ];
    for (const url of urls) {
      const html = await fetchText(url);
      const parsed = parseQianlimaRows(html, keyword, source, url);
      if (parsed.length) return parsed;
    }
    return [];
  },

  async ctbpsp({ source, keyword, includeManual, today }) {
    const url = `${source.baseUrl}?keyWords=${encodeURIComponent(keyword)}`;
    try {
      const html = await fetchText(url);
      const rows = parseCtbpspRows(html, keyword, source, url);
      if (rows.length) return rows;
    } catch (error) {
      if (!includeManual) throw error;
    }
    return includeManual ? [manualOpportunity({ source, keyword, today, reason: '页面需要浏览器 JavaScript 渲染或存在访问限制' })] : [];
  }
};

async function fetchText(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    'User-Agent': 'Mozilla/5.0 EnterpriseOS-Tender-Agent/1.0',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7',
    Referer: url,
    ...(options.headers || {})
  };
  if (options.body instanceof URLSearchParams && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }
  try {
    const response = await fetch(url, { signal: controller.signal, ...options, headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseQianlimaRows(html, keyword, source, sourceUrl) {
  const tableRows = parseQianlimaTableRows(html, keyword, source, sourceUrl);
  if (tableRows.length) return tableRows;

  const text = normalizeText(html);
  const rows = [];
  const rowPattern = /(20\d{2}-\d{2}-\d{2})\s+([^\s]{2,12})\s+(招标|中标|拟在建项目|采购公告|招标公告)\s+([^\n]{6,180})/g;
  let match;
  while ((match = rowPattern.exec(text))) {
    const [, date, region, type, rawTitle] = match;
    const title = cleanTitle(rawTitle);
    if (!isRelevant(title)) continue;
    rows.push(toOpportunity({ title, platform: source.name, sourceId: source.id, keyword, type, region, date, url: sourceUrl }));
  }
  return rows.length ? rows : parseLooseRows(text, keyword, source, sourceUrl);
}

function parseQianlimaTableRows(html, keyword, source, sourceUrl) {
  const rows = [];
  const trPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trPattern.exec(html))) {
    const cells = [...trMatch[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => normalizeText(cell[1]).trim());
    if (cells.length < 4) continue;
    const [rawDate, region, type, ...titleParts] = cells;
    const date = normalizeDate(rawDate);
    const title = cleanTitle(titleParts.join(' '));
    if (!date || !title || !isRelevant(title)) continue;
    rows.push(toOpportunity({ title, platform: source.name, sourceId: source.id, keyword, type: cleanTitle(type) || guessTenderType(title), region: cleanTitle(region) || '待确认', date, url: sourceUrl }));
  }
  return rows;
}

function parseCtbpspRows(html, keyword, source, sourceUrl) {
  const text = normalizeText(html);
  const rows = [];
  const linePattern = /(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})?\s*([^\n]{8,160})/g;
  let match;
  while ((match = linePattern.exec(text))) {
    const [, maybeDate, rawTitle] = match;
    const title = cleanTitle(rawTitle);
    if (!isRelevant(title) || title.includes('bulletinList')) continue;
    rows.push(toOpportunity({ title, platform: source.name, sourceId: source.id, keyword, type: '招标公告', region: '全国', date: normalizeDate(maybeDate) || new Date().toISOString().slice(0, 10), url: sourceUrl }));
  }
  return rows.slice(0, 20);
}

function parseLooseRows(text, keyword, source, sourceUrl) {
  const rows = [];
  const lines = text
    .split('\n')
    .map((line) => cleanTitle(line))
    .filter((line) => line.length >= 8 && line.length <= 180 && isRelevant(line));
  for (const title of lines) {
    const index = text.indexOf(title);
    const nearby = text.slice(Math.max(0, index - 80), index + title.length + 80);
    rows.push(toOpportunity({ title, platform: source.name, sourceId: source.id, keyword, type: guessTenderType(title), region: guessRegion(nearby), date: normalizeDate(nearby.match(/20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}/)?.[0]) || '', url: sourceUrl }));
  }
  return dedupe(rows).slice(0, 30);
}

function manualOpportunity({ source, keyword, today, reason }) {
  return toOpportunity({
    title: `打开${source.name}验证：${keyword} 最新公告`,
    platform: source.name,
    sourceId: source.id,
    keyword,
    type: '招标搜索',
    region: '全国',
    date: today,
    url: `${source.baseUrl}?keyWords=${encodeURIComponent(keyword)}`,
    manual: true,
    manualReason: reason
  });
}

function toOpportunity({ title, platform, sourceId, keyword, type, region, date, url, manual = false, manualReason = '' }) {
  const score = scoreOpportunity(title, keyword, manual);
  const quality = evaluateOpportunityQuality({ title, keyword, type, date, manual, score });
  return {
    id: stableId([sourceId, keyword, title, url]),
    title,
    source: `${platform} / ${type} / ${region}`,
    platform,
    sourceId,
    keyword,
    date,
    region,
    type,
    url,
    match: manual ? '需人工打开验证' : `招标关键词匹配 ${Math.min(96, score)}%`,
    why: manual
      ? `${platform} 当前页面${manualReason || '需要浏览器渲染或存在访问限制'}，系统已保留精确关键词检索入口。`
      : `标题命中“${keyword}”及公司关注方向，可能与熔炼设备、新材料研发、金属材料试制或报价机会相关。`,
    action: manual
      ? `打开链接核验“${keyword}”最新公告；确认采购单位、技术参数、报名截止时间和联系人后再转为任务。`
      : '收藏后交给个人助理或报价 Agent 拆解客户背景、设备/服务匹配度、报价风险和下一步跟进动作。',
    urgency: manual ? '今天人工验证一次。' : '24 小时内核实公告详情、报名条件和是否需要快速报价。',
    score,
    quality,
    recommendation: quality.recommendation,
    recommendedOwner: recommendOwner(title),
    manual,
    createdAt: new Date().toISOString()
  };
}

function recommendOwner(title = '') {
  if (/材料|合金|靶材|高熵|难熔/.test(title)) return 'guihua';
  if (/设备|熔炼炉|真空炉|冷坩埚|感应|电弧/.test(title)) return 'kingsong';
  if (/预算|客户|研究院|实验室|采购|招标/.test(title)) return 'luyang';
  return 'larry';
}

function evaluateOpportunityQuality({ title, keyword, type, date, manual, score }) {
  const text = `${title} ${keyword} ${type}`;
  const days = daysSince(date);
  const demand = /招标|采购|询价|公告|项目|升级|设备|试制|实验室/.test(text) ? 4 : 2;
  const budget = /招标|采购|预算|中标|成交/.test(text) ? 4 : manual ? 2 : 3;
  const timing = days === null ? (manual ? 2 : 3) : days <= 30 ? 5 : days <= 90 ? 4 : days <= 180 ? 2 : 1;
  const advantage = /悬浮|真空|熔炼|冷坩埚|难熔|高熵|靶材|材料|合金/.test(text) ? 5 : 3;
  const total = Math.round((demand + budget + timing + advantage) * 5 + score * 0.2);
  return {
    demand,
    budget,
    timing,
    advantage,
    total: Math.max(10, Math.min(100, total)),
    recommendation:
      demand >= 4 && timing >= 4 && advantage >= 4
        ? '优先跟进：先核实采购单位、技术参数和报名截止时间。'
        : manual
          ? '人工核验：先打开来源确认是否为最新公告。'
          : '观察跟进：补充客户背景后再决定是否转报价。'
  };
}

function daysSince(date) {
  if (!date) return null;
  const value = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(value)) return null;
  return Math.floor((Date.now() - value) / 86400000);
}

function isFreshOpportunity(item) {
  if (item.manual || !item.date) return true;
  const days = daysSince(item.date);
  return days === null || days <= 90;
}

function scoreOpportunity(title, keyword, manual) {
  let score = manual ? 35 : 58;
  if (title.includes(keyword)) score += 12;
  for (const [term, points] of scoreTerms) {
    if (title.includes(term)) score += points;
  }
  if (/招标|采购|公告|项目/.test(title)) score += 6;
  if (/中标|结果|成交/.test(title)) score -= 12;
  return Math.max(10, Math.min(99, score));
}

function isRelevant(title) {
  return relevantPattern.test(title);
}

function cleanTitle(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[|｜].*$/, '')
    .replace(/^(公告|项目|标题|名称)[:：]\s*/, '')
    .trim();
}

function normalizeText(html) {
  return decodeHtml(html)
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n');
}

function decodeHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style[\s\S]*?<\/style>/gi, '\n')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function normalizeDate(value) {
  if (!value) return '';
  const match = String(value).match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (!match) return '';
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function guessTenderType(text) {
  if (/中标|成交|结果/.test(text)) return '中标';
  if (/拟在建/.test(text)) return '拟在建项目';
  if (/采购/.test(text)) return '采购公告';
  return '招标';
}

function guessRegion(text) {
  return (
    String(text).match(
      /北京|上海|天津|重庆|广东|江苏|浙江|山东|四川|河南|湖北|湖南|陕西|安徽|福建|辽宁|河北|山西|江西|广西|云南|贵州|甘肃|吉林|黑龙江|内蒙古|新疆|青海|宁夏|海南|西藏/
    )?.[0] || '待确认'
  );
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.platform}-${item.title}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortOpportunities(a, b) {
  if (a.manual !== b.manual) return a.manual ? 1 : -1;
  if (a.date !== b.date) return String(b.date || '').localeCompare(String(a.date || ''));
  return b.score - a.score;
}

function stableId(parts) {
  return `tender-${crypto.createHash('sha1').update(parts.filter(Boolean).join('|')).digest('hex').slice(0, 12)}`;
}

function unique(items) {
  return [...new Set(items)];
}

function pruneSeenIds(seenIds, maxSize) {
  const entries = Object.entries(seenIds);
  if (entries.length <= maxSize) return seenIds;
  return Object.fromEntries(entries.sort((a, b) => String(b[1]).localeCompare(String(a[1]))).slice(0, maxSize));
}
