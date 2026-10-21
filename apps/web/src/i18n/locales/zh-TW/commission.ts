// 自动生成：由 scripts/gen-zh-tw.mjs 从 zh-CN 转换，不要手改；修订写在 packages/shared/src/zh-TW-overrides.json
import { formatNum } from '../../../utils/format';

/**
 * 小鎮委員會（2026-10-16）：委員會頁、委員的職務和臺詞、今日要點。
 * 臺詞只寫遊戲裡真有的規則；名字和別處同一個人時要一致（npc、market.npc、labels）
 */
export default {
  title: '小鎮委員會',
  briefTitle: '今日要點',
  briefHint: '點一行看委員',
  noticesTitle: '委員會公報',
  noticesEmpty: '委員會還沒發過公報。',
  noticesFoot: '公報也會登在廣場的小鎮新聞裡。',
  newTag: '新',
  loadFailed: '讀取委員會失敗',
  members: {
    mayor: {
      name: '鎮長大胃鍋',
      role: '主席',
      duty: '委員會總體、發公報',
      lines: [
        '委員會六個人各管一攤。規矩要變, 先在這裡發公報。',
        '公報也會登在小鎮新聞裡, 錯過了可以來這兒翻。',
      ],
    },
    squid: {
      name: '章魚哥',
      role: '衛生與食品安全委員',
      duty: '蟑螂、老鼠、店裡的衛生',
      lines: [
        '蟑螂落在會坐人的桌子上, 那一桌這一輪就收不到錢。',
        '老鼠夾先判, 夾住了還會掉點銀幣給你。',
        '防蟲設施放在設施第 4、5 格, 2 星才開。',
        '每天 0 點我去 2 星以上的店看一圈, 結果寫在餐廳動態裡。',
      ],
    },
    fandao: {
      name: '飯老道',
      role: '氣候與天氣委員',
      duty: '天氣、時令',
      lines: ['天一變, 小鎮新聞裡都有記載。', '特殊天氣的時候, 所有特色菜都當令。'],
    },
    garden: {
      name: '菜園姐',
      role: '市場與競爭委員',
      duty: '菜場、交易所',
      lines: ['特價菜場一批賣完了, 就等下一批。', '交易所什麼食材都能買賣, 系統只收賣稀有的。'],
    },
    gary: {
      name: '蓋樂瑞',
      role: '經濟與金融委員',
      duty: '發展基金、理財',
      lines: [
        '小鎮發展基金: 存滿期限領回大部分本金, 還送經驗勳章。',
        '理財: 存滿期限本金全退, 利息是街市補給包。',
      ],
    },
    bro13: {
      name: '13 哥',
      role: '宣傳與通訊委員',
      duty: '喇叭、小鎮日報',
      lines: ['每天來跟我聊聊, 送你喇叭。', '喇叭喊一句, 全鎮都聽得見。'],
    },
  },
  /** 今日要點：每位委員一行 */
  brief: {
    squid: (kills: number, visits: number, steals: number) =>
      `全鎮今天滅了 ${formatNum(kills)} 隻蟑螂；老鼠來了 ${formatNum(visits)} 次, 偷走 ${formatNum(steals)} 次`,
    fandao: (weather: string, time: string) => `現在${weather}, ${time} 換天`,
    garden: (n: number, names: string) => `特價菜場還有 ${n} 種: ${names}`,
    /** 特價菜場食材名之間 */
    sep: '、',
    gardenMore: (names: string) => `${names} 等`,
    gardenNone: (time: string) => `特價菜場賣完了, 下一批 ${time}`,
    gary: (coin: string) => `全鎮存在基金和理財裡的銀幣: ${coin}`,
    bro13: (title: string) => `日報: ${title}`,
    bro13None: '還沒有日報',
    off: '這個區服沒開',
  },
  /** 點一行彈出的委員面板 */
  sheet: {
    duty: '分管',
    today: '今天全鎮',
    mine: '你的店',
    mineNone: '還沒巡查過',
    tapHint: '點頭像換一句',
    rule: '每天 0 點巡查一次, 只看 2 星以上的店；好友放的蟑螂不算',
    go: {
      squid: '看我的衛生巡查',
      fandao: '去看天氣',
      garden: '去菜場',
      gary: '去銀行',
      bro13: '去廣場',
    },
  },
};
