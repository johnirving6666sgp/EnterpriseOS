#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fallbackTenderKeywords, loadTenderConfig, scanTenderSources } from '../server/tender-scanner.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const args = parseArgs(process.argv.slice(2));
const config = await loadTenderConfig(rootDir);
const keywords = unique(
  String(args.keywords || config.keywords?.join(',') || fallbackTenderKeywords.join(','))
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
);
const limit = Math.max(1, Number(args.limit || 100));
const today = new Date().toISOString().slice(0, 10);
const outDir = path.resolve(args.out || 'data/tender-opportunities');
const statePath = path.resolve(args.state || path.join(outDir, 'scan-state.json'));
const jsonPath = path.resolve(args.json || path.join(outDir, `tender-opportunities-${today}.json`));
const mdPath = path.resolve(args.md || path.join(outDir, `tender-opportunities-${today}.md`));
const scanState = await readJson(statePath, { seenIds: {}, runs: [] });

const result = await scanTenderSources({
  rootDir,
  keywords,
  limit,
  includeManual: true,
  scanState
});

const payload = {
  generatedAt: result.run.at,
  keywords,
  sources: config.sources,
  count: result.opportunities.length,
  verifiedCount: result.opportunities.filter((item) => !item.manual).length,
  manualVerificationCount: result.opportunities.filter((item) => item.manual).length,
  newCount: result.run.newCount,
  run: result.run,
  warnings: result.warnings,
  opportunities: result.opportunities
};

await fs.mkdir(path.dirname(jsonPath), { recursive: true });
await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
await fs.writeFile(mdPath, renderMarkdown(payload));
await fs.writeFile(statePath, `${JSON.stringify(result.scanState, null, 2)}\n`);

console.log(`招标商机扫描完成：${payload.count} 条`);
console.log(`可解析招标：${payload.verifiedCount} 条`);
console.log(`待人工核验入口：${payload.manualVerificationCount} 条`);
console.log(`本次新发现：${payload.newCount} 条`);
console.log(`JSON: ${jsonPath}`);
console.log(`Markdown: ${mdPath}`);
console.log(`扫描状态: ${statePath}`);
if (payload.warnings.length) {
  console.log('\n提示：');
  payload.warnings.slice(0, 8).forEach((item) => console.log(`- ${item}`));
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function renderMarkdown({ generatedAt, keywords: terms, opportunities, warnings, run }) {
  const lines = [
    '# 招标商机扫描结果',
    '',
    `生成时间：${generatedAt}`,
    '',
    `关键词：${terms.join('、')}`,
    '',
    `总计：${opportunities.length} 条；可解析招标：${opportunities.filter((item) => !item.manual).length} 条；待人工核验：${
      opportunities.filter((item) => item.manual).length
    } 条；本次新发现：${run.newCount} 条。`,
    ''
  ];

  lines.push('## 扫描来源', '');
  Object.entries(run.sources ?? {}).forEach(([id, item]) => {
    lines.push(`- ${item.source || id}：${item.verified} 条可解析，${item.manual} 条待核验，${item.errors} 个错误`);
  });
  lines.push('');

  if (warnings.length) {
    lines.push('## 抓取提示', '');
    warnings.slice(0, 20).forEach((note) => lines.push(`- ${note}`));
    lines.push('');
  }

  lines.push('## 商机列表', '');
  for (const item of opportunities) {
    lines.push(`### ${item.isNew ? '新发现：' : ''}${item.title}`);
    lines.push('');
    lines.push(`- 来源：${item.source}`);
    lines.push(`- 招标/采购单位：${item.procurementUnit || item.tenderUnit || item.buyer || '待核验'}`);
    lines.push(`- 预算/限价：${item.budget || '待核验'}`);
    lines.push(`- 截止/开标：${item.deadline || '待核验'}`);
    lines.push(`- 联系人：${[item.contact, item.contactPhone].filter(Boolean).join(' ') || '待核验'}`);
    lines.push(`- 信息完整度：${item.infoCompleteness || 0}%${item.missingFields?.length ? `；还缺 ${item.missingFields.join('、')}` : ''}`);
    lines.push(`- 关键词：${item.keyword}`);
    lines.push(`- 日期：${item.date || '待确认'}`);
    lines.push(`- 匹配：${item.match}`);
    lines.push(`- 判断：${item.why}`);
    lines.push(`- 动作：${item.action}`);
    lines.push(`- 首次发现：${item.firstSeenAt || '本次'}`);
    lines.push(`- 链接：${item.url || '无'}`);
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function parseArgs(argv) {
  return argv.reduce((acc, item) => {
    if (!item.startsWith('--')) return acc;
    const [rawKey, ...rest] = item.slice(2).split('=');
    acc[rawKey] = rest.length ? rest.join('=') : true;
    return acc;
  }, {});
}

function unique(items) {
  return [...new Set(items)];
}
