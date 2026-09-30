import type { MapDef, MissileDef } from './types';

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const pair = (v: unknown): [number, number] | null =>
  Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]) ? [v[0], v[1]] : null;

/** 飞弹 value → 定义；数据不对时返回错误说明 */
export function parseMissileDef(value: unknown): MissileDef | string {
  if (!isObj(value)) return 'value is not an object';
  const attack = pair(value.attack);
  if (!attack || !isNum(value.hitRate) || !isNum(value.crit) || !isNum(value.critRate))
    return 'bad missile value';
  return { attack, hitRate: value.hitRate, crit: value.crit, critRate: value.critRate };
}

/** 探险图 value → 定义（shell、xz 是仙贝相关，子项目 5 才用） */
export function parseMapDef(value: unknown): MapDef | string {
  if (!isObj(value)) return 'value is not an object';
  const level = pair(value.level);
  const num = pair(value.num);
  if (!level || !num || !isNum(value.rate) || !isNum(value.mysteriousRate) || !isNum(value.needStrength))
    return 'bad map value';
  return {
    rate: value.rate,
    level,
    num,
    mysteriousRate: value.mysteriousRate,
    needStrength: value.needStrength,
  };
}
