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
  '烧结炉',
  '脱脂烧结炉',
  '电弧熔炼',
  '感应熔炼'
];

const relevantPattern =
  /熔炼|熔炼炉|真空熔炼|悬浮熔炼|悬浮真空感应熔炼|冷坩埚|真空炉|烧结炉|脱脂烧结炉|电弧炉|电弧熔炼|感应炉|感应熔炼|高温炉|实验炉|难熔金属|高温难熔金属|高熵合金|靶材|金属材料|新材料|材料试制|特种合金|合金/i;

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
  ['脱脂烧结炉', 14],
  ['烧结炉', 12],
  ['金属材料', 10],
  ['新材料', 10],
  ['材料试制', 10],
  ['特种合金', 10],
  ['熔炼', 8]
];

const closedTenderPattern = /中标|成交|结果公告|结果公示|废标|流标|终止|失败公告|合同公告|验收公告|更正公告|变更公告/;

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
  detailLimit = 3,
  fetchTimeoutMs = 5000,
  maxKeywords = Infinity,
  includeManual = true,
  scanState = {},
  timeBudgetMs = 12000
}) {
  const startedAt = Date.now();
  const deadlineAt = startedAt + timeBudgetMs;
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
      if (Date.now() >= deadlineAt) {
        warnings.push(`扫描已达到 ${timeBudgetMs}ms 时间预算，剩余关键词将在下次刷新时继续。`);
        break;
      }
      try {
        const rows = await adapter({ source, keyword, includeManual, today: new Date().toISOString().slice(0, 10), detailLimit, deadlineAt, fetchTimeoutMs });
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
  async qianlima({ source, keyword, detailLimit, deadlineAt, fetchTimeoutMs }) {
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
      }, remainingTimeout(deadlineAt, fetchTimeoutMs));
      rows.push(...parseQianlimaRows(html, keyword, source, sourceUrl));
    } catch {
      // Public GET shapes below are a fallback when POST is blocked.
    }
    if (rows.length) return enrichRowsWithDetails(rows, source, detailLimit, deadlineAt, fetchTimeoutMs);

    const urls = [
      `${source.baseUrl}?keywords=${encodeURIComponent(keyword)}`,
      `${source.baseUrl}?key=${encodeURIComponent(keyword)}`,
      `${source.baseUrl}?search=${encodeURIComponent(keyword)}`
    ];
    for (const url of urls) {
      if (Date.now() >= deadlineAt) break;
      const html = await fetchText(url, {}, remainingTimeout(deadlineAt, fetchTimeoutMs));
      const parsed = parseQianlimaRows(html, keyword, source, url);
      if (parsed.length) return enrichRowsWithDetails(parsed, source, detailLimit, deadlineAt, fetchTimeoutMs);
    }
    return [];
  },

  async ctbpsp({ source, keyword, includeManual, today, detailLimit, deadlineAt, fetchTimeoutMs }) {
    const url = `${source.baseUrl}?keyWords=${encodeURIComponent(keyword)}`;
    try {
      const html = await fetchText(url, {}, remainingTimeout(deadlineAt, fetchTimeoutMs));
      const rows = parseCtbpspRows(html, keyword, source, url);
      if (rows.length) return enrichRowsWithDetails(rows, source, detailLimit, deadlineAt, fetchTimeoutMs);
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

function remainingTimeout(deadlineAt, fallbackMs) {
  return Math.max(750, Math.min(fallbackMs, deadlineAt - Date.now()));
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
    const snippet = getNearbyText(text, match.index, match[0].length);
    const detailRef = extractNearbyDetailRef(html, title);
    const detailUrl = absoluteUrl(extractNearbyHref(html, title), sourceUrl);
    rows.push(toOpportunity({ title, platform: source.name, sourceId: source.id, keyword, type, region, date, url: detailUrl || sourceUrl, detailRef, snippet }));
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
    const detailRef = extractDetailRef(trMatch[1]);
    const detailUrl = absoluteUrl(extractHref(trMatch[1]), sourceUrl);
    rows.push(
      toOpportunity({
        title,
        platform: source.name,
        sourceId: source.id,
        keyword,
        type: cleanTitle(type) || guessTenderType(title),
        region: cleanTitle(region) || '待确认',
        date,
        url: detailUrl || sourceUrl,
        detailRef,
        snippet: cells.join(' ')
      })
    );
  }
  return rows;
}

function parseCtbpspRows(html, keyword, source, sourceUrl) {
  const text = normalizeText(html);
  const rows = [];
  const lines = text
    .split('\n')
    .map((line) => cleanTenderText(line))
    .filter((line) => line.length >= 8 && line.length <= 220);
  for (const line of lines) {
    if (/keyWords=|keywords=|searchword=|bulletinList|zbpglist/i.test(line)) continue;
    if (/^(项目名称|采购项目|招标项目|项目编号|采购编号|招标编号)[:：]/.test(line)) continue;
    const maybeDate = line.match(/20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}/)?.[0] || '';
    const title = cleanTitle(line.replace(maybeDate, ''));
    if (!isRelevant(title) || title.includes('bulletinList')) continue;
    const index = text.indexOf(line);
    rows.push(
      toOpportunity({
        title,
        platform: source.name,
        sourceId: source.id,
        keyword,
        type: '招标公告',
        region: '全国',
        date: normalizeDate(maybeDate) || '',
        url: sourceUrl,
        snippet: getNearbyText(text, index, line.length)
      })
    );
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
    const nearby = getNearbyText(text, index, title.length, 160);
    rows.push(toOpportunity({ title, platform: source.name, sourceId: source.id, keyword, type: guessTenderType(title), region: guessRegion(nearby), date: normalizeDate(nearby.match(/20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}/)?.[0]) || '', url: sourceUrl, snippet: nearby }));
  }
  return dedupe(rows).slice(0, 30);
}

async function enrichRowsWithDetails(rows, source, detailLimit = 3, deadlineAt = Date.now() + 12000, fetchTimeoutMs = 5000) {
  const enriched = [];
  for (const row of rows.slice(0, detailLimit)) {
    if (Date.now() >= deadlineAt) break;
    enriched.push(await enrichRowWithDetail(row, source, deadlineAt, fetchTimeoutMs));
  }
  return [...enriched, ...rows.slice(enriched.length)];
}

async function enrichRowWithDetail(row, source, deadlineAt, fetchTimeoutMs) {
  if (!row?.url || !isDetailUrl(row.url, source)) return row;
  try {
    const html = await fetchText(row.url, {}, remainingTimeout(deadlineAt, fetchTimeoutMs));
    const detailText = cleanTenderText(decodeHtml(html));
    if (detailText.length < 80) return row;
    return refreshTenderOpportunity(row, detailText);
  } catch {
    return row;
  }
}

function refreshTenderOpportunity(row, detailText) {
  const snippet = [row.rawSnippet, detailText].filter(Boolean).join(' ');
  const tender = enrichTenderFields({
    title: row.title,
    keyword: row.keyword,
    type: row.type,
    region: row.region,
    date: row.date,
    url: row.url,
    snippet,
    manual: row.manual
  });
  const publishDate = tender.publishDate || row.date;
  const quality = evaluateOpportunityQuality({
    title: row.title,
    keyword: row.keyword,
    type: row.type,
    date: publishDate,
    manual: row.manual,
    score: row.score,
    tender
  });
  const unitLabel = tender.procurementUnit || tender.tenderUnit || tender.buyer || '招标/采购单位待核验';
  const missing = tender.missingFields.length ? `仍缺：${tender.missingFields.join('、')}。` : '关键招标信息已基本齐全。';
  return {
    ...row,
    date: publishDate,
    publishDate,
    projectName: tender.projectName,
    procurementUnit: tender.procurementUnit,
    tenderUnit: tender.tenderUnit,
    buyer: tender.buyer,
    agency: tender.agency,
    budget: tender.budget,
    deadline: tender.deadline,
    deadlineStatus: tender.deadlineStatus,
    contact: tender.contact,
    contactPhone: tender.contactPhone,
    tenderInfo: tender.tenderInfo,
    rawSnippet: tender.rawSnippet,
    infoCompleteness: tender.infoCompleteness,
    missingFields: tender.missingFields,
    quality,
    recommendation: quality.recommendation,
    why: `命中“${row.keyword}”及公司关注方向；当前识别单位：${unitLabel}。${missing}`,
    action: `先核验 ${unitLabel} 的真实需求、预算、截止时间和联系方式，再交给客户管理/任务/报价 Agent 拆解跟进。`
  };
}

function isDetailUrl(url = '', source = {}) {
  if (!url || !source?.baseUrl) return false;
  if (url === source.baseUrl) return false;
  if (/zbpglist|bulletinList/i.test(url)) return false;
  return /^https?:\/\//i.test(url);
}

function extractHref(html = '') {
  const candidates = [...String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1])
    .filter((href) => href && !/^javascript:|^#$/i.test(href));
  return candidates.find((href) => !/zbpglist|bulletinList/i.test(href)) || candidates[0] || '';
}

function extractNearbyHref(html = '', title = '') {
  const clean = cleanTitle(title).slice(0, 24);
  if (!clean) return '';
  const index = String(html).indexOf(clean);
  if (index === -1) return '';
  return extractHref(String(html).slice(Math.max(0, index - 800), index + 1200));
}

function extractDetailRef(html = '') {
  const match = String(html).match(/popUpQRcodeImg\(['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\)/);
  if (!match) return '';
  return `qianlima-content:${match[1]};next:${match[2]}`;
}

function extractNearbyDetailRef(html = '', title = '') {
  const clean = cleanTitle(title).slice(0, 24);
  if (!clean) return '';
  const index = String(html).indexOf(clean);
  if (index === -1) return '';
  return extractDetailRef(String(html).slice(Math.max(0, index - 800), index + 1200));
}

function absoluteUrl(href = '', baseUrl = '') {
  if (!href) return '';
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
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
    manualReason: reason,
    snippet: reason
  });
}

function toOpportunity({ title, platform, sourceId, keyword, type, region, date, url, detailRef = '', manual = false, manualReason = '', snippet = '' }) {
  const tender = enrichTenderFields({ title, keyword, type, region, date, url, snippet, manual });
  const publishDate = tender.publishDate || date;
  const score = scoreOpportunity(title, keyword, manual);
  const quality = evaluateOpportunityQuality({ title, keyword, type, date: publishDate, manual, score, tender });
  const unitLabel = tender.procurementUnit || tender.tenderUnit || tender.buyer || '招标/采购单位待核验';
  const missing = tender.missingFields.length ? `仍缺：${tender.missingFields.join('、')}。` : '关键招标信息已基本齐全。';
  return {
    id: stableId([sourceId, keyword, title, tender.procurementUnit, url]),
    title,
    source: `${platform} / ${type} / ${region}`,
    platform,
    sourcePlatform: platform,
    sourceId,
    keyword,
    date: publishDate,
    publishDate,
    region,
    type,
    url,
    detailRef,
    projectName: tender.projectName,
    procurementUnit: tender.procurementUnit,
    tenderUnit: tender.tenderUnit,
    buyer: tender.buyer,
    agency: tender.agency,
    budget: tender.budget,
    deadline: tender.deadline,
    deadlineStatus: tender.deadlineStatus,
    contact: tender.contact,
    contactPhone: tender.contactPhone,
    tenderInfo: tender.tenderInfo,
    rawSnippet: tender.rawSnippet,
    infoCompleteness: tender.infoCompleteness,
    missingFields: tender.missingFields,
    match: manual ? '需人工打开验证' : `招标关键词匹配 ${Math.min(96, score)}%`,
    why: manual
      ? `${platform} 当前页面${manualReason || '需要浏览器渲染或存在访问限制'}，系统已保留精确关键词检索入口。需要打开后补齐招标/采购单位、预算、截止时间和联系人。`
      : `命中“${keyword}”及公司关注方向；当前识别单位：${unitLabel}。${missing}`,
    action: manual
      ? `打开链接核验“${keyword}”最新公告；确认采购单位、技术参数、报名截止时间和联系人后再转为任务。`
      : `先核验 ${unitLabel} 的真实需求、预算、截止时间和联系方式，再交给客户管理/任务/报价 Agent 拆解跟进。`,
    urgency: manual ? '今天人工验证一次。' : '24 小时内核实公告详情、报名条件和是否需要快速报价。',
    score,
    quality,
    recommendation: quality.recommendation,
    recommendedOwner: recommendOwner(title),
    manual,
    createdAt: new Date().toISOString()
  };
}

function enrichTenderFields({ title, type, region, date, url, snippet = '', manual = false }) {
  const combined = cleanTenderText([title, snippet].filter(Boolean).join(' '));
  const titleUnit = manual ? '' : inferTitleUnit(title);
  const procurementUnit = inferUnit(combined, ['采购人', '采购单位', '采购方', '采购机构']) || titleUnit;
  const tenderUnit = inferUnit(combined, ['招标人', '招标单位', '建设单位', '业主单位', '项目单位']);
  const agency = inferUnit(combined, ['招标代理', '代理机构', '采购代理机构']);
  const buyer = procurementUnit || tenderUnit || titleUnit;
  const budget = inferBudget(combined);
  const publishDate = inferPublishDate(combined) || date;
  const deadline = inferDeadline(combined);
  const deadlineStatus = getDeadlineStatus(deadline);
  const contactInfo = inferContact(combined);
  const projectName = inferProjectName(title, combined);
  const fields = {
    projectName,
    procurementUnit: procurementUnit || buyer,
    tenderUnit,
    buyer,
    agency,
    budget,
    publishDate,
    deadline,
    deadlineStatus,
    contact: contactInfo.name,
    contactPhone: contactInfo.phone
  };
  const missingFields = [
    !fields.procurementUnit && '招标/采购单位',
    !fields.budget && '预算/最高限价',
    !fields.deadline && '截止/开标时间',
    !fields.contact && !fields.contactPhone && '联系人'
  ].filter(Boolean);

  return {
    ...fields,
    tenderInfo: [
      `项目：${projectName || title}`,
      `单位：${fields.procurementUnit || '待核验'}`,
      `类型：${type || '待确认'}`,
      `地区：${region || '待确认'}`,
      `公告日期：${publishDate || '待确认'}`,
      `预算：${budget || '待核验'}`,
      `截止：${deadline || '待核验'}`,
      deadlineStatus === 'expired' ? '状态：已过截止/开标时间' : '',
      manual ? '状态：需人工打开来源验证' : ''
    ]
      .filter(Boolean)
      .join('；'),
    rawSnippet: cleanTenderText(snippet).slice(0, 260),
    infoCompleteness: calculateCompleteness(fields),
    missingFields,
    url
  };
}

function inferUnit(text, labels) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}\\s*[:：]?\\s*([\\u4e00-\\u9fa5A-Za-z0-9（）()·\\-\\s]{3,90})`);
    const match = text.match(pattern);
    if (match?.[1]) return cleanUnit(match[1]);
  }
  const natural = text.match(/(?:受|接受|委托)([\u4e00-\u9fa5A-Za-z0-9（）()·\-]{3,70}?)(?:委托|的委托|采购|招标)/)?.[1];
  if (natural) return cleanUnit(natural);
  return '';
}

function inferTitleUnit(title = '') {
  const clean = cleanTenderText(title);
  const bracket = clean.match(/^【([^】]{2,24})】/)?.[1];
  if (bracket) return cleanUnit(bracket);
  const patterns = [
    /([\u4e00-\u9fa5A-Za-z0-9（）()·-]{2,42}?(?:有限公司|集团有限公司|股份有限公司|集团|研究院|研究所|大学|学院|实验室|中心|医院|公司|厂|院|所))(?=.*(?:采购|招标|询价|项目|熔炼|设备|材料))/,
    /^([\u4e00-\u9fa5A-Za-z0-9（）()·-]{2,24}?(?:厂|公司|研究院|研究所|大学|学院|实验室|中心|工区|事业部))\s*(?:熔炼|真空|冷坩埚|高温|高熵|靶材|金属|新材料|项修|维修)/
  ];
  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match?.[1]) return cleanUnit(match[1]);
  }
  return '';
}

function cleanUnit(value = '') {
  return String(value)
    .replace(/^(名称|单位|联系人|联系方式|电话|地址)\s*[:：]?/, '')
    .replace(/20\d{2}年?\d{0,2}月?.*$/, '')
    .replace(/(采购|招标|询价|公告|项目|预算|联系人|联系方式|电话|地址|开标|报名).*$/, '')
    .replace(/[，。；;、\s]+$/g, '')
    .trim()
    .slice(0, 60);
}

function inferProjectName(title = '', text = '') {
  const named = text.match(/(?:项目名称|采购项目|招标项目)\s*[:：]\s*([^\n。；;]{6,90})/)?.[1];
  return cleanTitle(named || title).slice(0, 100);
}

function inferBudget(text = '') {
  const patterns = [
    /(?:预算金额|项目预算|采购预算|最高限价|控制价|招标控制价|预算价|限价金额|最高投标限价|项目总投资)\s*[:：]?\s*(?:人民币)?\s*([0-9,]+(?:\.[0-9]+)?\s*(?:万元|元|人民币|万|亿元))/,
    /([0-9,]+(?:\.[0-9]+)?\s*(?:万元|亿元|元))(?=.{0,18}(?:预算|限价|控制价|资金|报价|投资))/,
    /(?:预算|限价|控制价|资金|投资).{0,18}?([0-9,]+(?:\.[0-9]+)?\s*(?:万元|亿元|元))/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].replace(/[,\s]+/g, '');
  }
  return '';
}

function inferDeadline(text = '') {
  const patterns = [
    /(?:投标截止时间|响应文件提交截止时间|响应截止时间|报名截止时间|开标时间|截止时间|递交截止时间|递交投标文件截止时间)\s*[:：]?\s*(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?(?:\s*\d{1,2}[:：]\d{2})?)/,
    /(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?(?:\s*\d{1,2}[:：]\d{2})?)(?=.{0,24}(?:截止|开标|递交|投标|响应))/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return normalizeTenderDateTime(match[1]);
  }
  return '';
}

function inferPublishDate(text = '') {
  const patterns = [
    /(?:发布时间|发布日期|公告日期|公告时间|发布公告日期|招标公告日期|采购公告日期|公示日期)\s*[:：]?\s*(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?)/,
    /(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?)(?=.{0,18}(?:发布|公告发布|发布公告|发布采购|发布招标))/,
    /(?:发布|公告发布|发布公告|发布采购|发布招标).{0,18}?(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?)/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return normalizeDate(match[1]);
  }

  const labeledDates = [...String(text).matchAll(/(.{0,16})(20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?)(.{0,16})/g)];
  const candidate = labeledDates.find((match) => {
    const context = `${match[1]}${match[3]}`;
    return /公告|发布/.test(context) && !/截止|开标|递交|报名|获取|响应|投标/.test(context);
  });
  return candidate?.[2] ? normalizeDate(candidate[2]) : '';
}

function inferContact(text = '') {
  const name = text.match(/(?:联系人|项目联系人|采购联系人|招标联系人|采购人联系方式)\s*[:：]?\s*([\u4e00-\u9fa5]{2,6})/)?.[1] || '';
  const phone =
    text.match(/(?:电话|联系方式|联系电话|电 话|手机)\s*[:：]?\s*((?:1[3-9]\d{9})|(?:0\d{2,3}[-\s]\d{7,8})(?:-\d{1,4})?)/)?.[1] ||
    text.match(/(?:1[3-9]\d{9})|(?:0\d{2,3}[-\s]\d{7,8})(?:-\d{1,4})?/)?.[0] ||
    '';
  return { name, phone };
}

function calculateCompleteness(fields) {
  const checks = [fields.projectName, fields.procurementUnit || fields.tenderUnit || fields.buyer, fields.budget, fields.deadline, fields.contact || fields.contactPhone];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function recommendOwner(title = '') {
  if (/材料|合金|靶材|高熵|难熔/.test(title)) return 'guihua';
  if (/设备|熔炼炉|真空炉|冷坩埚|感应|电弧/.test(title)) return 'kingsong';
  if (/预算|客户|研究院|实验室|采购|招标/.test(title)) return 'luyang';
  return 'larry';
}

function evaluateOpportunityQuality({ title, keyword, type, date, manual, score, tender = {} }) {
  const text = `${title} ${keyword} ${type}`;
  const days = daysSince(date);
  const deadlineDays = daysUntilDeadline(tender.deadline);
  const demand = /招标|采购|询价|公告|项目|升级|设备|试制|实验室/.test(text) ? 4 : 2;
  const budget = tender.budget ? 5 : /招标|采购|预算|中标|成交/.test(text) ? 4 : manual ? 2 : 3;
  const timing = deadlineDays !== null
    ? deadlineDays < 0
      ? 1
      : deadlineDays <= 7
        ? 5
        : deadlineDays <= 30
          ? 4
          : 3
    : days === null
      ? (manual ? 2 : 3)
      : days <= 30
        ? 4
        : days <= 60
          ? 3
          : 1;
  const advantage = /悬浮|真空|熔炼|冷坩埚|难熔|高熵|靶材|材料|合金/.test(text) ? 5 : 3;
  const completenessBoost = Math.round((tender.infoCompleteness || 0) / 12);
  const total = Math.round((demand + budget + timing + advantage) * 5 + score * 0.2 + completenessBoost);
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
  if (isClosedTender(item)) return false;
  if (item.deadlineStatus === 'expired') return false;
  const deadlineDays = daysUntilDeadline(item.deadline);
  if (deadlineDays !== null && deadlineDays < 0) return false;
  if (item.manual) return true;
  if (!item.date) return item.deadlineStatus !== 'unknown';
  const days = daysSince(item.date);
  return days === null || days <= 60;
}

function scoreOpportunity(title, keyword, manual) {
  let score = manual ? 35 : 58;
  if (title.includes(keyword)) score += 12;
  for (const [term, points] of scoreTerms) {
    if (title.includes(term)) score += points;
  }
  if (/招标|采购|公告|项目/.test(title)) score += 6;
  if (closedTenderPattern.test(title)) score -= 30;
  return Math.max(10, Math.min(99, score));
}

function isClosedTender(item = {}) {
  return closedTenderPattern.test(`${item.type ?? ''} ${item.title ?? ''} ${item.rawSnippet ?? ''}`);
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

function cleanTenderText(value) {
  return normalizeText(String(value || ''))
    .replace(/\s+/g, ' ')
    .replace(/([：:])\s+/g, '$1')
    .trim();
}

function getNearbyText(text, index, length, radius = 220) {
  const safeIndex = Math.max(0, index || 0);
  return cleanTenderText(text.slice(Math.max(0, safeIndex - radius), safeIndex + length + radius));
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
  const match = String(value).match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (!match) return '';
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function normalizeTenderDateTime(value) {
  const date = normalizeDate(value);
  if (!date) return '';
  const time = String(value).match(/(\d{1,2})[:：](\d{2})/);
  if (!time) return date;
  return `${date} ${time[1].padStart(2, '0')}:${time[2]}`;
}

function parseTenderDate(value) {
  const date = normalizeDate(value);
  if (!date) return null;
  const parsed = Date.parse(`${date}T00:00:00`);
  return Number.isNaN(parsed) ? null : parsed;
}

function getDeadlineStatus(deadline) {
  if (!deadline) return 'unknown';
  const days = daysUntilDeadline(deadline);
  if (days === null) return 'unknown';
  return days < 0 ? 'expired' : 'active';
}

function daysUntilDeadline(deadline) {
  const value = parseTenderDate(deadline);
  if (value === null) return null;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.floor((value - todayStart) / 86400000);
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
  const completenessDelta = Number(b.infoCompleteness || 0) - Number(a.infoCompleteness || 0);
  if (completenessDelta) return completenessDelta;
  const qualityDelta = Number(b.quality?.total || 0) - Number(a.quality?.total || 0);
  if (qualityDelta) return qualityDelta;
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
