import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lineChart, toCsv, type Series } from '../report';
import { keyTable, median, PERSONA_NAMES, percentile, personasOf, starsShown, type KeyRow } from './metrics';
import type { FastDay, FastResult } from './run';

export interface ReportMeta {
  days: number;
  bots: number;
  seed: number;
  side: string | null;
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function fmt(v: number | null, kind: 'num' | 'pct' | 'day' = 'num'): string {
  if (v === null || !Number.isFinite(v)) return '—';
  if (kind === 'pct') return `${Math.round(v * 100)}%`;
  if (kind === 'day') return String(Math.round(v * 10) / 10);
  const a = Math.abs(v);
  if (a >= 1e8) return `${(v / 1e8).toFixed(1)}亿`;
  if (a >= 1e4) return `${(v / 1e4).toFixed(1)}万`;
  return String(Math.round(v));
}

/** 和基准比：差超过 10% 时标色；better 说明越大越好还是越小越好 */
function tone(v: number | null, base: number | null, better: 'up' | 'down'): string {
  if (v === null || base === null) return '';
  const m = Math.max(Math.abs(v), Math.abs(base));
  if (m === 0 || Math.abs(v - base) <= 0.1 * m) return '';
  const up = v > base;
  return (better === 'up') === up ? ' class="good"' : ' class="bad"';
}

interface Col {
  key: string;
  label: string;
  kind: 'num' | 'pct' | 'day';
  better: 'up' | 'down';
}

function columns(stars: number): Col[] {
  const cols: Col[] = [];
  for (let s = 1; s <= stars; s++) {
    cols.push({ key: `star${s}Days`, label: `${s} 星天数`, kind: 'day', better: 'down' });
    cols.push({ key: `star${s}Never`, label: `没到 ${s} 星`, kind: 'pct', better: 'down' });
  }
  cols.push({ key: 'day7Level', label: '第 7 天等级', kind: 'num', better: 'up' });
  cols.push({ key: 'day14Level', label: '第 14 天等级', kind: 'num', better: 'up' });
  cols.push({ key: 'day30Level', label: '第 30 天等级', kind: 'num', better: 'up' });
  cols.push({ key: 'coinPerDay', label: '每天净银币', kind: 'num', better: 'up' });
  cols.push({ key: 'stuckRate', label: '卡住', kind: 'pct', better: 'down' });
  return cols;
}

function keySection(rows: KeyRow[], stars: number, baseName: string): string {
  const cols = columns(stars);
  const base = (persona: string) => rows.find((r) => r.variant === baseName && r.persona === persona);
  const head = `<tr><th>数值</th><th>画像</th>${cols.map((c) => `<th>${c.label}</th>`).join('')}</tr>`;
  const body = rows
    .map((r) => {
      const b = r.variant === baseName ? undefined : base(r.persona);
      const tds = cols
        .map((c) => {
          const v = r.cells[c.key] ?? null;
          const t = b ? tone(v, b.cells[c.key] ?? null, c.better) : '';
          return `<td${t}>${fmt(v, c.kind)}</td>`;
        })
        .join('');
      return `<tr><td>${esc(r.variant)}</td><td>${PERSONA_NAMES[r.persona]}</td>${tds}</tr>`;
    })
    .join('');
  return `<h2>关键指标</h2><p class="note">中位数；"没到 N 星"是到最后都没到的人占比；和基准差超过 10% 的格子标色（绿色更好，红色更差）。</p><table>${head}${body}</table>`;
}

function chartsSection(results: FastResult[]): string {
  const metrics: Array<[string, (d: FastDay) => number]> = [
    ['等级', (d) => d.level],
    ['星级', (d) => d.star],
    ['银币', (d) => d.coin],
    ['学会的食谱', (d) => d.learned],
  ];
  const parts: string[] = [];
  for (const persona of personasOf(results)) {
    parts.push(`<h3>${PERSONA_NAMES[persona]}</h3>`);
    for (const [label, f] of metrics) {
      const byDay = (r: FastResult) => {
        const rows = r.days.filter((d) => d.persona === persona);
        const days = [...new Set(rows.map((d) => d.day))].sort((a, b) => a - b);
        return days.map((day) => [day, rows.filter((d) => d.day === day).map(f)] as const);
      };
      const series: Series[] = results.map((r) => ({
        name: r.name,
        points: byDay(r).map(([day, xs]) => [day, median(xs) ?? 0] as [number, number]),
      }));
      const band = {
        name: `${results[0]!.name} 10%~90%`,
        points: byDay(results[0]!).map(
          ([day, xs]) =>
            [day, percentile(xs, 0.1) ?? 0, percentile(xs, 0.9) ?? 0] as [number, number, number],
        ),
      };
      parts.push(lineChart(`${PERSONA_NAMES[persona]}：${label}`, series, '天', label, band));
    }
  }
  return `<h2>曲线</h2><p class="note">每套数值一条中位数线；阴影是基准的 10%~90% 区间。</p>${parts.join('')}`;
}

function incomeSection(results: FastResult[]): string {
  const group = (k: string) =>
    k === 'settlement'
      ? '结算'
      : k.startsWith('side.')
        ? `旁支·${k.slice(5)}`
        : k === 'task'
          ? '任务'
          : k === 'activation'
            ? '活跃'
            : '其他';
  const rows: string[] = [];
  for (const r of results) {
    for (const persona of personasOf([r])) {
      const inc = r.income[persona] ?? {};
      const sums = new Map<string, { coin: number; exp: number }>();
      for (const [k, v] of Object.entries(inc)) {
        const g = group(k);
        const s = sums.get(g) ?? { coin: 0, exp: 0 };
        s.coin += v.coin;
        s.exp += v.exp;
        sums.set(g, s);
      }
      const tc = [...sums.values()].reduce((a, s) => a + s.coin, 0);
      const te = [...sums.values()].reduce((a, s) => a + s.exp, 0);
      const cells = [...sums]
        .sort((a, b) => b[1].coin - a[1].coin)
        .map(
          ([g, s]) =>
            `${esc(g)} 银币 ${fmt(tc ? s.coin / tc : null, 'pct')} · 经验 ${fmt(te ? s.exp / te : null, 'pct')}`,
        )
        .join('<br>');
      rows.push(`<tr><td>${esc(r.name)}</td><td>${PERSONA_NAMES[persona]}</td><td>${cells || '—'}</td></tr>`);
    }
  }
  return `<h2>收入来源</h2><p class="note">全部机器人累计的银币、经验各来自哪里（旁支按来源细分）。旁支占比太高时，结论要打折扣。</p><table><tr><th>数值</th><th>画像</th><th>占比</th></tr>${rows.join('')}</table>`;
}

function stuckSection(results: FastResult[]): string {
  const rows: string[] = [];
  for (const r of results) {
    const reasons = new Map<string, number>();
    for (const s of r.stuck) for (const x of s.reasons) reasons.set(x, (reasons.get(x) ?? 0) + 1);
    const list = [...reasons]
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${esc(k)} × ${n}`)
      .join('、');
    rows.push(`<tr><td>${esc(r.name)}</td><td>${r.stuck.length}</td><td>${list || '—'}</td></tr>`);
  }
  return `<h2>卡点</h2><p class="note">等级够了却超过设定天数升不了星的机器人数，以及原因（level 等级、cookbooks 食谱数、certs 凭证、coin 银币、foods:食材名 学菜缺的食材）。</p><table><tr><th>数值</th><th>卡住的人</th><th>原因</th></tr>${rows.join('')}</table>`;
}

export function renderFastReport(results: FastResult[], meta: ReportMeta): string {
  const rows = keyTable(results, meta.days);
  const intro = `<p>${meta.days} 天，每种画像 ${meta.bots} 个机器人，种子 ${meta.seed}；数值 ${results.length} 套（${results.map((r) => esc(r.name)).join('、')}）；旁支产出表：${esc(meta.side ?? '不算')}。用时：${results.map((r) => `${esc(r.name)} ${Math.round(r.elapsedMs / 1000)} 秒`).join('，')}。</p>
<p class="note">不模拟：好友互动、论坛、邮件、举报；真人玩家抢菜；厨具强化过程（厨具加成按产出表折算）；区服里的蟹老板 NPC 店；特色菜的售卖。</p>`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>快速数值模拟报告</title>
<style>body{font-family:system-ui,sans-serif;max-width:1100px;margin:16px auto;padding:0 16px;color:#212529}
table{border-collapse:collapse;font-size:13px;margin:8px 0;overflow-x:auto;display:block}th,td{border:1px solid #dee2e6;padding:3px 6px;text-align:right;white-space:nowrap}
th:first-child,td:first-child,td:nth-child(2){text-align:left}.good{background:#d3f9d8}.bad{background:#ffe3e3}.note{color:#6c757d;font-size:13px}
figure{margin:8px 0}figcaption{font-size:13px;font-weight:600}</style></head><body>
<h1>快速数值模拟报告</h1>${intro}${keySection(rows, starsShown(results), results[0]!.name)}${chartsSection(results)}${incomeSection(results)}${stuckSection(results)}</body></html>`;
}

/** 写 report.html 和 CSV；返回写出的文件路径 */
export function writeFastReport(dir: string, results: FastResult[], meta: ReportMeta): string[] {
  mkdirSync(dir, { recursive: true });
  const key = keyTable(results, meta.days).map((r) => ({
    variant: r.variant,
    persona: r.persona,
    ...r.cells,
  }));
  const days = results.flatMap((r) => r.days.map((d) => ({ variant: r.name, ...d })));
  const income = results.flatMap((r) =>
    Object.entries(r.income).flatMap(([persona, m]) =>
      Object.entries(m).map(([source, v]) => ({ variant: r.name, persona, source, ...v })),
    ),
  );
  const stuck = results.flatMap((r) =>
    r.stuck.map((s) => ({ variant: r.name, ...s, reasons: s.reasons.join('|') })),
  );
  const files: Array<[string, string]> = [
    ['report.html', renderFastReport(results, meta)],
    ['key.csv', toCsv(key)],
    ['days.csv', toCsv(days as unknown as Array<Record<string, unknown>>)],
    ['income.csv', toCsv(income)],
    ['stuck.csv', toCsv(stuck)],
    ['results.json', JSON.stringify(results)],
  ];
  for (const [name, content] of files) writeFileSync(join(dir, name), content);
  return files.map(([name]) => join(dir, name));
}
