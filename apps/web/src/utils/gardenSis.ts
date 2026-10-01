import type { MarketDto } from '@dt/shared';

/** 菜园姐的闲聊（问题记录 176，设计 §5.2）：和菜场状态无关；只写游戏里真有的规则 */
export const CHAT: readonly string[] = [
  '新来的？先去"更多 → 其他 → 游玩指引"看看，还有新手兑换码哦。',
  '橱柜里每种食材都有上限，一次别买太多。',
  '天气会影响客人，记得去看看今天的天气。',
  '一级、二级万能食材能在橱柜里换稀有食材，三级以上的就只能学食谱时顶替了。',
  '日常菜场白天每两小时上新一次。',
  '特价菜场每小时上新，高级食材在那里最划算。',
  '菜园里的菜熟了要及时收，不然会被人偷走。',
  '我种的菜可是全镇最新鲜的！',
  '会做的菜越多，来的客人越多。',
  '每天记得回首页签到，有签到礼包拿。',
  '蟹老板又来压价了，哼。',
  '雯姐每天都会在广场送礼券，别忘了去聊聊。',
  '大胃哥一天能吃掉我半个摊子。',
  '有空去广场转转，镇长的问题答对了有奖。',
  '菜价看起来贵，学会好菜谱可就赚回来了。',
  '菜场竞猜猜中了，奖励可不少。',
  '好友多了，互相帮忙生意更好做。',
  '累了就歇歇，体力每轮都会恢复一点。',
  '有什么不懂的，去论坛「攻略」版看看大家的心得。',
  '高级菜场一天只上新三次，错过就要等了。',
];

const hm = (iso: string) => new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

/** 当前能说的台词：看菜场状态说的权重 2，闲聊权重 1；还没读到菜场数据时只有闲聊 */
export function gardenLines(data: MarketDto | null): Array<{ text: string; weight: number }> {
  const out: Array<{ text: string; weight: number }> = [];
  if (data) {
    const say = (text: string) => out.push({ text, weight: 2 });
    if (data.special.length > 0) say(`特价菜还剩 ${data.special.length} 样，手快有手慢无！`);
    else say(`特价菜卖光了，下次 ${hm(data.nextSpecial)} 进货。`);
    say(`日常菜场下次 ${hm(data.nextDaily)} 上新，到时候来看看。`);
    if (data.guess.joined === null) say('这一轮的竞猜还没下注呢，去下面猜一猜？');
    if (data.manual.hasCard) say('你有菜场工作证，不想等的话可以手动进货。');
    if (data.cupboardFull) say('你的橱柜满了，买新菜之前先腾腾地方吧。');
  }
  for (const text of CHAT) out.push({ text, weight: 1 });
  return out;
}

/** 按权重随机挑一句，跳过上一句 */
export function pickLine(
  lines: Array<{ text: string; weight: number }>,
  last: string | null,
  rnd: () => number = Math.random,
): string {
  const pool = lines.length > 1 ? lines.filter((l) => l.text !== last) : lines;
  const total = pool.reduce((s, l) => s + l.weight, 0);
  let r = rnd() * total;
  for (const l of pool) {
    r -= l.weight;
    if (r < 0) return l.text;
  }
  return pool[pool.length - 1]!.text;
}
