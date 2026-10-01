import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { bench } from './bench';
import type { Persona } from './bot';
import { explain } from './explain';
import { fromInvocation } from './paths';
import { loadResult, writeReport } from './report';
import { runSim } from './run';
import { loadSideTable } from './fast/side';
import { buildVariants, runVariants } from './fast/variants';
import { loadGameConfig } from '@dt/config';

const [command, ...args] = process.argv.slice(2);
const bundlePath = process.env.CONFIG_BUNDLE_PATH!;
const adminUrl = process.env.SIM_ADMIN_URL ?? process.env.DATABASE_URL!;
const redisUrl =
  process.env.SIM_REDIS_URL ??
  (() => {
    const u = new URL(process.env.REDIS_URL!);
    u.pathname = '/15';
    return u.toString();
  })();

/** pnpm sim:fast（快速模拟设计 §6）：多套数值并排跑，写报告 */
async function fast(): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      days: { type: 'string', default: '30' },
      bots: { type: 'string', default: '20' },
      seed: { type: 'string', default: '1' },
      personas: { type: 'string', default: 'diligent,normal,casual' },
      variant: { type: 'string', multiple: true, default: [] },
      set: { type: 'string' },
      side: { type: 'string' },
      out: { type: 'string' },
      'stuck-days': { type: 'string', default: '5' },
    },
  });
  const config = loadGameConfig(bundlePath);
  const readJson = (f: string) => JSON.parse(readFileSync(fromInvocation(f), 'utf8')) as unknown;
  const variants = buildVariants(config, { variants: values.variant ?? [], set: values.set }, readJson);
  const sidePath =
    values.side === 'none'
      ? null
      : values.side
        ? fromInvocation(values.side)
        : new URL('./fast/side-income.json', import.meta.url);
  const side = sidePath ? loadSideTable(JSON.parse(readFileSync(sidePath, 'utf8')), config) : null;
  const days = Number(values.days);
  const results = await runVariants(
    variants,
    {
      days,
      botsPerPersona: Number(values.bots),
      personas: values.personas.split(',') as Persona['key'][],
      seed: Number(values.seed),
      start: new Date(Date.UTC(2026, 9, 1, 16, 0, 0)),
      side,
      stuckDays: Number(values['stuck-days']),
    },
    config,
    { bundlePath },
    (msg) => console.log(msg),
  );
  const dir = fromInvocation(
    values.out ?? join('sim-out', `fast-${new Date().toISOString().replace(/[:.]/g, '-')}`),
  );
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'results.json'), JSON.stringify(results));
  for (const r of results) console.log(`${r.name}：用时 ${Math.round(r.elapsedMs / 1000)} 秒`);
  console.log(`输出：${dir}`);
}

async function main(): Promise<void> {
  if (command === 'fast') {
    await fast();
    return;
  }
  if (command === 'run') {
    const { values } = parseArgs({
      args,
      options: {
        days: { type: 'string', default: '30' },
        bots: { type: 'string', default: '3' },
        seed: { type: 'string', default: '1' },
        personas: { type: 'string', default: 'diligent,normal,casual' },
        start: { type: 'string', default: '2026-10-01T00:00:00+08:00' },
        tuning: { type: 'string' },
        compare: { type: 'string' },
        out: { type: 'string' },
        'stuck-days': { type: 'string', default: '5' },
      },
    });
    const result = await runSim(
      {
        adminUrl,
        dbName: 'dt_sim',
        redisUrl,
        bundlePath,
        days: Number(values.days),
        botsPerPersona: Number(values.bots),
        personas: values.personas.split(',') as Persona['key'][],
        seed: Number(values.seed),
        start: new Date(values.start),
        tuning: values.tuning ? JSON.parse(readFileSync(fromInvocation(values.tuning), 'utf8')) : undefined,
        stuckDays: Number(values['stuck-days']),
      },
      (msg) => console.log(msg),
    );
    const dir = fromInvocation(values.out ?? join('sim-out', new Date().toISOString().replace(/[:.]/g, '-')));
    const files = writeReport(
      dir,
      result,
      values.compare ? loadResult(fromInvocation(values.compare)) : undefined,
    );
    console.log(`完成，用时 ${Math.round(result.elapsedMs / 1000)} 秒`);
    console.log(`到达星级的平均天数：${JSON.stringify(result.starDays)}`);
    console.log(`卡点 ${result.stuck.length} 个`);
    console.log(`报告：${files[1]}`);
    return;
  }
  if (command === 'explain') {
    const { values } = parseArgs({
      args,
      options: {
        rest: { type: 'string' },
        state: { type: 'string' },
        rounds: { type: 'string', default: '5' },
        seed: { type: 'string', default: '1' },
      },
    });
    console.log(
      await explain({
        bundlePath,
        rounds: Number(values.rounds),
        seed: Number(values.seed),
        state: values.state ? fromInvocation(values.state) : undefined,
        restId: values.rest ? Number(values.rest) : undefined,
        dbUrl: process.env.DATABASE_URL,
      }),
    );
    return;
  }
  if (command === 'bench') {
    const { values } = parseArgs({
      args,
      options: {
        restaurants: { type: 'string', default: '5000' },
        rounds: { type: 'string', default: '3' },
        seed: { type: 'string', default: '1' },
      },
    });
    const r = await bench({
      adminUrl,
      dbName: 'dt_sim_bench',
      redisUrl,
      bundlePath,
      restaurants: Number(values.restaurants),
      rounds: Number(values.rounds),
      seed: Number(values.seed),
    });
    for (const x of r.rounds) {
      console.log(
        `第 ${x.round} 轮：${x.ms} ms（每店 p50 ${x.p50} ms，p95 ${x.p95} ms），结算 ${x.settled}，失败 ${x.failed}`,
      );
    }
    console.log(r.pass ? `通过（≤ ${r.limitMs} ms）` : `未通过（要求 ≤ ${r.limitMs} ms）`);
    process.exitCode = r.pass ? 0 : 1;
    return;
  }
  console.log(
    '用法：sim run [--days 30 --bots 3 --seed 1 --tuning 覆盖.json --compare 目录] | sim explain --state 快照.json | --rest id | sim bench [--restaurants 5000 --rounds 3]',
  );
  process.exitCode = 1;
}

await main();
