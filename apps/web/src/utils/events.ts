import type { GameEvent, RestLogDto } from '@dt/shared';
import { describeFeed } from './feed';
import { formatNum } from './format';

export interface Names {
  goodsName(id: number): string;
  foodName(id: number): string;
  mcName?(id: number): string;
  seedName?(id: number): string;
}

const mcNameOf = (names: Names, id: number) => names.mcName?.(id) ?? `特色菜${id}`;
const seedNameOf = (names: Names, id: number) => names.seedName?.(id) ?? `种子${id}`;

const KIND_NAMES: Record<string, string> = {
  coin: '银币',
  diamond: '钻石',
  exp: '经验',
  renown: '声望',
  oil: '油',
  strength: '体力',
};

/** 合并同类型、同物品、同幸运标记的事件（一次得到很多东西时不刷屏），保持首次出现的顺序 */
export function mergeEvents(events: GameEvent[]): GameEvent[] {
  const out = new Map<string, GameEvent>();
  for (const e of events) {
    const key = `${e.type}:${e.kind}:${e.id ?? ''}:${e.lucky ? 1 : 0}`;
    const cur = out.get(key);
    if (cur) cur.num += e.num;
    else out.set(key, { ...e });
  }
  return [...out.values()];
}

export function eventText(e: GameEvent, names: Names): string {
  const verb = e.type === 'gain' ? '获得' : '消耗';
  let what: string;
  if (e.kind === 'goods') what = `${names.goodsName(e.id ?? 0)}×${formatNum(e.num)}`;
  else if (e.kind === 'foods') what = `${names.foodName(e.id ?? 0)}×${formatNum(e.num)}`;
  else if (e.kind === 'remnant') what = `${mcNameOf(names, e.id ?? 0)}残卷×${formatNum(e.num)}`;
  else if (e.kind === 'seed') what = `${seedNameOf(names, e.id ?? 0)}×${formatNum(e.num)}`;
  else what = `${KIND_NAMES[e.kind] ?? e.kind} ${formatNum(e.num)}`;
  return `${verb} ${what}${e.lucky ? '（幸运）' : ''}`;
}

type P = Record<string, unknown>;
const n = (p: P, k: string) => Number(p[k] ?? 0);

const LOGS: Record<string, (p: P, names: Names) => string> = {
  'mc.learn': (p, names) => `学会了特色菜「${mcNameOf(names, n(p, 'mcId'))}」`,
  'mc.levelUp': (p, names) => `「${mcNameOf(names, n(p, 'mcId'))}」熟练度升到 ${n(p, 'curlevel')} 级`,
  'mc.forget': (p, names) => {
    const k = Array.isArray(p.cookbooks) ? p.cookbooks.length : 0;
    return `偷学失败，遗忘了 ${k} 道食谱${p.mcId ? `和特色菜「${mcNameOf(names, n(p, 'mcId'))}」` : ''}`;
  },
  'temple.trial': (p, names) =>
    p.success
      ? `「${mcNameOf(names, n(p, 'mcId'))}」试炼成功：试炼价值 +${n(p, 'worth')}%、试炼经验 +${n(p, 'exp')}%`
      : `「${mcNameOf(names, n(p, 'mcId'))}」试炼失败`,
  'kraken.forget': (p, names) => `克拉肯很不满意，你遗忘了特色菜「${mcNameOf(names, n(p, 'mcId'))}」`,
  'equip.stress': (p, names) =>
    `${names.goodsName(n(p, 'goodsId'))}强化到 +${n(p, 'to')}${p.success ? '成功' : '失败'}`,
  'level.up': (p) => `餐厅升到了 ${n(p, 'to')} 级`,
  'star.up': (p) => `餐厅升到了 ${n(p, 'star')} 星`,
  'oil.expand': (p) => `油壶扩容到 ${n(p, 'level')} 级（上限 ${formatNum(n(p, 'oilMax'))}）`,
  'rest.closed': () => '油用光了，餐厅停业',
  'rest.reopen': () => '加满了油，餐厅恢复营业',
  'rest.rename': (p) => `餐厅改名为「${String(p.to ?? '')}」`,
  'rest.move': () => '餐厅搬家了',
  'mouse.escape': () => '老鼠来了，幸运地躲过一劫',
  'mouse.trap': (p) => `捕鼠夹抓到了老鼠，得到 ${formatNum(n(p, 'coin'))} 银币`,
  'mouse.steal': (p, names) => `老鼠偷走了 ${names.foodName(n(p, 'foodsId'))}×${n(p, 'num')}`,
  'mouse.nothing': () => '老鼠来了，什么也没偷到',
  'mouse.map': () => '老鼠留下了一张探险图',
  'krab.happy': () => '蟹老板吃得很满意，回味无穷',
  'krab.angry': () => '蟹老板扫兴而归',
  'krab.husky': () => '蟹老板摸了摸二哈，没有生气',
  'krab.painting': () => '蟹老板欣赏名画，心满意足',
  'krab.driven': () => '赶走了生气的蟹老板',
  'plankton.appear': () => '痞老板来店里了',
  'plankton.driven': () => '赶走了痞老板',
  'fridge.drop': (p, names) => `冰箱满了，丢掉了 ${names.foodName(n(p, 'foodsId'))}×${n(p, 'num')}`,
  'goods.drop': (p, names) => `超过持有上限，丢掉了 ${names.goodsName(n(p, 'goodsId'))}×${n(p, 'num')}`,
  'device.place': (p, names) => `摆放了 ${names.goodsName(n(p, 'goodsId'))}`,
  'store.use': (p, names) => `使用了 ${names.goodsName(n(p, 'goodsId'))}×${n(p, 'num')}`,
  'admin.grant': (p) => `系统补偿：${String(p.reason ?? '')}`,
  'admin.rename': (p) =>
    `管理员把店名从「${String(p.from ?? '')}」改为「${String(p.to ?? '')}」：${String(p.reason ?? '')}`,
  'market.guess': (p) => `菜场竞猜开奖：猜中 ${n(p, 'hits')} 种`,
  'market.guess.refund': (p) => {
    const [day, hour] = String(p.period ?? '').split('@');
    return `菜场竞猜 ${day} ${Number(hour)} 点那一轮没有开奖，退还了报名费`;
  },
};

/** 个人日志；好友对我做的操作（好友动态类型）用动态的文案，没有文案时显示类型名 */
export function logText(l: RestLogDto, names: Names): string {
  const f = LOGS[l.type];
  return f ? f(l.params, names) : describeFeed(l, (id) => names.foodName(id));
}

/** 流水（道具流水页）的名称 */
export function recordLabel(r: { kind: string; itemId: number | null }, names: Names): string {
  if (r.kind === 'goods') return names.goodsName(r.itemId ?? 0);
  if (r.kind === 'foods') return names.foodName(r.itemId ?? 0);
  if (r.kind === 'remnant') return `${mcNameOf(names, r.itemId ?? 0)}残卷`;
  if (r.kind === 'seed') return seedNameOf(names, r.itemId ?? 0);
  return KIND_NAMES[r.kind] ?? r.kind;
}
