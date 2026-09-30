import type { PlantDto, StealBlock } from '@dt/shared';

export type PlantAction = 'water' | 'weed' | 'deworm' | 'reap' | 'feed' | 'remove';

const STAGES = ['', '幼年期', '育苗期', '成长期', '收获期', '枯叶期'];
export const stageName = (stage: number): string => STAGES[stage] ?? '';

/** 作物状态一句话 */
export function statusText(p: PlantDto): string {
  if (p.stage === 5) return '已枯萎，只能铲除';
  if (p.stage === 4) return `可以收获，${p.minutes} 分钟后枯萎`;
  if (p.canWater) return '可以浇水了';
  return `还要 ${p.minutes} 分钟才能浇水`;
}

/** 以下函数返回按钮灰掉的原因；'' = 可以点（和服务端的检查顺序一致） */
export function waterBlock(p: PlantDto, strength: number): string {
  if (p.stage === 5) return '已枯萎，只能铲除';
  if (strength < 1) return '体力不够';
  if (p.dry > 0) return '';
  if (p.stage === 4) return '已经成熟，不用浇水';
  if (p.worm > 0) return '有虫，先除虫';
  if (p.grass > 0) return '有草，先除草';
  if (!p.canWater) return `还要 ${p.minutes} 分钟才能浇水`;
  return '';
}

export function wormBlock(p: PlantDto, strength: number): string {
  if (p.stage === 5) return '已枯萎';
  if (strength < 1) return '体力不够';
  return p.worm > 0 ? '' : '没有虫';
}

export function grassBlock(p: PlantDto, strength: number): string {
  if (p.stage === 5) return '已枯萎';
  if (strength < 1) return '体力不够';
  return p.grass > 0 ? '' : '没有草';
}

export function reapBlock(p: PlantDto, strength: number): string {
  if (p.stage === 5) return '已枯萎，只能铲除';
  if (p.stage !== 4) return '还没成熟';
  if (p.worm > 0) return '有虫，先除虫';
  if (p.grass > 0) return '有草，先除草';
  if (strength < 1) return '体力不够';
  return '';
}

export function feedBlock(p: PlantDto, strength: number, minutes: number, have: number): string {
  if (p.stage === 5) return '已枯萎';
  if (p.stage > 3) return '只有生长期能施肥';
  if (have < 1) return '没有这种肥料';
  if (strength < 1) return '体力不够';
  if (p.stageMinutes - p.feedMin - minutes <= 0) return '这个阶段剩下的时间不够，肥料用不上';
  return '';
}

export const STEAL_TEXT: Record<Exclude<StealBlock, null>, string> = {
  stolen: '这株已经偷过了',
  withered: '已枯萎',
  not_ripe: '还没成熟',
  has_worm: '有虫，偷不了',
  has_grass: '有草，偷不了',
  steal_left: '剩得不多了，给主人留点吧',
  renown: '声望不够（偷菜要 1 点声望）',
};
