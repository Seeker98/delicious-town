import type { GameEvent } from '@dt/shared';
import type { LedgerEntry } from '../modules/ledger/ledger';
import { notEnough } from './errors';
import { applyExp } from './level';
import { restLog, setRest, type Op } from './op';

type Kind = LedgerEntry['kind'];

export interface GainOptions {
  /** 流水来源，默认 op.source */
  source?: string;
  /** 是否写流水，默认 true（结算的银币经验由 income_round 记录，不写流水） */
  ledger?: boolean;
  /** 是否给前端得失提示，默认 true */
  event?: boolean;
  lucky?: boolean;
}

export function pushEvent(op: Op, e: GameEvent): void {
  op.events.push(e);
}

export function pushLedger(op: Op, kind: Kind, delta: number, source: string, itemId?: number): void {
  op.ledger.push({ restId: op.rest.id, kind, delta, source, ...(itemId !== undefined ? { itemId } : {}) });
}

/** 记一笔变化：流水 + 得失提示 */
export function recordChange(op: Op, kind: Kind, delta: number, opts: GainOptions = {}, id?: number): void {
  if (delta === 0) return;
  if (opts.ledger !== false) pushLedger(op, kind, delta, opts.source ?? op.source, id);
  if (opts.event !== false) {
    pushEvent(op, {
      type: delta > 0 ? 'gain' : 'loss',
      kind,
      num: Math.abs(delta),
      ...(id !== undefined ? { id } : {}),
      ...(opts.lucky ? { lucky: true } : {}),
    });
  }
}

export function gainCoin(op: Op, n: number, opts: GainOptions = {}): void {
  if (n === 0) return;
  setRest(op, 'coin', Math.max(0, op.rest.coin + n));
  recordChange(op, 'coin', n, opts);
}

export function spendCoin(op: Op, n: number, opts: GainOptions = {}): void {
  if (n <= 0) return;
  if (op.rest.coin < n) throw notEnough('coin', n, op.rest.coin);
  setRest(op, 'coin', op.rest.coin - n);
  recordChange(op, 'coin', -n, opts);
}

export function gainDiamond(op: Op, n: number, opts: GainOptions = {}): void {
  if (n === 0) return;
  setRest(op, 'diamond', op.rest.diamond + n);
  recordChange(op, 'diamond', n, opts);
}

export function spendDiamond(op: Op, n: number, opts: GainOptions = {}): void {
  if (n <= 0) return;
  if (op.rest.diamond < n) throw notEnough('diamond', n, op.rest.diamond);
  setRest(op, 'diamond', op.rest.diamond - n);
  recordChange(op, 'diamond', -n, opts);
}

/** 体力可以超过上限（体力卡），恢复任务自己控制上限 */
export function gainStrength(op: Op, n: number, opts: GainOptions = {}): void {
  if (n === 0) return;
  setRest(op, 'strength', op.rest.strength + n);
  recordChange(op, 'strength', n, opts);
}

export function spendStrength(op: Op, n: number, opts: GainOptions = {}): void {
  if (n <= 0) return;
  if (op.rest.strength < n) throw notEnough('strength', n, op.rest.strength);
  setRest(op, 'strength', op.rest.strength - n);
  recordChange(op, 'strength', -n, opts);
}

/** 声望可以为负 */
export function gainRenown(op: Op, n: number, opts: GainOptions = {}): void {
  if (n === 0) return;
  setRest(op, 'renown', op.rest.renown + n);
  recordChange(op, 'renown', n, opts);
}

/** 加油，不超过油上限；返回实际加了多少 */
export function gainOil(op: Op, n: number, opts: GainOptions = {}): number {
  const add = Math.max(0, Math.min(n, op.rest.oil_max - op.rest.oil));
  if (add === 0) return 0;
  setRest(op, 'oil', op.rest.oil + add);
  recordChange(op, 'oil', add, opts);
  return add;
}

/** 经验入账并处理升级：每级属性点 +3、幸运 +1、餐桌上限 +1（规格书 02 §2.2）；返回升了几级 */
export function gainExp(op: Op, n: number, opts: GainOptions = {}): number {
  if (n <= 0) return 0;
  const from = op.rest.level;
  const r = applyExp(from, op.rest.exp, n);
  setRest(op, 'exp', r.exp);
  recordChange(op, 'exp', n, opts);
  if (r.gained > 0) {
    const t = op.tuning.rest;
    setRest(op, 'level', r.level);
    setRest(op, 'attr_left', op.rest.attr_left + t.attrPerLevel * r.gained);
    setRest(op, 'luck', op.rest.luck + t.luckPerLevel * r.gained);
    setRest(op, 'table_num', op.rest.table_num + t.tablesPerLevel * r.gained);
    restLog(op, 'level.up', { from, to: r.level });
  }
  return r.gained;
}
