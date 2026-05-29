#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const defaultKeywords = [
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

const sources = {
  ctbpsp: {
    id: 'ctbpsp',
    name: '中国招标投标公共服务平台',
    baseUrl: 'https://ctbpsp.com/#/bulletinList'
  },
  qianlima: {
    id: 'qianlima',
    name: '全国招标采购信息平台',
    baseUrl: 'https://zb.yfb.qianlima.com/yfbsemsite/mesinfo/zbpglist'
  }
};

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

const args = parseArgs(process.argv.slice(2));
const keywords = unique(
  String(args.keywords || defaultKeywords.join(','))
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
);
const limit = Math.max(1, Number(args.limit || 100));
const generatedAt = new Date().toISOString();
const today = generatedAt.slice(0, 10);
const outDir = path.resolve(args.out || 'data/tender-opportunities');
const jsonPath = path.resolve(args.json || path.join(outDir, `tender-opportunities-${today}.json`));
const mdPath = path.resolve(args.md || path.join(outDir, `tender-opportunities-${today}.md`));
const warnings = [];

const crawled = [];
for (const keyword of keywords) {
  crawled.push(...(await crawlQianlima(keyword)));
  crawled.push(...(await crawlCtbpsp(keyword)));
}

const sortedOpportunities = dedupe(crawled).sort(sortOpportunities);
const opportunities = [
  ...sortedOpportunities.filter((item) => !item.manual).slice(0, limit),
  ...sortedOpportunities.filter((item) => item.manual)
];
const payload = {
  generatedAt,
  keywords,
  sources: Object.values(sources),
  count: opportunities.length,
  verifiedCount: opportunities.filter((item) => !item.manual).length,
  manualVerificationCount: opportunities.filter((item) => item.manual).length,
  warnings,
  opportunities
};

await fs.mkdir(path.dirname(jsonPath), { recursive: true });
await fs.mkdir(path.dirname(mdPath), { recursive: true });
await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
await fs.writeFile(mdPath, renderMarkdown(payload));

console.log(`招标商机抓取完成：${opportunities.length} 条`);
console.log(`可解析招标：${payload.verifiedCount} 条`);
console.log(`待人工核验入口：${payload.manualVerificationCount} 条`);
console.log(`JSON: ${jsonPath}`);
console.log(`Markdown: ${mdPath}`);
if (warnings.length) {
  console.log('\n提示：');
  warnings.slice(0, 8).forEach((item) => console.log(`- ${item}`));
}

async function crawlQianlima(keyword) {
  const postUrl = sources.qianlima.baseUrl;
  const sourceUrl = `${sources.qianlima.baseUrl}?keywords=${encodeURIComponent(keyword)}`;
  try {
    const html = await fetchText(postUrl, {
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
    const rows = parseQianlimaRows(html, keyword, sourceUrl);
    if (rows.length) return rows;
  } catch (error) {
    warnings.push(`${sources.qianlima.name} / ${keyword} POST 查询失败：${error.message}`);
  }

  const urls = [
    `${sources.qianlima.baseUrl}?keywords=${encodeURIComponent(keyword)}`,
    `${sources.qianlima.baseUrl}?key=${encodeURIComponent(keyword)}`,
    `${sources.qianlima.baseUrl}?search=${encodeURIComponent(keyword)}`
  ];

  for (const url of urls) {
    try {
      const html = await fetchText(url);
      const rows = parseQianlimaRows(html, keyword, url);
      if (rows.length) return rows;
    } catch (error) {
      warnings.push(`${sources.qianlima.name} / ${keyword} 抓取失败：${error.message}`);
    }
  }
  return [];
}

async function crawlCtbpsp(keyword) {
  const url = `${sources.ctbpsp.baseUrl}?keyWords=${encodeURIComponent(keyword)}`;
  try {
    const html = await fetchText(url);
    const rows = parseCtbpspRows(html, keyword, url);
    if (rows.length) return rows;
    warnings.push(`${sources.ctbpsp.name} / ${keyword} 是动态渲染页面，已生成待核验入口。`);
  } catch (error) {
    warnings.push(`${sources.ctbpsp.name} / ${keyword} 直接抓取失败，已生成待核验入口：${error.message}`);
  }

  return [
    toOpportunity({
      title: `打开中国招标投标公共服务平台验证：${keyword} 最新公告`,
      platform: sources.ctbpsp.name,
      sourceId: sources.ctbpsp.id,
      keyword,
      type: '招标搜索',
      region: '全国',
      date: today,
      url,
      manual: true
    })
  ];
}

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
    const response = await fetch(url, {
      signal: controller.signal,
      ...options,
      headers
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseQianlimaRows(html, keyword, sourceUrl) {
  const tableRows = parseQianlimaTableRows(html, keyword, sourceUrl);
  if (tableRows.length) return tableRows;

  const text = normalizeText(html);
  const rows = [];
  const rowPattern = /(20\d{2}-\d{2}-\d{2})\s+([^\s]{2,12})\s+(招标|中标|拟在建项目|采购公告|招标公告)\s+([^\n]{6,180})/g;
  let match;

  while ((match = rowPattern.exec(text))) {
    const [, date, region, type, rawTitle] = match;
    const title = cleanTitle(rawTitle);
    if (!isRelevant(title)) continue;
    rows.push(
      toOpportunity({
        title,
        platform: sources.qianlima.name,
        sourceId: sources.qianlima.id,
        keyword,
        type,
        region,
        date,
        url: sourceUrl
      })
    );
  }

  return rows.length ? rows : parseLooseRows(text, keyword, sourceUrl);
}

function parseQianlimaTableRows(html, keyword, sourceUrl) {
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

    rows.push(
      toOpportunity({
        title,
        platform: sources.qianlima.name,
        sourceId: sources.qianlima.id,
        keyword,
        type: cleanTitle(type) || guessTenderType(title),
        region: cleanTitle(region) || '待确认',
        date,
        url: sourceUrl
      })
    );
  }

  return rows;
}

function parseCtbpspRows(html, keyword, sourceUrl) {
  const text = normalizeText(html);
  const rows = [];
  const linePattern = /(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})?\s*([^\n]{8,160})/g;
  let match;

  while ((match = linePattern.exec(text))) {
    const [, maybeDate, rawTitle] = match;
    const title = cleanTitle(rawTitle);
    if (!isRelevant(title) || title.includes('bulletinList')) continue;
    rows.push(
      toOpportunity({
        title,
        platform: sources.ctbpsp.name,
        sourceId: sources.ctbpsp.id,
        keyword,
        type: '招标公告',
        region: '全国',
        date: normalizeDate(maybeDate) || today,
        url: sourceUrl
      })
    );
  }

  return rows.slice(0, 20);
}

function parseLooseRows(text, keyword, sourceUrl) {
  const rows = [];
  const lines = text
    .split('\n')
    .map((line) => cleanTitle(line))
    .filter((line) => line.length >= 8 && line.length <= 180 && isRelevant(line));

  for (const title of lines) {
    const nearby = text.slice(Math.max(0, text.indexOf(title) - 80), text.indexOf(title) + title.length + 80);
    const date = normalizeDate(nearby.match(/20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}/)?.[0]) || '';
    rows.push(
      toOpportunity({
        title,
        platform: sources.qianlima.name,
        sourceId: sources.qianlima.id,
        keyword,
        type: guessTenderType(title),
        region: guessRegion(nearby),
        date,
        url: sourceUrl
      })
    );
  }

  return dedupe(rows).slice(0, 30);
}

function toOpportunity({ title, platform, sourceId, keyword, type, region, date, url, manual = false }) {
  const score = scoreOpportunity(title, keyword, manual);
  return {
    id: stableId([sourceId, keyword, title, url]),
    title,
    source: `${platform} / ${type} / ${region}`,
    platform,
    keyword,
    date,
    region,
    type,
    url,
    match: manual ? '需人工打开验证' : `招标关键词匹配 ${Math.min(96, score)}%`,
    why: manual
      ? `${platform} 当前页面需要浏览器 JavaScript 渲染或存在访问限制，脚本已保留精确关键词检索入口。`
      : `标题命中“${keyword}”及公司关注方向，可能与熔炼设备、新材料研发、金属材料试制或报价机会相关。`,
    action: manual
      ? `打开链接核验“${keyword}”最新公告；确认采购单位、技术参数、报名截止时间和联系人后再转为任务。`
      : '收藏后交给个人助理或报价 Agent 拆解客户背景、设备/服务匹配度、报价风险和下一步跟进动作。',
    urgency: manual ? '今天人工验证一次。' : '24 小时内核实公告详情、报名条件和是否需要快速报价。',
    score,
    manual,
    createdAt: generatedAt
  };
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

function parseArgs(argv) {
  return argv.reduce((acc, item) => {
    if (!item.startsWith('--')) return acc;
    const [rawKey, ...rest] = item.slice(2).split('=');
    acc[rawKey] = rest.length ? rest.join('=') : true;
    return acc;
  }, {});
}

function renderMarkdown({ generatedAt: createdAt, keywords: terms, opportunities: items, warnings: notes }) {
  const lines = [
    '# 招标商机抓取结果',
    '',
    `生成时间：${createdAt}`,
    '',
    `关键词：${terms.join('、')}`,
    '',
    `总计：${items.length} 条；可解析招标：${items.filter((item) => !item.manual).length} 条；待人工核验：${
      items.filter((item) => item.manual).length
    } 条。`,
    ''
  ];

  if (notes.length) {
    lines.push('## 抓取提示', '');
    notes.slice(0, 20).forEach((note) => lines.push(`- ${note}`));
    lines.push('');
  }

  lines.push('## 商机列表', '');
  for (const item of items) {
    lines.push(`### ${item.title}`);
    lines.push('');
    lines.push(`- 来源：${item.source}`);
    lines.push(`- 关键词：${item.keyword}`);
    lines.push(`- 日期：${item.date || '待确认'}`);
    lines.push(`- 匹配：${item.match}`);
    lines.push(`- 判断：${item.why}`);
    lines.push(`- 动作：${item.action}`);
    lines.push(`- 链接：${item.url || '无'}`);
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}
