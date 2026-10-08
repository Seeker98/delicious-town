// 自动生成：由 scripts/gen-zh-tw.mjs 从 zh-CN 转换，不要手改；修订写在 src/i18n/zh-TW-overrides.json
import type { RestLogDto } from '@dt/shared';
import type { Names } from '../../../utils/events';
import { formatNum } from '../../../utils/format';
import fund from './fund';
import { n, table, type P } from '../../helpers';

/** 得失提示、個人日誌、好友動態的文案（問題記錄 272） */
type LogFn = (p: P, names: Names) => string;
const logs = table<LogFn>();
const mcNameOf = (names: Names, id: number) => names.mcName?.(id) ?? `特色菜${id}`;
const seedNameOf = (names: Names, id: number) => names.seedName?.(id) ?? `種子${id}`;
/** 可疑成交的所得進冷靜期（156-2） */
/** 凍結幾小時：日誌裡帶 holdHours（backlog 156-2），舊日誌沒有時是 24 */
const holdHours = (p: P) => (p.holdHours === undefined ? 24 : n(p, 'holdHours'));
const heldNote = (p: P) => (p.held ? ` (可疑成交, 所得凍結 ${holdHours(p)} 小時)` : '');
/** 銀幣和食材清單：交易所取出、沒收共用 */
const coinFoods = (p: P, names: Names, coin: (s: string) => string, sep: string) =>
  [
    ...(n(p, 'coin') > 0 ? [coin(formatNum(n(p, 'coin')))] : []),
    ...(Array.isArray(p.foods) ? p.foods : []).map(
      (f) => `${names.foodName(Number((f as P).foodsId))}×${Number((f as P).num)}`,
    ),
  ].join(sep);
/** 事件合約結算日誌帶淨投入時寫出本局盈虧（問題記錄 254） */
function predictNet(p: P): string {
  if (p.net === undefined) return '';
  const d = n(p, 'coin') - n(p, 'net');
  return `, 本局盈虧 ${d > 0 ? '+' : ''}${formatNum(d)}`;
}

/** 好友動態的一行文案（服務端只存結構化引數） */
function describeFeed(item: RestLogDto, foodName: (id: number) => string): string {
  const p = item.params;
  const who = String(p.byName ?? '有人');
  switch (item.type) {
    case 'takeaway.hired':
      return `${who} 僱你當了外賣騎手`;
    case 'dine.start':
      return `${who} 在你店裡第 ${String(p.table)} 桌白食`;
    case 'dine.expelled':
      return `${who} 把你請出了店, 你賠了 ${String(p.coin)} 銀幣`;
    case 'roach.laid':
      return `${who} 在你店裡第 ${String(p.table)} 桌放了一隻蟑螂`;
    case 'roach.killed':
      return `${who} 幫你消滅了第 ${String(p.table)} 桌的蟑螂`;
    case 'friend.refuel':
      return `${who} 幫你加了 ${String(p.oil)} 油`;
    case 'friend.flip':
      if (p.outcome === 'food') return `${who} 翻了你的櫥櫃, 拿走了 ${foodName(Number(p.foodsId))}`;
      if (p.outcome === 'caught') return `${who} 翻你的櫥櫃被老鼠夾夾住, 掉了 ${String(p.coin)} 銀幣給你`;
      return `${who} 翻了你的櫥櫃, 什麼也沒拿到`;
    case 'exchange':
      return p.result === 'caught' ? `${who} 偷換你鎖定的食材被抓住了` : `${who} 和你交換了食材`;
    case 'mc.eaten':
      return `${who} 品嚐了你的特色菜`;
    case 'lesson.taught':
      if (!p.success) return `${who} 在你的課上${p.type === 2 ? '偷學失敗' : '沒學會'}`;
      return `${who} 在你的課上${p.type === 2 ? '偷學成功' : '學會了特色菜'}`;
    case 'thumb':
      return `${who} 給你點了贊`;
    case 'friend.apply':
      return `${who} 申請加你為好友`;
    case 'yard.helped': {
      const what = p.what === 'weed' ? '除了草' : p.what === 'deworm' ? '除了蟲' : '澆了水';
      return `${who} 幫你的${foodName(Number(p.foodsId))}${what}`;
    }
    case 'yard.stolen': {
      const caught = p.punished ? `, 被邊牧逮住, 留下了 ${foodName(Number(p.punished))}` : '';
      return `${who} 偷走了你的 ${foodName(Number(p.foodsId))}×${String(p.num)}${caught}`;
    }
    case 'friend.accept':
      return `${who} 同意了你的好友申請`;
    default:
      return item.type;
  }
}

export default {
  gain: '獲得',
  loss: '消耗',
  /** 得失的資源名 */
  kind: {
    coin: '銀幣',
    diamond: '鑽石',
    exp: '經驗',
    renown: '聲望',
    oil: '油',
    strength: '體力',
  },
  remnant: (names: Names, id: number) => `${mcNameOf(names, id)}殘卷`,
  seed: (names: Names, id: number) => seedNameOf(names, id),
  basket: (name: string) => `菜籃·${name}`,
  activityCurrency: (name: string | undefined, num: string) => `${name ?? '活動貨幣'}×${num} (活動貨幣)`,
  lucky: ' (幸運)',
  /** 列表分隔：同類之間、得失之間 */
  sep: '、',
  groupSep: '；',
  more: (text: string, count: number) => `${text} 等 ${count} 項`,
  logs: logs({
    'mc.learn': (p, names) => `學會了特色菜「${mcNameOf(names, n(p, 'mcId'))}」`,
    'mc.levelUp': (p, names) => `「${mcNameOf(names, n(p, 'mcId'))}」熟練度升到 ${n(p, 'curlevel')} 級`,
    'mc.forget': (p, names) => {
      const k = Array.isArray(p.cookbooks) ? p.cookbooks.length : 0;
      const lost = typeof p.lost === 'number' ? p.lost : 0;
      if (typeof p.grades === 'number')
        return `偷學失敗, ${k} 道食譜降了 ${p.grades} 品${lost > 0 ? `, 其中 ${lost} 道忘了` : ''}${p.mcId ? `, 還忘了特色菜「${mcNameOf(names, n(p, 'mcId'))}」` : ''}`;
      return `偷學失敗, 遺忘了 ${k} 道食譜${p.mcId ? `和特色菜「${mcNameOf(names, n(p, 'mcId'))}」` : ''}`;
    },
    'temple.trial': (p, names) =>
      p.success
        ? `「${mcNameOf(names, n(p, 'mcId'))}」試煉成功: 試煉價值 +${n(p, 'worth')}%、試煉經驗 +${n(p, 'exp')}%`
        : `「${mcNameOf(names, n(p, 'mcId'))}」試煉失敗`,
    'kraken.forget': (p, names) => `克拉肯很不滿意, 你遺忘了特色菜「${mcNameOf(names, n(p, 'mcId'))}」`,
    'equip.stress': (p, names) =>
      `${names.goodsName(n(p, 'goodsId'))}強化到 +${n(p, 'to')}${p.success ? '成功' : '失敗'}`,
    'level.up': (p) => `餐廳升到了 ${n(p, 'to')} 級`,
    'star.up': (p) => `餐廳升到了 ${n(p, 'star')} 星`,
    'oil.expand': (p) => `油壺擴容到 ${n(p, 'level')} 級 (上限 ${formatNum(n(p, 'oilMax'))})`,
    'rest.closed': () => '油用光了, 餐廳停業',
    'rest.reopen': () => '加滿了油, 餐廳恢復營業',
    'rest.rename': (p) => `餐廳改名為「${String(p.to ?? '')}」`,
    'rest.move': () => '餐廳搬家了',
    'mouse.escape': () => '老鼠來了, 幸運地躲過一劫',
    'mouse.trap': (p) => `捕鼠夾抓到了老鼠, 得到 ${formatNum(n(p, 'coin'))} 銀幣`,
    'mouse.steal': (p, names) => `老鼠偷走了 ${names.foodName(n(p, 'foodsId'))}×${n(p, 'num')}`,
    'mouse.nothing': () => '老鼠來了, 什麼也沒偷到',
    'mouse.map': () => '老鼠留下了一張探險圖',
    'krab.happy': () => '蟹老闆吃得很滿意, 回味無窮',
    'krab.angry': () => '蟹老闆掃興而歸',
    'krab.husky': () => '蟹老闆摸了摸二哈, 沒有生氣',
    'krab.painting': () => '蟹老闆欣賞名畫, 心滿意足',
    'krab.driven': () => '趕走了生氣的蟹老闆',
    'plankton.appear': () => '痞老闆來店裡了',
    'plankton.driven': () => '趕走了痞老闆',
    'fridge.drop': (p, names) => `冰箱滿了, 丟掉了 ${names.foodName(n(p, 'foodsId'))}×${n(p, 'num')}`,
    'goods.drop': (p, names) => `超過持有上限, 丟掉了 ${names.goodsName(n(p, 'goodsId'))}×${n(p, 'num')}`,
    'device.place': (p, names) => `擺放了 ${names.goodsName(n(p, 'goodsId'))}`,
    'store.use': (p, names) => `使用了 ${names.goodsName(n(p, 'goodsId'))}×${n(p, 'num')}`,
    'admin.grant': (p) => `系統補償: ${String(p.reason ?? '')}`,
    redeem: (p) => `使用了兌換碼 ${String(p.code ?? '')}`,
    // 問題記錄 154：以下類型原來顯示英文類型名
    'bar.darts': (p) => `酒吧飛鏢${p.result === 'win' ? '贏了' : p.result === 'draw' ? '打平' : '輸了'}`,
    'bar.devil': (p) =>
      p.result === 'win'
        ? `魔鬼辣杯撐過 ${n(p, 'survived')} 杯, 贏了`
        : `魔鬼辣杯撐過 ${n(p, 'survived')} 杯, 倒下了`,
    'bar.memory': (p) => `記憶調酒第 ${n(p, 'level')} 關${p.correct ? '調對了' : '沒調對'}`,
    'bar.nim': (p) =>
      `最後一顆糖 (${p.table === 'expert' ? '高手桌' : '新手桌'}) ${p.result === 'win' ? '贏了' : '輸了'}`,
    'bar.cup': (p) =>
      p.result === 'lose'
        ? `猜酒杯第 ${n(p, 'round')} 輪猜錯了`
        : p.result === 'clear'
          ? `猜酒杯 ${n(p, 'round')} 輪全部猜中, 得到 ${n(p, 'awards')} 份獎勵`
          : `猜酒杯闖過 ${n(p, 'round')} 輪後收手, 得到 ${n(p, 'awards')} 份獎勵`,
    'bar.spice': (p) =>
      p.result === 'win' ? `秘製調料第 ${n(p, 'tries')} 次猜中了` : `秘製調料 ${n(p, 'tries')} 次都沒猜中`,
    'bar.deal': (p, names) =>
      p.result === 'deal'
        ? `一擲千金成交, 得到 ${formatNum(n(p, 'coin'))} 銀幣`
        : `一擲千金開啟自己的箱子, 得到${names.foodName(n(p, 'foodsId'))}×${n(p, 'num')}`,
    // 收購（問題記錄 421）
    'acquire.bought': (p) =>
      `花 ${formatNum(n(p, 'price'))} 銀幣${p.way === 'listed' ? '買下了掛牌的' : '收購了'}「${String(p.name ?? '')}」`,
    'acquire.taken': (p) => `「${String(p.byName ?? '')}」花 ${formatNum(n(p, 'price'))} 銀幣收購了你的餐廳`,
    'acquire.sold': (p) =>
      `名下的「${String(p.name ?? '')}」被「${String(p.to ?? '')}」買走, 你得到 ${formatNum(n(p, 'got'))} 銀幣`,
    'acquire.redeemed': (p) =>
      `花 ${formatNum(n(p, 'price'))} 銀幣從「${String(p.from ?? '')}」手裡贖回了自己的餐廳`,
    'acquire.lost': (p) => `「${String(p.name ?? '')}」贖回了自己, 你得到 ${formatNum(n(p, 'got'))} 銀幣`,
    'acquire.released': (p) => `放手了名下的「${String(p.name ?? '')}」`,
    'acquire.freed': (p) => `「${String(p.byName ?? '')}」放手了你的餐廳, 你又自主經營了`,
    'acquire.dividend': (p) => `昨天名下 ${n(p, 'n')} 家店分紅共 ${formatNum(n(p, 'coin'))} 銀幣`,
    'acquire.tended': (p) => `替老闆「${String(p.ownerName ?? '')}」打理了餐廳, 得到 ${n(p, 'n')} 份食材`,
    'dine.started': (p) => `去「${String(p.hostName ?? '')}」白食`,
    'dine.ended': (p) => `在「${String(p.hostName ?? '')}」白食結束`,
    'forum.post': (p) => `在論壇發了帖子 #${n(p, 'postId')}`,
    'forum.reply': (p) => `回覆了論壇帖子 #${n(p, 'postId')}`,
    'forum.edit': (p) => `編輯了論壇帖子 #${n(p, 'postId')}`,
    'forum.delete': (p) => `刪除了論壇帖子 #${n(p, 'postId')}`,
    'forum.reply.delete': (p) => `刪除了在帖子 #${n(p, 'postId')} 的回覆`,
    'forum.admin': (p) => `對論壇帖子 #${n(p, 'postId')} 做了管理操作`,
    'friend.weekly': (p, names) => `好友周榜第 ${n(p, 'rank')} 名, 獲得 ${names.goodsName(n(p, 'goodsId'))}`,
    'hiphop.event': () => '嘻哈男孩來店裡辦了活動',
    'hiphop.tip': () => '打賞了嘻哈男孩',
    'hiphop.wage': (p, names) => `領到嘻哈男孩的工資 (${names.goodsName(n(p, 'cardId'))})`,
    'hiphop.weekly': (p, names) => `嘻哈周榜第 ${n(p, 'rank')} 名, 獲得 ${names.goodsName(n(p, 'goodsId'))}`,
    'market.manual': (p) => `菜場手動進貨, 花費銀幣 ${formatNum(n(p, 'cost'))}`,
    'market.share': (p, names) => `你在菜場分享的 ${names.foodName(n(p, 'foodsId'))}×${n(p, 'num')} 被買走了`,
    'takeaway.open': () => '開通了外賣',
    'takeaway.refresh': (p) => `重新整理了外賣訂單 (今天第 ${n(p, 'times')} 次)`,
    'takeaway.deliver': () => '派出了一單外賣',
    'takeaway.claim': (p) => (p.success ? `外賣送達, 獲得銀幣 ${formatNum(n(p, 'coin'))}` : '外賣配送失敗'),
    'takeaway.rebate': (p) =>
      `當騎手送外賣, 分到銀幣 ${formatNum(n(p, 'coin'))}、經驗 ${formatNum(n(p, 'exp'))}`,
    'takeaway.hire': () => '僱了一位好友當騎手',
    'takeaway.dismiss': () => '和一位騎手結算後解約',
    'tower.rank.week': (p, names) =>
      `賽廚榜周榜第 ${n(p, 'rank')} 名, 獲得 ${names.goodsName(n(p, 'goodsId'))}`,
    'town.exchange': (p) => `在協會兌換了 ${n(p, 'num')} 次`,
    'town.levelTicket': (p) => `用 ${n(p, 'level')} 級食材兌換券換了 ${n(p, 'total')} 份食材`,
    'town.mysteryTicket': (p, names) => `用神秘食材券換到 ${names.foodName(n(p, 'foodsId'))}`,
    'town.feast': () => '參加了廣場宴席',
    'town.hammer': () => '敲了天氣錘, 改變了天氣',
    'town.mayor': (p) => (p.right ? '答對了鎮長大胃鍋的問題' : '答錯了鎮長大胃鍋的問題'),
    'town.shake': (p) => `搖錢樹搖到銀幣 ${formatNum(n(p, 'coin'))}`,
    'town.talk': () => '和小鎮居民聊了天',
    'town.wish': () => '在廣場許了願',
    'exchange.order': (p, names) =>
      `在交易所掛${p.side === 'buy' ? '買' : '賣'}單: ${names.foodName(n(p, 'foodsId'))} ×${n(p, 'qty')}, 單價 ${formatNum(n(p, 'price'))}${n(p, 'filled') > 0 ? ` (當場成交 ${n(p, 'filled')} 個)` : ''}${heldNote(p)}`,
    'exchange.fill': (p, names) =>
      p.side === 'sell'
        ? `交易所賣單成交: ${names.foodName(n(p, 'foodsId'))} ×${n(p, 'qty')}, 單價 ${formatNum(n(p, 'price'))}, 手續費 ${formatNum(n(p, 'fee'))}${p.held ? heldNote(p) : ' (所得在交易所賬戶)'}`
        : `交易所買單成交: ${names.foodName(n(p, 'foodsId'))} ×${n(p, 'qty')}, 單價 ${formatNum(n(p, 'price'))}${p.held ? heldNote(p) : ' (食材在交易所賬戶)'}`,
    'exchange.cancel': (p, names) =>
      `撤銷交易所${p.side === 'buy' ? '買' : '賣'}單: ${names.foodName(n(p, 'foodsId'))}, 退回 ${n(p, 'left')} 個`,
    'exchange.expire': (p, names) =>
      `交易所${p.side === 'buy' ? '買' : '賣'}單過期: ${names.foodName(n(p, 'foodsId'))}, 剩餘 ${n(p, 'left')} 個的凍結退回交易所賬戶`,
    'exchange.withdraw': (p, names) => `從交易所賬戶取出: ${coinFoods(p, names, (c) => `銀幣 ${c}`, '、')}`,
    'exchange.freezeCancel': (p, names) =>
      `交易所被凍結, ${p.side === 'buy' ? '買' : '賣'}單撤銷: ${names.foodName(n(p, 'foodsId'))}, 剩餘 ${n(p, 'left')} 個退回交易所賬戶`,
    'exchange.confiscate': (p, names) =>
      `交易所凍結中的所得被沒收: ${coinFoods(p, names, (c) => `銀幣 ${c}`, '、')}`,
    'predict.trade': (p) =>
      `預測「${String(p.title ?? '')}」${p.dir === 'sell' ? '賣出' : '買入'}${p.side === 'no' ? '否' : '是'} ${n(p, 'qty')} 份, 成交額 ${formatNum(n(p, 'amount'))}, 手續費 ${formatNum(n(p, 'fee'))}`,
    'predict.settle': (p) =>
      `預測「${String(p.title ?? '')}」結果為${p.outcome ? '是' : '否'}, 結算得到 ${formatNum(n(p, 'coin'))} 銀幣${predictNet(p)}`,
    'predict.refund': (p) =>
      `預測「${String(p.title ?? '')}」已作廢, 退回 ${formatNum(n(p, 'coin'))} 銀幣${predictNet(p)}`,
    // 豪華一番賞（240-2）的記錄帶 line: 'deluxe'
    'kuji.buy': (p) =>
      `買了${p.line === 'deluxe' ? '豪華籤券' : '一番賞抽賞券'} ×${n(p, 'num')}, 花費 ${formatNum(n(p, 'coin'))} 銀幣`,
    'kuji.activation': (p) => `領取活躍 ${n(p, 'points')} 點獎勵, 另得一番賞抽賞券 ×${n(p, 'num')}`,
    'kuji.draw': (p) => {
      const tiers = Object.entries((p.tiers ?? {}) as Record<string, number>)
        .map(([k, v]) => `${k} 賞 ×${v}`)
        .join('、');
      return `${p.line === 'deluxe' ? '豪華' : ''}一番賞第 ${n(p, 'seq')} 池抽了 ${n(p, 'num')} 張: ${tiers}${p.last ? ', 並拿下最後賞' : ''}`;
    },
    // 小鎮發展基金（backlog 基金）：檔位名跟著發展基金頁的叫法
    'fund.deposit': (p) =>
      `向小鎮發展基金存入 ${formatNum(n(p, 'coin'))} 銀幣 (${fund.tierName(String(p.tier ?? ''))})`,
    'fund.claim': (p, names) =>
      `領取小鎮發展基金: 拿回 ${formatNum(n(p, 'coin'))} 銀幣和${names.goodsName(n(p, 'medal'))}`,
    'fund.withdraw': (p) => `提前取出小鎮發展基金, 拿回 ${formatNum(n(p, 'coin'))} 銀幣`,
    'activity.claim': (p) => `領取了活動「${String(p.title ?? '')}」的獎勵`,
    'activity.unlock': (p) => `解鎖了活動「${String(p.title ?? '')}」的進階獎勵`,
    'activity.exchange': (p) => `在活動「${String(p.title ?? '')}」兌換了 ${String(p.times ?? 1)} 次`,
    'mail.claim': (p) => `領取了郵件「${String(p.title ?? '')}」的附件`,
    'admin.rename': (p) =>
      `管理員把店名從「${String(p.from ?? '')}」改為「${String(p.to ?? '')}」: ${String(p.reason ?? '')}`,
    'market.guess': (p) => `菜場競猜開獎: 猜中 ${n(p, 'hits')} 種`,
    'market.guess.refund': (p) => {
      const [day, hour] = String(p.period ?? '').split('@');
      return `菜場競猜 ${day} ${Number(hour)} 點那一輪沒有開獎, 退還了報名費`;
    },
  }),
  feed: (item: RestLogDto, foodName: (id: number) => string) => describeFeed(item, foodName),
};
