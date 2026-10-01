import type { BarDto } from '@dt/shared';
import type { MascotLine } from './mascot';

/** 雯姐在酒吧的闲聊（问题记录 210）：只写游戏里真有的规则 */
export const WENJIE_CHAT: readonly string[] = [
  '来啦？今天想玩点什么？',
  '神秘礼券不够了，就去广场找我聊聊天，每天都送。',
  '猜酒杯连胜越多，下注越大，奖励也越好，见好就收哦。',
  '魔鬼辣杯里有一杯是特辣的，喝之前想清楚。',
  '记忆调酒要看清楚顺序，越往后配方越长。',
  '老虎机每次开 3 格，抽得越多离保底越近。',
  '蟹币可以用神秘礼券换，在老虎机那边。',
  '划拳输了别上头，明天再来。',
  '飞镖瞄准中间，越靠近靶心分越高。',
  '酒吧的游戏每天都有次数，别一口气玩完。',
  '大胃哥又来蹭酒了，真拿他没办法。',
  '我在广场也有摊位，记得常来看看。',
];

/** 当前能说的台词：看酒吧状态说的权重 2，闲聊权重 1；还没读到数据时只有闲聊 */
export function wenjieLines(data: BarDto | null): MascotLine[] {
  const out: MascotLine[] = [];
  if (data) {
    const say = (text: string) => out.push({ text, weight: 2 });
    const mem = data.memory.max - data.memory.played;
    if (mem > 0) say(`记忆调酒今天还能玩 ${mem} 局，来试试记性？`);
    const darts = data.darts.max - data.darts.played;
    if (darts > 0) say(`飞镖今天还能扔 ${darts} 局，手稳一点。`);
    if (data.tickets === 0) say('神秘礼券用完了？去广场找我聊天，每天送你几张。');
    if (data.slot.floorLeft <= 5) say(`老虎机再拉 ${data.slot.floorLeft} 次就必出稀有了！`);
    if (data.devil.round && data.devil.round.result === null) say('魔鬼辣杯还没喝完呢，别想溜。');
  }
  for (const text of WENJIE_CHAT) out.push({ text, weight: 1 });
  return out;
}
