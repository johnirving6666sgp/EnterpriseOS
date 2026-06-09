#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const args = parseArgs(process.argv.slice(2));
const today = new Date().toISOString().slice(0, 10);
const outDir = path.resolve(args.out || 'data/tender-details');
const inputPath = args.input ? path.resolve(args.input) : '';
const storePath = path.resolve(args.store || 'data/store.json');
const jsonPath = path.resolve(args.json || path.join(outDir, `tender-details-${today}.json`));
const mdPath = path.resolve(args.md || path.join(outDir, `tender-details-${today}.md`));
const limit = Math.max(1, Number(args.limit || 30));
const minDelayMs = Math.max(0, Number(args.delay || 900));

const source = await loadOpportunities();
const opportunities = dedupeByTitle(source.opportunities)
  .filter((item) => item && (item.detailUrl || item.url || item.sourceSearchUrl))
  .slice(0, limit);

const enriched = [];
const warnings = [];

for (const [index, item] of opportunities.entries()) {
  try {
    const result = await enrichTenderDetail(item);
    enriched.push(result);
    console.log(`[${index + 1}/${opportunities.length}] ${result.detailStatus}: ${result.title}`);
  } catch (error) {
    warnings.push(`${item.title || item.id}: ${error.message}`);
    enriched.push({
      ...item,
      detailStatus: 'failed',
      detailError: error.message,
      detailFetchedAt: new Date().toISOString()
    });
    console.log(`[${index + 1}/${opportunities.length}] failed: ${item.title || item.id} - ${error.message}`);
  }
  if (index < opportunities.length - 1 && minDelayMs) await sleep(minDelayMs);
}

const payload = {
  generatedAt: new Date().toISOString(),
  source: source.description,
  count: enriched.length,
  successCount: enriched.filter((item) => item.detailStatus === 'detail_fetched').length,
  partialCount: enriched.filter((item) => item.detailStatus === 'source_page_fetched').length,
  failedCount: enriched.filter((item) => item.detailStatus === 'failed').length,
  warnings,
  opportunities: enriched
};

await fs.mkdir(path.dirname(jsonPath), { recursive: true });
await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
await fs.writeFile(mdPath, renderMarkdown(payload));

if (args['write-store']) await writeLocalStore(enriched);
if (args['sync-api']) await syncToApi(enriched);

console.log(`\n详情正文抓取完成：${payload.count} 条`);
console.log(`详情页成功：${payload.successCount} 条；来源页补齐：${payload.partialCount} 条；失败：${payload.failedCount} 条`);
console.log(`JSON: ${jsonPath}`);
console.log(`Markdown: ${mdPath}`);
if (warnings.length) {
  console.log('\n提示：');
  warnings.slice(0, 8).forEach((item) => console.log(`- ${item}`));
}

async function loadOpportunities() {
  if (inputPath) {
    const input = await readJson(inputPath, {});
    return {
      description: inputPath,
      opportunities: Array.isArray(input) ? input : input.opportunities ?? input.generatedOpportunities ?? []
    };
  }

  const store = await readJson(storePath, {});
  return {
    description: storePath,
    opportunities: store.generatedOpportunities ?? []
  };
}

async function enrichTenderDetail(opportunity) {
  const sourceUrl = opportunity.detailUrl || opportunity.url || opportunity.sourceSearchUrl;
  if (!sourceUrl) throw new Error('missing source url');

  const sourceHtml = await fetchSourceHtml(sourceUrl, opportunity);
  const detailRef = findDetailRef(sourceHtml, opportunity.title);
  const foundDetailUrl = normalizeUrl(opportunity.detailUrl || findDetailUrl(sourceHtml, opportunity.title, sourceUrl), sourceUrl);
  const shouldFetchDetail = foundDetailUrl && foundDetailUrl !== sourceUrl && isHttpUrl(foundDetailUrl);
  const detailHtml = shouldFetchDetail ? await fetchHtml(foundDetailUrl) : sourceHtml;
  const detailText = trimDetailText(normalizeHtmlText(detailHtml));
  const sourceText = normalizeHtmlText(sourceHtml);
  const usefulText = detailText.length >= 120 ? detailText : trimDetailText(sourceText);
  const fields = extractTenderFields(`${opportunity.title || ''}\n${usefulText}`);
  const missingFields = buildMissingFields(fields);
  const infoCompleteness = Math.round(((4 - missingFields.length) / 4) * 100);
  const tenderInfo = buildTenderInfo(opportunity, fields, missingFields);
  const quality = evaluateQuality(`${opportunity.title || ''} ${usefulText}`, infoCompleteness, missingFields);

  return compact({
    ...opportunity,
    company: fields.procurementUnit || fields.tenderUnit || fields.buyer || opportunity.company,
    procurementUnit: fields.procurementUnit || opportunity.procurementUnit,
    tenderUnit: fields.tenderUnit || opportunity.tenderUnit,
    buyer: fields.buyer || opportunity.buyer,
    agency: fields.agency || opportunity.agency,
    budget: fields.budget || opportunity.budget,
    deadline: fields.deadline || opportunity.deadline,
    contact: fields.contact || opportunity.contact,
    contactPhone: fields.contactPhone || opportunity.contactPhone,
    projectName: fields.projectName || opportunity.projectName || opportunity.title,
    tenderInfo,
    rawSnippet: bestSnippet(usefulText, opportunity.title),
    detailText: usefulText.slice(0, 6000),
    detailRef: detailRef || opportunity.detailRef,
    infoCompleteness,
    missingFields,
    quality,
    recommendation: quality.recommendation,
    detailUrl: foundDetailUrl || opportunity.detailUrl,
    url: foundDetailUrl || opportunity.url || sourceUrl,
    sourceSearchUrl: opportunity.sourceSearchUrl || sourceUrl,
    detailStatus: shouldFetchDetail ? 'detail_fetched' : 'source_page_fetched',
    detailFetchedAt: new Date().toISOString(),
    action: missingFields.length
      ? `已抓取正文，但还缺 ${missingFields.join('、')}；建议负责人先核验缺失字段。`
      : '详情正文和关键字段已补齐，可收藏后转客户、任务或报价流程。'
  });
}

async function fetchSourceHtml(url, opportunity) {
  if (/zb\.yfb\.qianlima\.com\/yfbsemsite\/mesinfo\/zbpglist/i.test(url)) {
    const keyword = opportunity.keyword || extractQueryValue(url, 'keywords') || extractQueryValue(url, 'searchword') || '熔炼炉';
    return fetchHtml('https://zb.yfb.qianlima.com/yfbsemsite/mesinfo/zbpglist', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        pageNo: '1',
        pageSize: '20',
        pageList: '20',
        searchword: keyword,
        searchword2: keyword,
        kw: keyword,
        kwname: keyword,
        infoType: '1',
        noticeTypes: '0',
        timeType: '2',
        searchType: '2'
      })
    });
  }
  return fetchHtml(url);
}

function extractQueryValue(url, name) {
  try {
    const value = new URL(url).searchParams.get(name) || '';
    return value ? decodeURIComponent(value) : '';
  } catch {
    return '';
  }
}

async function fetchHtml(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(args.timeout || 18000));
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) EnterpriseOS-DetailCrawler/1.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.7',
        referer: 'https://timeconnector.net/',
        ...(options.headers || {})
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function findDetailUrl(html, title = '', sourceUrl = '') {
  const links = [...String(html || '').matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((match) => ({
    href: match[1],
    text: normalizeHtmlText(match[2])
  }));
  const titleTokens = tokenizeTitle(title);
  const exact = links.find((link) => titleTokens.length && titleTokens.every((token) => link.text.includes(token)));
  const relevant =
    exact ||
    links.find((link) => /熔炼|真空|材料|合金|靶材|冷坩埚|招标|采购|公告|询价|比选/.test(link.text) && !/javascript:|#/.test(link.href));
  return relevant ? normalizeUrl(relevant.href, sourceUrl) : '';
}

function findDetailRef(html, title = '') {
  const tokens = tokenizeTitle(title);
  const anchors = [...String(html || '').matchAll(/<a\b[^>]*onclick=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  for (const match of anchors) {
    const onclick = match[1];
    const text = normalizeHtmlText(match[2]);
    if (tokens.length && !tokens.every((token) => text.includes(token))) continue;
    const ids = [...onclick.matchAll(/'(\d{6,})'/g)].map((item) => item[1]);
    if (ids.length) return `qianlima:contentId=${ids[0]}${ids[1] ? `;nextContentId=${ids[1]}` : ''}`;
  }
  return '';
}

function tokenizeTitle(title) {
  const clean = String(title || '').replace(/[【】\[\]（）()、，,。.\s]/g, '');
  const tokens = [];
  for (const keyword of ['熔炼', '真空', '材料', '合金', '靶材', '冷坩埚', '招标', '采购', '公告', '询价']) {
    if (clean.includes(keyword)) tokens.push(keyword);
  }
  const longWords = clean.match(/[\u4e00-\u9fa5A-Za-z0-9]{4,}/g) ?? [];
  return [...new Set([...tokens, ...longWords.slice(0, 2)])].slice(0, 4);
}

function extractTenderFields(text) {
  const clean = normalizeHtmlText(text);
  const procurementUnit = inferUnit(clean, ['采购人', '采购单位', '采购方', '采购单位名称']);
  const tenderUnit = inferUnit(clean, ['招标人', '招标单位', '建设单位', '项目单位', '业主单位']);
  const agency = inferUnit(clean, ['招标代理', '代理机构', '采购代理机构']);
  const titleUnit =
    clean.match(/([\u4e00-\u9fa5A-Za-z0-9（）()·-]{4,55}(?:公司|研究院|大学|学院|实验室|中心|集团|工厂|厂|单位|医院|科学院))/)?.[1] || '';
  const budget =
    clean.match(/(?:预算金额|项目预算|最高限价|控制价|估算价|采购预算|预算|金额)[:：]?\s*([0-9.,]+ ?(?:万元|元|人民币|万|亿元))/)?.[1] || '';
  const deadline =
    clean.match(/(?:投标截止时间|响应文件提交截止时间|报名截止时间|开标时间|截止|开标|投标截止|报名截止)[^20]{0,18}(20\d{2}[-年/.]\d{1,2}[-月/.]\d{1,2}(?:日)?(?:\s*\d{1,2}[:：]\d{2})?)/)?.[1] || '';
  const contact =
    clean.match(/(?:项目联系人|采购联系人|联系人)[:：]?\s*([\u4e00-\u9fa5A-Za-z·]{2,12})/)?.[1] || '';
  const contactPhone =
    clean.match(/(?:联系电话|联系方式|电话|手机)[:：]?\s*((?:\+?86[- ]?)?[0-9][0-9\-（）() ]{6,24})/)?.[1]?.trim() || '';
  const projectName =
    clean.match(/(?:项目名称|采购项目名称|招标项目名称)[:：]?\s*([\u4e00-\u9fa5A-Za-z0-9（）()·\-、，,]{6,90})/)?.[1]?.trim() || '';
  return {
    projectName: cleanValue(projectName, 90),
    procurementUnit: cleanUnit(procurementUnit),
    tenderUnit: cleanUnit(tenderUnit),
    buyer: cleanUnit(procurementUnit || tenderUnit || titleUnit),
    agency: cleanUnit(agency),
    budget: cleanValue(budget, 40),
    deadline: cleanValue(deadline, 40),
    contact: cleanValue(contact, 20),
    contactPhone: cleanValue(contactPhone, 30)
  };
}

function inferUnit(text, labels) {
  for (const label of labels) {
    const match = text.match(new RegExp(`${label}[:：]?\\s*([\\u4e00-\\u9fa5A-Za-z0-9（）()·\\-]{4,70})`));
    if (match?.[1]) return match[1];
  }
  return '';
}

function buildMissingFields(fields) {
  return [
    !fields.procurementUnit && !fields.tenderUnit && !fields.buyer && '招标/采购单位',
    !fields.budget && '预算/最高限价',
    !fields.deadline && '截止/开标时间',
    !fields.contact && !fields.contactPhone && '联系人'
  ].filter(Boolean);
}

function buildTenderInfo(opportunity, fields, missingFields) {
  const unit = fields.procurementUnit || fields.tenderUnit || fields.buyer || opportunity.procurementUnit || opportunity.company || '待核验';
  return [
    `项目：${fields.projectName || opportunity.projectName || opportunity.title || '待核验'}`,
    `单位：${unit}`,
    `代理：${fields.agency || opportunity.agency || '待核验'}`,
    `预算：${fields.budget || opportunity.budget || '待核验'}`,
    `截止：${fields.deadline || opportunity.deadline || '待核验'}`,
    `联系人：${[fields.contact || opportunity.contact, fields.contactPhone || opportunity.contactPhone].filter(Boolean).join(' ') || '待核验'}`,
    missingFields.length ? `仍缺：${missingFields.join('、')}` : '关键字段基本齐全'
  ].join('；');
}

function evaluateQuality(text, infoCompleteness, missingFields) {
  const hasIntent = /招标|采购|询价|竞价|比选|磋商|谈判|中标|成交|公告|报名|投标|开标/.test(text);
  const advantage = /悬浮|真空|冷坩埚|高熵|靶材|难熔|熔炼|金属材料|新材料/.test(text) ? 5 : 3;
  const timing = missingFields.includes('截止/开标时间') ? 2 : 5;
  const budget = missingFields.includes('预算/最高限价') ? 2 : 4;
  const demand = hasIntent ? 5 : 3;
  const total = Math.min(99, Math.round(infoCompleteness * 0.55 + advantage * 8 + (hasIntent ? 12 : 0)));
  const recommendation =
    total >= 82
      ? '详情字段较完整，建议当天分配负责人跟进。'
      : total >= 65
        ? '值得进入线索池验证，先补齐缺失字段。'
        : '信息仍不完整，先人工核验后再推进客户或报价。';
  return { demand, budget, timing, advantage, total, recommendation };
}

function bestSnippet(text, title = '') {
  const clean = normalizeHtmlText(text);
  const titleIndex = title ? clean.indexOf(String(title).slice(0, 20)) : -1;
  const keywordIndex = clean.search(/采购人|招标人|项目名称|预算|最高限价|截止|联系人|熔炼|真空|材料|合金/);
  const start = Math.max(0, (titleIndex >= 0 ? titleIndex : keywordIndex >= 0 ? keywordIndex : 0) - 120);
  return clean.slice(start, start + 900);
}

function normalizeHtmlText(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function trimDetailText(text) {
  const clean = normalizeHtmlText(text);
  const start = clean.search(/项目名称|采购人|招标人|公告|采购公告|招标公告|询价|熔炼|真空|材料|合金/);
  return clean.slice(Math.max(0, start), Math.max(0, start) + 12000);
}

function normalizeUrl(url, base) {
  if (!url || /^javascript:|^#/i.test(url)) return '';
  try {
    return new URL(url, base || undefined).href;
  } catch {
    return '';
  }
}

function isHttpUrl(url) {
  return /^https?:\/\//i.test(String(url || ''));
}

function cleanUnit(value) {
  const unit = cleanValue(value, 55).replace(/(地址|联系人|联系方式|电话|采购|招标|公告|预算|项目).*/, '').trim();
  if (/千里马|乙方宝|招标网|中国招标/.test(unit)) return '';
  return unit;
}

function cleanValue(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').replace(/[;；。].*$/, '').trim().slice(0, maxLength);
}

function renderMarkdown({ generatedAt, source, opportunities, warnings }) {
  const lines = [
    '# 招标详情正文抓取结果',
    '',
    `生成时间：${generatedAt}`,
    `来源：${source}`,
    ''
  ];
  if (warnings.length) {
    lines.push('## 抓取提示', '');
    warnings.slice(0, 20).forEach((item) => lines.push(`- ${item}`));
    lines.push('');
  }
  lines.push('## 详情列表', '');
  for (const item of opportunities) {
    lines.push(`### ${item.title}`);
    lines.push(`- 状态：${item.detailStatus || 'unknown'}`);
    lines.push(`- 招标/采购单位：${item.procurementUnit || item.tenderUnit || item.buyer || '待核验'}`);
    lines.push(`- 代理机构：${item.agency || '待核验'}`);
    lines.push(`- 预算/限价：${item.budget || '待核验'}`);
    lines.push(`- 截止/开标：${item.deadline || '待核验'}`);
    lines.push(`- 联系人：${[item.contact, item.contactPhone].filter(Boolean).join(' ') || '待核验'}`);
    lines.push(`- 信息完整度：${item.infoCompleteness || 0}%${item.missingFields?.length ? `；还缺 ${item.missingFields.join('、')}` : ''}`);
    lines.push(`- 详情链接：${item.detailUrl || item.url || '无'}`);
    lines.push(`- 摘要：${item.rawSnippet || '无'}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function writeLocalStore(items) {
  const store = await readJson(storePath, {});
  store.generatedOpportunities ??= [];
  let updated = 0;
  let inserted = 0;
  for (const item of items) {
    const index = store.generatedOpportunities.findIndex((existing) => existing.id === item.id);
    if (index >= 0) {
      store.generatedOpportunities[index] = compact({ ...store.generatedOpportunities[index], ...item });
      updated += 1;
    } else {
      store.generatedOpportunities.unshift(item);
      inserted += 1;
    }
  }
  store.generatedOpportunities = store.generatedOpportunities.slice(0, 100);
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`);
  console.log(`本地 store 已回写：更新 ${updated} 条，新增 ${inserted} 条`);
}

async function syncToApi(items) {
  const baseUrl = String(args['sync-api']).replace(/\/$/, '');
  const userId = String(args.user || process.env.ENTERPRISE_OS_USER || 'jamie');
  const password = String(args.password || process.env.ENTERPRISE_OS_PASSWORD || '');
  if (!password) throw new Error('sync-api requires --password or ENTERPRISE_OS_PASSWORD');

  const loginResponse = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId, password })
  });
  if (!loginResponse.ok) throw new Error(`login failed: HTTP ${loginResponse.status}`);
  const login = await loginResponse.json();
  const response = await fetch(`${baseUrl}/api/opportunities/details`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${login.token}`
    },
    body: JSON.stringify({ opportunities: items })
  });
  if (!response.ok) throw new Error(`sync failed: HTTP ${response.status} ${await response.text()}`);
  const result = await response.json();
  console.log(`生产 API 已同步：更新 ${result.updated} 条，新增 ${result.inserted} 条`);
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function parseArgs(argv) {
  return argv.reduce((acc, item) => {
    if (!item.startsWith('--')) return acc;
    const [rawKey, ...rest] = item.slice(2).split('=');
    acc[rawKey] = rest.length ? rest.join('=') : true;
    return acc;
  }, {});
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== ''));
}

function dedupeByTitle(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item?.title || item?.id || ''}|${item?.procurementUnit || item?.tenderUnit || item?.company || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
