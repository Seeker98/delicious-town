import type { RestLogDto } from '@dt/shared';

/** 好友动态的一行文案（服务端只存结构化参数） */
export function describeFeed(item: RestLogDto, foodName: (id: number) => string): string {
  const p = item.params;
  const who = String(p.byName ?? '有人');
  switch (item.type) {
    case 'dine.start':
      return `${who} 在你店里第 ${String(p.table)} 桌白食`;
    case 'dine.expelled':
      return `${who} 把你请出了店，你赔了 ${String(p.coin)} 银币`;
    case 'roach.laid':
      return `${who} 在你店里第 ${String(p.table)} 桌放了一只蟑螂`;
    case 'roach.killed':
      return `${who} 帮你消灭了第 ${String(p.table)} 桌的蟑螂`;
    case 'friend.refuel':
      return `${who} 帮你加了 ${String(p.oil)} 油`;
    case 'friend.flip':
      if (p.outcome === 'food') return `${who} 翻了你的橱柜，拿走了 ${foodName(Number(p.foodsId))}`;
      if (p.outcome === 'caught') return `${who} 翻你的橱柜被老鼠夹夹住，掉了 ${String(p.coin)} 银币给你`;
      return `${who} 翻了你的橱柜，什么也没拿到`;
    case 'exchange':
      return p.result === 'caught' ? `${who} 偷换你锁定的食材被抓住了` : `${who} 和你交换了食材`;
    case 'mc.eaten':
      return `${who} 品尝了你的特色菜`;
    case 'lesson.taught':
      if (!p.success) return `${who} 在你的课上${p.type === 2 ? '偷学失败' : '没学会'}`;
      return `${who} 在你的课上${p.type === 2 ? '偷学成功' : '学会了特色菜'}`;
    case 'thumb':
      return `${who} 给你点了赞`;
    case 'friend.apply':
      return `${who} 申请加你为好友`;
    case 'yard.helped': {
      const what = p.what === 'weed' ? '除了草' : p.what === 'deworm' ? '除了虫' : '浇了水';
      return `${who} 帮你的${foodName(Number(p.foodsId))}${what}`;
    }
    case 'yard.stolen': {
      const caught = p.punished ? `，被边牧逮住，留下了 ${foodName(Number(p.punished))}` : '';
      return `${who} 偷走了你的 ${foodName(Number(p.foodsId))}×${String(p.num)}${caught}`;
    }
    case 'friend.accept':
      return `${who} 同意了你的好友申请`;
    default:
      return item.type;
  }
}
