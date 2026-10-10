// 自动生成：由 scripts/gen-zh-tw.mjs 从 zh-CN 转换，不要手改；修订写在 src/i18n/zh-TW-overrides.json
import { n, num, type P, str, table } from '../../helpers';

/** 一封系統郵件的標題和正文；正文為 null 時顯示郵件原文（系統補償的說明是管理員寫的） */
interface MailText {
  title: (p: P) => string;
  body: ((p: P) => string) | null;
}

/**
 * 服務端只給程式碼和引數、前端按語言顯示的文字（問題記錄 272）：
 * 系統郵件、自動預測題、NPC 臺詞、外賣意外、鑑定失敗、加成來源名。
 * 郵件引數裡的 targetName（舉報物件）、jade / xuan（帽子全名）由前端補上
 */
export default {
  mail: table<MailText>()({
    'activity.unclaimed': {
      title: (p) => `《${str(p.activity)}》未領取獎勵`,
      body: () => '活動結束時你還有這些獎勵沒有領取, 現在通過郵件補發給你。',
    },
    'activity.rank': {
      title: (p) => `《${str(p.activity)}》貢獻榜第 ${n(p, 'rank')} 名獎勵`,
      body: () => '感謝你為全服合力做出的貢獻, 這是你的名次獎勵。',
    },
    grant: { title: () => '系統補償', body: null },
    'quest.compensate': {
      title: () => '任務獎勵調整補發',
      body: () => '升到一星、二星的任務獎勵調整了, 補上你還沒拿到的道具。',
    },
    'invite.welcome': { title: () => '歡迎來到小鎮', body: () => '你是被朋友邀請來的, 送你一份新手禮包。' },
    'invite.reward': {
      title: () => '邀請獎勵',
      body: (p) => `你邀請的「${str(p.rest)}」達到 ${n(p, 'level')} 級, 感謝你把朋友帶到小鎮！`,
    },
    'hat.upgrade': {
      title: () => '贊助帽子升級',
      body: (p) => `餐廳升到六星, ${str(p.jade)}升級為${str(p.xuan)}。`,
    },
    'report.handled': {
      title: () => '舉報結果',
      body: (p) => `你舉報的${str(p.targetName)}已處理, 感謝你維護小鎮。`,
    },
    'report.rejected': { title: () => '舉報結果', body: (p) => `你舉報的${str(p.targetName)}經核實未違規。` },
    'wishtree.win': {
      title: () => '許願樹: 願望成真',
      body: (p) =>
        `你在許願樹下許的願成真了！附件是樹上結的道具和稱號, 稱號領取後 ${n(p, 'titleDays')} 天有效。`,
    },
    'report.penalty': {
      title: () => '違規處理通知',
      body: (p) => {
        const actions: Record<string, string> = { delete: '刪除', clear: '清空', rename: '強制改名' };
        // 內容已經不在（action = none）時不說"因違規已記錄違規"（backlog 6B-1）
        const what = actions[str(p.action)]
          ? `因違規已被${actions[str(p.action)]}`
          : '被認定違規, 已記錄在案';
        const ban =
          p.banDays === null || p.banDays === undefined
            ? ''
            : num(p.banDays) === 0
              ? '賬號永久封禁。'
              : `賬號封禁 ${num(p.banDays)} 天。`;
        return `你的${str(p.targetName)}${what}。${ban}\n說明: ${str(p.note)}`;
      },
    },
  }),
  /** 舉報物件 */
  reportTargets: {
    post: '帖子',
    reply: '回覆',
    broadcast: '喇叭',
    rest_name: '店名',
    notice: '店鋪公告',
  } as Record<string, string>,
  /** 自動預測題（238-2）：題目、說明、判定依據；day 是"10月3日"這樣的日期 */
  predict: {
    krab: {
      title: (from: number, to: number) => `明天蟹老闆會在 ${from}~${to} 號街出現嗎`,
      desc: (hour: number) => `以明天 ${hour} 點系統重新整理的位置為準, 之後被驅趕改變的不算。`,
      note: (day: string, hour: number, street: number) => `${day} ${hour} 點蟹老闆重新整理在 ${street} 號街`,
    },
    hiphop: {
      /** place 為 null 表示"某家玩家餐廳" */
      title: (place: string | null) =>
        place === null ? '明天嘻哈男孩會去某家玩家餐廳嗎' : `明天嘻哈男孩會出現在${place}嗎`,
      desc: (hour: number) => `以明天 ${hour} 點嘻哈男孩出現的地點為準。`,
      note: (day: string, place: string) => `${day}嘻哈男孩出現在${place}`,
    },
    market: {
      title: (hour: number, level: number) => `今天 ${hour} 點的日常貨架會出現 ${level} 級稀有食材嗎`,
      desc: (hour: number) => `以 ${hour} 點系統進貨的日常貨架為準, 玩家手動進的貨不算。`,
      yes: (day: string, hour: number, level: number, foods: string) =>
        `${day} ${hour} 點日常貨架上了 ${level} 級稀有食材: ${foods}`,
      no: (day: string, hour: number, level: number) => `${day} ${hour} 點日常貨架沒有 ${level} 級稀有食材`,
    },
    weather: {
      title: (hour: number, type: string) => `今天 ${hour} 點自動輪換的天氣是${type}類嗎`,
      desc: (hour: number) => `以 ${hour} 點系統自動輪換出的天氣為準, 之後有人用雷神錘改的不算。`,
      note: (day: string, hour: number, weather: string, type: string) =>
        `${day} ${hour} 點自動輪換的天氣是${weather} (${type}類)`,
      hammer: (weather: string) => `；之後有人用雷神錘改成了${weather}, 按題目規則不算`,
      /** 天氣大類（下標 = 類型） */
      types: ['', '晴', '雨', '雪', '風沙霧霾'],
    },
    stats: {
      title: '今天全服營業銀幣會超過昨天嗎',
      desc: (close: number) =>
        `以今天全天全服餐廳的營業銀幣為準, 明天 0 點後判定；嚴格多於昨天才算"是"。${close} 點截止交易。`,
      note: (day: string, today: string, prevDay: string, yesterday: string) =>
        `${day} ${today}；${prevDay} ${yesterday}`,
    },
    voidMissing: '資料缺失, 自動作廢',
  },
  /** 廣場 NPC 臺詞（照原版 NPCTools） */
  talk: {
    bigEater: '你真有品味! 我也是這樣覺得的! 哈哈哈!',
    carmenFirst: '第一次見面, 這張神秘食材兌換券送你。',
    bigEaterFirst: '你! 很有個性是吧!',
    wenjie: '用了飄柔就明顯氣質上來了!',
    bro13: '愛就直接去做!!!',
    mayorRight: '謝謝你, 我現在就去找他, 好好彌補他！',
    mayorWrong: '你覺得亂說一個位置我就會信嗎！',
  },
  /** 外賣配送失敗的原因（下標 = 服務端給的序號，原版 takeawayDeliveryFailRessonList） */
  takeawayFail: [
    '遇到了大堵車!',
    '前輪爆胎了!',
    '前女友擋在路中間!',
    '電瓶車沒電了!',
    '摔了一跤!',
    '接單太多了!',
    '顧客不滿意!',
    '顧客退單了!',
  ] as string[],
  /** 特色菜鑑定失敗的文案（下標 = 服務端給的序號，規格書 04 §4.3） */
  appraiseFail: [
    '這只是一堆廁紙而已',
    '上面只有一些看不懂的塗鴉',
    '字跡被油漬糊住了, 什麼也看不清',
    '原來是一張過期的選單',
  ] as string[],
  /** 加成來源的名字（設施、套裝、道具的名字來自目錄） */
  effect: {
    device: '設施',
    equip: '廚具',
    hangover: '宿醉',
    suit: (name: string, need: number) => `${name} (${need} 件)`,
    suitFallback: '套裝',
    bless: (name: string) => `今日星願: ${name}`,
  },
};
