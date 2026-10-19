import type { SettleResult } from '../settlement/types';

/** 顾客类型（结算的 customers 键）：空桌、挑剔顾客走了、蟑螂被消灭——这几种桌上没人 */
const NOBODY = new Set(['0', '-2', '-3']);

/**
 * 一轮营业里成就要记的计数：蟹老板吃到大餐，PR② 的满意的挑剔顾客、满座和几样隐藏成就。
 * 只从结算结果里读，不在结算的纯函数里多取随机数（模拟和测试的种子序列不变）
 */
export function roundAchCounters(
  r: Pick<SettleResult, 'tables' | 'customers' | 'oil' | 'logs'>,
  o: { coin: number; oilBefore: number },
): Array<[string, number]> {
  const c = r.customers;
  const has = (type: number) => (c[String(type)] ?? 0) > 0;
  let tables = 0;
  let empty = 0;
  for (const [k, n] of Object.entries(c)) {
    if (k === 'n3') continue;
    tables += n;
    if (NOBODY.has(k)) empty += n;
  }
  /** 来过客人的桌（挑剔顾客走了也算来过；蟑螂被消灭的不算） */
  const came = tables - (c['0'] ?? 0) - (c['-3'] ?? 0);
  return [
    ['picky.ok', r.tables.filter((t) => t.last?.type === 2 && t.last.satisfied).length],
    ['round.full', tables > 0 && empty === 0 ? 1 : 0],
    // 一滴入魂：这一轮只耗 1 油（油本来就只剩 1 的不算）
    ['round.oneOil', r.oil === 1 && o.oilBefore > 1 ? 1 : 0],
    // 门可罗雀：开着门，一桌客人都没来
    ['round.empty', tables > 0 && came === 0 ? 1 : 0],
    // 倒贴：这一轮银币是负的（白食亏的比赚的多）
    ['round.negative', o.coin < 0 ? 1 : 0],
    // 比奇堡全家福：蟹老板、章鱼哥、痞老板同一轮都在
    ['round.bikini', has(8) && has(6) && has(7) ? 1 : 0],
    // 灾难现场：白食客、蟑螂、痞老板同一轮都在
    ['round.disaster', has(9) && has(3) && has(7) ? 1 : 0],
    // 痞老板的老巢：痞老板在店里的轮数（他不会自己走）
    ['plankton.stay', has(7) ? 1 : 0],
    // 蟹老板吃到大餐、生气（蟹老板的怒火）
    ['krab.happy', r.logs.filter((l) => l.type === 'krab.happy').length],
    ['krab.angry', r.logs.filter((l) => l.type === 'krab.angry').length],
  ];
}
