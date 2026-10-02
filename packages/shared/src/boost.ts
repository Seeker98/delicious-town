/** 全服加成白名单（问题记录 148-4，设计 §3）：服务端和前端共用 */
export interface BoostDef {
  label: string;
  /** tuning 里的路径，倍数同时乘到这几项上 */
  paths: readonly string[];
  /** 单个活动可填的倍数范围，也是多个活动叠加后的夹取范围 */
  min: number;
  max: number;
  /** 结果的绝对上限（概率类为 1） */
  cap?: number;
  /** 结果四舍五入取整，至少 1 */
  int?: boolean;
}

export const BOOSTS = {
  exp: { label: '经营经验', paths: ['settlement.expMultiplier'], min: 1, max: 5 },
  coin: { label: '经营银币', paths: ['settlement.coinMultiplier'], min: 1, max: 3 },
  marketPrice: { label: '菜场价格', paths: ['market.priceFactor'], min: 0.5, max: 1 },
  strength: { label: '体力恢复', paths: ['strength.regen', 'strength.luckyRegen'], min: 1, max: 3 },
  dtTicket: { label: '德拓券掉率', paths: ['settlement.dtTicketBaseRate'], min: 1, max: 5 },
  equipStress: { label: '强化成功率', paths: ['equip.baseRate'], min: 1, max: 1.25, cap: 1 },
  gemLevel: { label: '宝石升级成功率', paths: ['equip.gemBaseRate'], min: 1, max: 1.05, cap: 1 },
  yardYield: { label: '菜园土地等级加产', paths: ['yard.yieldPerLevel'], min: 1, max: 3, int: true },
  guardianRare: { label: '守护兽稀有掉落', paths: ['temple.guardianRareRate'], min: 1, max: 2, cap: 1 },
  sellRate: { label: '商店卖出价', paths: ['shop.sellRate'], min: 1, max: 1.3, cap: 1 },
} as const satisfies Record<string, BoostDef>;
export type BoostKey = keyof typeof BOOSTS;

export interface BoostItem {
  key: string;
  factor: number;
}

export const boostDefOf = (key: string): BoostDef | undefined =>
  Object.hasOwn(BOOSTS, key) ? (BOOSTS as Record<string, BoostDef>)[key] : undefined;

/** "经营经验 ×2、菜场价格 ×0.8" */
export const boostText = (items: BoostItem[]): string =>
  items.map((i) => `${boostDefOf(i.key)?.label ?? i.key} ×${i.factor}`).join('、');
