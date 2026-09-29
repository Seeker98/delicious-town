import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BotDay } from './metrics';
import type { SimResult } from './run';

export interface Series {
  name: string;
  points: Array<[number, number]>;
  dashed?: boolean;
}

const COLORS = ['#d9480f', '#1971c2', '#2f9e44', '#9c36b5', '#e67700', '#0b7285', '#c2255c', '#5c940d'];
const PERSONA_NAMES: Record<string, string> = { diligent: '勤快', normal: '普通', casual: '休闲' };

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function short(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e8) return `${(v / 1e8).toFixed(1)}亿`;
  if (a >= 1e4) return `${(v / 1e4).toFixed(1)}万`;
  return String(Math.round(v * 10) / 10);
}

/** 自绘折线图（不依赖任何外部资源，断网也能看） */
export function lineChart(title: string, series: Series[], xLabel: string, yLabel: string): string {
  const W = 680;
  const H = 260;
  const L = 64;
  const R = 12;
  const T = 28;
  const B = 36;
  const xs = series.flatMap((s) => s.points.map((p) => p[0]));
  const ys = series.flatMap((s) => s.points.map((p) => p[1]));
  const xMax = Math.max(1, ...xs);
  const yMax = Math.max(1, ...ys);
  const yMin = Math.min(0, ...ys);
  const x = (v: number) => L + (v / xMax) * (W - L - R);
  const y = (v: number) => T + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - T - B);
  const parts: string[] = [];
  for (let i = 0; i <= 4; i++) {
    const yv = yMin + ((yMax - yMin) * i) / 4;
    parts.push(`<line x1="${L}" x2="${W - R}" y1="${y(yv)}" y2="${y(yv)}" stroke="#eee"/>`);
    parts.push(`<text x="${L - 6}" y="${y(yv) + 4}" text-anchor="end" font-size="11">${short(yv)}</text>`);
    const xv = (xMax * i) / 4;
    parts.push(
      `<text x="${x(xv)}" y="${H - B + 16}" text-anchor="middle" font-size="11">${short(xv)}</text>`,
    );
  }
  parts.push(`<line x1="${L}" x2="${L}" y1="${T}" y2="${H - B}" stroke="#999"/>`);
  parts.push(`<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="#999"/>`);
  parts.push(
    `<text x="${(L + W) / 2}" y="${H - 4}" text-anchor="middle" font-size="11">${esc(xLabel)}</text>`,
  );
  parts.push(`<text x="12" y="${T - 10}" font-size="11">${esc(yLabel)}</text>`);
  series.forEach((s, i) => {
    const color = COLORS[i % COLORS.length]!;
    const pts = s.points.map(([px, py]) => `${x(px).toFixed(1)},${y(py).toFixed(1)}`).join(' ');
    parts.push(
      `<polyline fill="none" stroke="${color}" stroke-width="2"${s.dashed ? ' stroke-dasharray="6 4"' : ''} points="${pts}"/>`,
    );
    parts.push(`<rect x="${W - R - 150}" y="${T + i * 16 - 9}" width="10" height="10" fill="${color}"/>`);
    parts.push(`<text x="${W - R - 136}" y="${T + i * 16}" font-size="11">${esc(s.name)}</text>`);
  });
  return `<figure><figcaption>${esc(title)}</figcaption><svg viewBox="0 0 ${W} ${H}" width="100%" role="img">${parts.join('')}</svg></figure>`;
}

function average(
  days: BotDay[],
  persona: string,
  field: 'level' | 'star' | 'learned' | 'coin' | 'diamond',
): Array<[number, number]> {
  const byDay = new Map<number, number[]>();
  for (const d of days) if (d.persona === persona) byDay.set(d.day, [...(byDay.get(d.day) ?? []), d[field]]);
  return [...byDay]
    .sort((a, b) => a[0] - b[0])
    .map(([day, list]) => [day, list.reduce((s, v) => s + v, 0) / list.length]);
}

function growthSeries(
  r: SimResult,
  field: 'level' | 'star' | 'learned' | 'coin' | 'diamond',
  cmp?: SimResult,
): Series[] {
  const personas = [...new Set(r.bots.map((b) => b.persona))];
  const out: Series[] = personas.map((p) => ({
    name: PERSONA_NAMES[p] ?? p,
    points: average(r.days, p, field),
  }));
  if (cmp) {
    for (const p of personas) {
      out.push({
        name: `${PERSONA_NAMES[p] ?? p}（对比）`,
        points: average(cmp.days, p, field),
        dashed: true,
      });
    }
  }
  return out;
}

function economySeries(r: SimResult, kind: string): Series[] {
  const days = [...new Set(r.economy.map((e) => e.day))].sort();
  const idx = new Map(days.map((d, i) => [d, i]));
  const settle: Array<[number, number]> = [];
  const otherIn = new Map<number, number>();
  const out = new Map<number, number>();
  for (const e of r.economy) {
    if (e.kind !== kind) continue;
    const i = idx.get(e.day)!;
    if (e.source === 'settlement') settle.push([i, e.delta]);
    else if (e.delta >= 0) otherIn.set(i, (otherIn.get(i) ?? 0) + e.delta);
    else out.set(i, (out.get(i) ?? 0) - e.delta);
  }
  const toPoints = (m: Map<number, number>) => [...m].sort((a, b) => a[0] - b[0]);
  return [
    { name: '结算收入', points: settle.sort((a, b) => a[0] - b[0]) },
    { name: '其他收入', points: toPoints(otherIn) },
    { name: '支出', points: toPoints(out) },
  ].filter((s) => s.points.length > 0);
}

function table(head: string[], rows: Array<Array<string | number>>): string {
  const th = head.map((h) => `<th>${esc(h)}</th>`).join('');
  const tr = rows.map((r) => `<tr>${r.map((c) => `<td>${esc(String(c))}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

export function renderReport(r: SimResult, cmp?: SimResult): string {
  const totals = new Map<string, number>();
  for (const e of r.economy)
    totals.set(`${e.kind}|${e.source}`, (totals.get(`${e.kind}|${e.source}`) ?? 0) + e.delta);
  const totalRows = [...totals]
    .map(([k, v]) => [...k.split('|'), v] as [string, string, number])
    .sort((a, b) => a[0].localeCompare(b[0]) || b[2] - a[2]);
  const starRows = Object.entries(r.starDays).flatMap(([p, m]) =>
    Object.entries(m).map(([star, d]) => [PERSONA_NAMES[p] ?? p, `${star} 星`, d]),
  );
  const LACK: Record<string, string> = { cookbooks: '已学食谱不够', certs: '升星凭证不够' };
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>模拟报告</title><style>
body{font-family:system-ui,sans-serif;max-width:760px;margin:16px auto;padding:0 16px;color:#222}
h1{font-size:20px}h2{font-size:17px;margin-top:28px;border-bottom:1px solid #eee}
figure{margin:12px 0}figcaption{font-size:13px;font-weight:600}
table{border-collapse:collapse;font-size:13px;width:100%}td,th{border-bottom:1px solid #eee;padding:3px 6px;text-align:left}
.muted{color:#888;font-size:13px}
</style></head><body>
<h1>模拟报告</h1>
<p class="muted">${esc(`${r.options.days} 天 · 每种画像 ${r.options.botsPerPersona} 个机器人 · 种子 ${r.options.seed} · 用时 ${Math.round(r.elapsedMs / 1000)} 秒`)}${cmp ? ' · 虚线为对比运行' : ''}</p>
<h2>成长节奏</h2>
${lineChart('平均等级', growthSeries(r, 'level', cmp), '天', '等级')}
${lineChart('平均星级', growthSeries(r, 'star', cmp), '天', '星级')}
${lineChart('平均已学食谱数', growthSeries(r, 'learned', cmp), '天', '道')}
${table(['画像', '星级', '平均第几天达到'], starRows)}
<h2>经济平衡</h2>
${lineChart('每天的银币（全部机器人合计）', economySeries(r, 'coin'), '天', '银币')}
${lineChart('每天的经验（全部机器人合计）', economySeries(r, 'exp'), '天', '经验')}
${lineChart('平均持有银币', growthSeries(r, 'coin', cmp), '天', '银币')}
${lineChart('平均持有钻石', growthSeries(r, 'diamond', cmp), '天', '钻石')}
${table(['种类', '来源', '合计'], totalRows)}
<h2>卡点</h2>
${
  r.stuck.length === 0
    ? '<p>没有发现卡点。</p>'
    : table(
        ['机器人', '当前星级', '已卡天数', '缺的条件'],
        r.stuck.map((s) => [
          s.bot,
          s.star,
          s.days,
          s.lacking.map((x) => LACK[x] ?? x).join('、') || '（条件都满足，但策略没有升星）',
        ]),
      )
}
</body></html>`;
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return '';
  const head = Object.keys(rows[0]!);
  const cell = (v: unknown) => {
    const s = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `${head.join(',')}\n${rows.map((r) => head.map((h) => cell(r[h])).join(',')).join('\n')}\n`;
}

export function writeReport(dir: string, r: SimResult, cmp?: SimResult): string[] {
  mkdirSync(dir, { recursive: true });
  const files: Array<[string, string]> = [
    ['data.json', JSON.stringify(r)],
    ['report.html', renderReport(r, cmp)],
    ['growth.csv', toCsv(r.days as unknown as Array<Record<string, unknown>>)],
    ['economy.csv', toCsv(r.economy as unknown as Array<Record<string, unknown>>)],
    ['stuck.csv', toCsv(r.stuck as unknown as Array<Record<string, unknown>>)],
  ];
  for (const [name, content] of files) writeFileSync(join(dir, name), content);
  return files.map(([name]) => join(dir, name));
}

export function loadResult(dir: string): SimResult {
  return JSON.parse(readFileSync(join(dir, 'data.json'), 'utf8')) as SimResult;
}
