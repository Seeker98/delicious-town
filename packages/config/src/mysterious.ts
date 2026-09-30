import type { AppraiseDef, TeacherCertDef } from './types';

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** 鉴定道具：value 里有 mysterious: [min, max]；其他道具返回 null */
export function parseAppraiseDef(value: unknown): AppraiseDef | null {
  if (!isObj(value) || !Array.isArray(value.mysterious)) return null;
  const [min, max] = value.mysterious as unknown[];
  if (!isInt(min) || !isInt(max) || min > max || !isNum(value.rate)) return null;
  return { min, max, rate: value.rate, num: isInt(value.num) && value.num > 0 ? value.num : 1 };
}

/** 教师证 value → 定义；数据不对时返回错误说明 */
export function parseTeacherCert(value: unknown): TeacherCertDef | string {
  if (!isObj(value)) return 'value is not an object';
  const levels = value.level;
  if (!Array.isArray(levels) || levels.length === 0 || !levels.every(isInt)) return 'bad level';
  for (const k of ['needStrength', 'maxNum', 'lessonHour'] as const)
    if (!isInt(value[k]) || (value[k] as number) <= 0) return `bad ${k}`;
  return {
    levels: levels as number[],
    needStrength: value.needStrength as number,
    maxNum: value.maxNum as number,
    lessonHour: value.lessonHour as number,
  };
}
