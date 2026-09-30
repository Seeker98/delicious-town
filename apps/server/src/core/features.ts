import { isFeatureEnabled, type ShardSettings } from '@dt/config';

/** 代码里已经实现的功能。任务依赖的功能不在这里时自动跳过（设计文档 裁定 7） */
export const IMPLEMENTED_FEATURES: ReadonlySet<string> = new Set([
  'restaurant',
  'settlement',
  'world',
  'growth',
  'cookbook',
  'cupboard',
  'market',
  'shop',
  'store',
  'task',
  'friend',
  'equip',
  'mysterious',
  'temple',
  'yard',
  'bar',
  'tower',
  'takeaway',
  'town',
]);

export function featureAvailable(settings: ShardSettings, feature: string): boolean {
  return IMPLEMENTED_FEATURES.has(feature) && isFeatureEnabled(settings, feature);
}
