import { readFileSync } from 'node:fs';
import { loadGameConfig, type GameConfig } from '@dt/config';
import { hashSeed, seededRng } from '@dt/shared';
import { createDb } from '../db';
import { IMPLEMENTED_FEATURES } from '../core/features';
import { buildGlobals, buildInput, normalizeCounts, type InputPatch } from '../modules/settlement/globals';
import { settleRestaurant } from '../modules/settlement/settle';
import type { RatePart, SettleGlobals, SettleInput } from '../modules/settlement/types';

const CUSTOMER: Record<string, string> = {
  '0': '空桌',
  '1': '普通',
  '2': '挑剔',
  '3': '蟑螂',
  '-3': '灭蟑',
  '6': '章鱼哥',
  '7': '痞老板',
  '8': '蟹老板',
  '9': '白食',
};

export interface ExplainOptions {
  bundlePath: string;
  rounds: number;
  seed: number;
  /** 快照文件：{ input?: InputPatch, globals?: Partial<SettleGlobals> } */
  state?: string;
  restId?: number;
  dbUrl?: string;
}

async function fromDb(
  config: GameConfig,
  dbUrl: string,
  restId: number,
): Promise<{ input: SettleInput; globals: SettleGlobals }> {
  const db = createDb(dbUrl, 2);
  try {
    const r = await db
      .selectFrom('restaurant')
      .selectAll()
      .where('id', '=', restId)
      .executeTakeFirstOrThrow();
    const tables = await db
      .selectFrom('restaurant_tables')
      .select('tables')
      .where('rest_id', '=', restId)
      .executeTakeFirstOrThrow();
    const cb = await db
      .selectFrom('restaurant_cookbooks')
      .select('levels')
      .where('rest_id', '=', restId)
      .executeTakeFirstOrThrow();
    const ws = await db
      .selectFrom('world_state')
      .selectAll()
      .where('shard_id', '=', r.shard_id)
      .executeTakeFirst();
    const foods = await db
      .selectFrom('cupboard_food')
      .select(['foods_id', 'num'])
      .where('rest_id', '=', restId)
      .execute();
    const now = new Date();
    return {
      input: {
        rest: {
          id: r.id,
          level: r.level,
          star: r.star_level,
          oil: r.oil,
          oilMax: r.oil_max,
          coin: r.coin,
          streetId: r.street_id,
          renown: r.renown,
          luck: r.luck,
          cteOn: r.cte_on,
          cookfoodsFlag: r.cookfoods_flag,
        },
        tables: tables.tables,
        levels: new Uint8Array(cb.levels),
        counts: normalizeCounts(r.cookbook_counts),
        agg: r.effect_agg,
        special: null,
        cupboard: r.cookfoods_flag > 0 ? new Map(foods.map((f) => [f.foods_id, f.num])) : null,
        now,
      },
      globals: buildGlobals(config, config.tuning, {
        weather: ws ? (config.weather.get(ws.weather_id)?.effects ?? {}) : {},
        krabStreet: ws?.krab_street ?? null,
        planktonRestId: ws?.plankton_rest_id ?? null,
        holidayMultiplier: config.holidayMultiplier(now),
        naturalRoach: IMPLEMENTED_FEATURES.has('friend'),
      }),
    };
  } finally {
    await db.destroy();
  }
}

const f2 = (v: number) => String(Math.round(v * 10000) / 10000);

/** 单店收益分解（设计文档 §8.2）：直接调用结算纯函数，逐轮打印每桌结果和汇总率分项 */
export async function explain(o: ExplainOptions): Promise<string> {
  const config = loadGameConfig(o.bundlePath);
  let input: SettleInput;
  let globals: SettleGlobals;
  if (o.state) {
    const j = JSON.parse(readFileSync(o.state, 'utf8')) as {
      input?: InputPatch;
      globals?: Partial<SettleGlobals>;
    };
    input = buildInput(config, j.input);
    globals = buildGlobals(config, config.tuning, j.globals ?? {});
  } else if (o.restId !== undefined && o.dbUrl) {
    ({ input, globals } = await fromDb(config, o.dbUrl, o.restId));
  } else {
    throw new Error('需要 --state 快照文件，或者 --rest 餐厅 id');
  }
  const lines: string[] = [];
  for (let round = 1; round <= o.rounds; round++) {
    const r = settleRestaurant(input, globals, seededRng(hashSeed(o.seed, round)));
    lines.push(
      `== 第 ${round} 轮：银币 ${r.coin}  经验 ${r.exp}  耗油 ${r.oil}${r.closed ? '（停业）' : ''}`,
    );
    if (r.rates) {
      for (const [k, raw] of Object.entries(r.rates)) {
        if (typeof raw !== 'object') continue;
        const v = raw as RatePart;
        const parts = Object.entries(v.parts)
          .map(([p, x]) => `${p}=${f2(x)}`)
          .join(' ');
        lines.push(`  ${k.padEnd(10)} ${f2(v.total).padStart(8)}  ${parts}`);
      }
      lines.push(`  上座桌数 ${r.rates.seated}`);
    }
    for (const t of r.tables) {
      if (!t.last || t.last.type === 0) continue;
      const req = t.last.req
        ? ` 要求${t.last.req}品 实际${t.last.grade ?? 0}品${t.last.satisfied ? ' 满足' : ''}`
        : '';
      lines.push(
        `  桌${t.no} ${CUSTOMER[String(t.last.type)] ?? t.last.type} 银${t.last.coin} 经${t.last.exp} 油${t.last.oil}${req}`,
      );
    }
    for (const d of r.drops) lines.push(`  掉落 道具${d.goodsId}×${d.num}`);
    for (const l of r.logs) lines.push(`  事件 ${l.type} ${JSON.stringify(l.params)}`);
    input = { ...input, tables: r.tables, rest: { ...input.rest, oil: input.rest.oil - r.oil } };
  }
  return lines.join('\n');
}
