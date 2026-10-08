/**
 * 前后端都要用到的道具 id。服务端完整清单在 @dt/config 的 GOODS（它引用这里，保持唯一来源）；
 * 前端不能依赖 @dt/config，所以需要的放在这里
 */
export const SHARED_GOODS = {
  mysteryTicket: 10001, // 神秘礼券
  starPromoHonor: 60202, // 升星促销勋章（仓库页单独说明）
  krabCoin: 10006, // 蟹币
} as const;

/** 前后端都要用到的食材 id：万能食材 = masterBase + 食材等级（1~5 级）；一级、二级能换稀有食材（重新编号 PR 2） */
export const SHARED_FOODS = {
  masterBase: 9000,
  masterLevel1: 9001,
  masterLevel2: 9002,
} as const;

/**
 * 后台配活动奖励时的推荐清单（问题记录 505，docs/design/限时活动道具-2026-10-08.md）：
 * 平时缺、又是主线必需的东西。点一下加一行，数量是一次加的量，管理员再按活动长短改。
 * 写名字是为了按钮上不依赖目录；packages/config 的 build.test 核对 id 和名字对得上
 */
export interface ActivityRewardPreset {
  kind: 'goods' | 'foods';
  id: number;
  name: string;
  num: number;
}

export const ACTIVITY_REWARD_PRESETS: readonly ActivityRewardPreset[] = [
  // 主力：学菜缺一种食材时顶上，稀有的也行；7 天活动合计 10~15 个
  { kind: 'foods', id: 9001, name: '一级万能食材', num: 2 },
  { kind: 'foods', id: 9002, name: '二级万能食材', num: 2 },
  { kind: 'foods', id: 9003, name: '三级万能食材', num: 2 },
  { kind: 'foods', id: 9004, name: '四级万能食材', num: 1 },
  { kind: 'foods', id: 9005, name: '五级万能食材', num: 1 },
  // 随机券可能换到用不上的，可以比万能食材多；7 天合计 10~20 张
  { kind: 'goods', id: 10203, name: '三级食材随机券', num: 3 },
  { kind: 'goods', id: 10204, name: '四级食材随机券', num: 2 },
  { kind: 'goods', id: 10205, name: '五级食材随机券', num: 1 },
  // 平时只能黑市用钻石买或靠随机奖励
  { kind: 'goods', id: 10401, name: '搬家卡', num: 1 },
  { kind: 'goods', id: 10503, name: '高级油壶扩容凭证', num: 1 },
  { kind: 'goods', id: 10504, name: '协会油壶扩容凭证', num: 1 },
  { kind: 'goods', id: 10404, name: '大扩容卡', num: 1 },
  { kind: 'goods', id: 10408, name: '保险卡', num: 1 },
  // 新手（0~2 星）缺的：商店都能买，给少量就够（终审：分析文档第二节有、清单里没有）
  { kind: 'goods', id: 10413, name: '餐桌A', num: 1 },
  { kind: 'goods', id: 10405, name: '小扩建卡', num: 1 },
];
