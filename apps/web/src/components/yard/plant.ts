import type { PlantDto } from '@dt/shared';
import { activeMessages } from '../../i18n';

export type PlantAction = 'water' | 'weed' | 'deworm' | 'reap' | 'feed' | 'remove';

/** 作物文案按语言（问题记录 272） */
const m = () => activeMessages().yard;

export const stageName = (stage: number): string => m().plant.stages[stage] ?? '';

/** 作物状态一句话 */
export function statusText(p: PlantDto): string {
  const x = m().plant;
  if (p.stage === 5) return x.withered;
  if (p.stage === 4) return x.ripe(p.minutes);
  if (p.canWater) return x.canWater;
  return x.waitWater(p.minutes);
}

/** 以下函数返回按钮灰掉的原因；'' = 可以点（和服务端的检查顺序一致） */
export function waterBlock(p: PlantDto, strength: number): string {
  const x = m().plant;
  if (p.stage === 5) return x.withered;
  if (strength < 1) return m().noStrength;
  if (p.dry > 0) return '';
  if (p.stage === 4) return x.noNeedWater;
  if (p.worm > 0) return x.hasWorm;
  if (p.grass > 0) return x.hasGrass;
  if (!p.canWater) return x.waitWater(p.minutes);
  return '';
}

export function wormBlock(p: PlantDto, strength: number): string {
  if (p.stage === 5) return m().plant.witheredShort;
  if (strength < 1) return m().noStrength;
  return p.worm > 0 ? '' : m().plant.noWorm;
}

export function grassBlock(p: PlantDto, strength: number): string {
  if (p.stage === 5) return m().plant.witheredShort;
  if (strength < 1) return m().noStrength;
  return p.grass > 0 ? '' : m().plant.noGrass;
}

export function reapBlock(p: PlantDto, strength: number): string {
  const x = m().plant;
  if (p.stage === 5) return x.withered;
  if (p.stage !== 4) return x.notRipe;
  if (p.worm > 0) return x.hasWorm;
  if (p.grass > 0) return x.hasGrass;
  if (strength < 1) return m().noStrength;
  return '';
}

export function feedBlock(p: PlantDto, strength: number, minutes: number, have: number): string {
  const x = m().plant;
  if (p.stage === 5) return x.witheredShort;
  if (p.stage > 3) return x.feedStage;
  if (have < 1) return x.noFert;
  if (strength < 1) return m().noStrength;
  if (p.stageMinutes - p.feedMin - minutes <= 0) return x.feedTooLate;
  return '';
}
