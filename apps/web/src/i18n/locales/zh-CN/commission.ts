import { formatNum } from '../../../utils/format';

/**
 * 小镇委员会（2026-10-16）：委员会页、委员的职务和台词、今日要点。
 * 台词只写游戏里真有的规则；名字和别处同一个人时要一致（npc、market.npc、labels）
 */
export default {
  title: '小镇委员会',
  briefTitle: '今日要点',
  briefHint: '点一行看委员',
  noticesTitle: '委员会公报',
  noticesEmpty: '委员会还没发过公报。',
  noticesFoot: '公报也会登在广场的小镇新闻里。',
  newTag: '新',
  loadFailed: '读取委员会失败',
  members: {
    mayor: {
      name: '镇长大胃锅',
      role: '主席',
      duty: '委员会总体、发公报',
      lines: [
        '委员会六个人各管一摊。规矩要变, 先在这里发公报。',
        '公报也会登在小镇新闻里, 错过了可以来这儿翻。',
      ],
    },
    squid: {
      name: '章鱼哥',
      role: '卫生与食品安全委员',
      duty: '蟑螂、老鼠、店里的卫生',
      lines: [
        '蟑螂落在会坐人的桌子上, 那一桌这一轮就收不到钱。',
        '老鼠夹先判, 夹住了还会掉点银币给你。',
        '防虫设施放在设施第 4、5 格, 2 星才开。',
        '每天 0 点我去 2 星以上的店看一圈, 结果写在餐厅动态里。',
      ],
    },
    fandao: {
      name: '饭老道',
      role: '气候与天气委员',
      duty: '天气、时令',
      lines: ['天一变, 小镇新闻里都有记载。', '特殊天气的时候, 所有特色菜都当令。'],
    },
    garden: {
      name: '菜园姐',
      role: '市场与竞争委员',
      duty: '菜场、交易所',
      lines: ['特价菜场一批卖完了, 就等下一批。', '交易所什么食材都能买卖, 系统只收卖稀有的。'],
    },
    gary: {
      name: '盖乐瑞',
      role: '经济与金融委员',
      duty: '发展基金、理财',
      lines: [
        '小镇发展基金: 存满期限领回大部分本金, 还送经验勋章。',
        '理财: 存满期限本金全退, 利息是街市补给包。',
      ],
    },
    bro13: {
      name: '13 哥',
      role: '宣传与通讯委员',
      duty: '喇叭、小镇日报',
      lines: ['每天来跟我聊聊, 送你喇叭。', '喇叭喊一句, 全镇都听得见。'],
    },
  },
  /** 今日要点：每位委员一行 */
  brief: {
    squid: (kills: number, visits: number, steals: number) =>
      `全镇今天灭了 ${formatNum(kills)} 只蟑螂；老鼠来了 ${formatNum(visits)} 次, 偷走 ${formatNum(steals)} 次`,
    fandao: (weather: string, time: string) => `现在${weather}, ${time} 换天`,
    garden: (n: number, names: string) => `特价菜场还有 ${n} 种: ${names}`,
    /** 特价菜场食材名之间 */
    sep: '、',
    gardenMore: (names: string) => `${names} 等`,
    gardenNone: (time: string) => `特价菜场卖完了, 下一批 ${time}`,
    gary: (coin: string) => `全镇存在基金和理财里的银币: ${coin}`,
    bro13: (title: string) => `日报: ${title}`,
    bro13None: '还没有日报',
    off: '这个区服没开',
  },
  /** 点一行弹出的委员面板 */
  sheet: {
    duty: '分管',
    today: '今天全镇',
    mine: '你的店',
    mineNone: '还没巡查过',
    tapHint: '点头像换一句',
    rule: '每天 0 点巡查一次, 只看 2 星以上的店；好友放的蟑螂不算',
    go: {
      squid: '看我的卫生巡查',
      fandao: '去看天气',
      garden: '去菜场',
      gary: '去银行',
      bro13: '去广场',
    },
  },
};
