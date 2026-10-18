import { n, num, type P, str, table } from '../../helpers';

/** 一封系统邮件的标题和正文；正文为 null 时显示邮件原文（系统补偿的说明是管理员写的） */
interface MailText {
  title: (p: P) => string;
  body: ((p: P) => string) | null;
}

/**
 * 服务端只给代码和参数、前端按语言显示的文字（问题记录 272）：
 * 系统邮件、自动预测题、NPC 台词、外卖意外、鉴定失败、加成来源名。
 * 邮件参数里的 targetName（举报对象）、jade / xuan（帽子全名）由前端补上
 */
export default {
  mail: table<MailText>()({
    'activity.unclaimed': {
      title: (p) => `《${str(p.activity)}》未领取奖励`,
      body: () => '活动结束时你还有这些奖励没有领取, 现在通过邮件补发给你。',
    },
    'activity.rank': {
      title: (p) => `《${str(p.activity)}》贡献榜第 ${n(p, 'rank')} 名奖励`,
      body: () => '感谢你为全服合力做出的贡献, 这是你的名次奖励。',
    },
    grant: { title: () => '系统补偿', body: null },
    'quest.compensate': {
      title: () => '任务奖励调整补发',
      body: () => '升到一星、二星的任务奖励调整了, 补上你还没拿到的道具。',
    },
    'invite.welcome': { title: () => '欢迎来到小镇', body: () => '你是被朋友邀请来的, 送你一份新手礼包。' },
    'invite.reward': {
      title: () => '邀请奖励',
      body: (p) => `你邀请的「${str(p.rest)}」达到 ${n(p, 'level')} 级, 感谢你把朋友带到小镇！`,
    },
    'hat.upgrade': {
      title: () => '赞助帽子升级',
      body: (p) => `餐厅升到六星, ${str(p.jade)}升级为${str(p.xuan)}。`,
    },
    'report.handled': {
      title: () => '举报结果',
      body: (p) => `你举报的${str(p.targetName)}已处理, 感谢你维护小镇。`,
    },
    'report.rejected': { title: () => '举报结果', body: (p) => `你举报的${str(p.targetName)}经核实未违规。` },
    'oilsaver.revamp': {
      title: () => '节油器改版补偿',
      body: () =>
        '节油器改版了: 摆着的节油器已经换成卖油翁的铜钱阀 (24 小时内总耗油 -90%), 仓库里的中效、特供节油器并成了中级节油器。附件再送每家一个卖油翁的铜钱阀。',
    },
    'wishtree.win': {
      title: () => '许愿树: 愿望成真',
      body: (p) =>
        `你在许愿树下许的愿成真了！附件是树上结的道具和称号, 称号领取后 ${n(p, 'titleDays')} 天有效。`,
    },
    'report.penalty': {
      title: () => '违规处理通知',
      body: (p) => {
        const actions: Record<string, string> = { delete: '删除', clear: '清空', rename: '强制改名' };
        // 内容已经不在（action = none）时不说"因违规已记录违规"（backlog 6B-1）
        const what = actions[str(p.action)]
          ? `因违规已被${actions[str(p.action)]}`
          : '被认定违规, 已记录在案';
        const ban =
          p.banDays === null || p.banDays === undefined
            ? ''
            : num(p.banDays) === 0
              ? '账号永久封禁。'
              : `账号封禁 ${num(p.banDays)} 天。`;
        return `你的${str(p.targetName)}${what}。${ban}\n说明: ${str(p.note)}`;
      },
    },
  }),
  /** 举报对象 */
  reportTargets: {
    post: '帖子',
    reply: '回复',
    broadcast: '喇叭',
    rest_name: '店名',
    notice: '店铺公告',
  } as Record<string, string>,
  /** 自动预测题（238-2）：题目、说明、判定依据；day 是"10月3日"这样的日期 */
  predict: {
    krab: {
      title: (from: number, to: number) => `明天蟹老板会在 ${from}~${to} 号街出现吗`,
      desc: (hour: number) => `以明天 ${hour} 点系统刷新的位置为准, 之后被驱赶改变的不算。`,
      note: (day: string, hour: number, street: number) => `${day} ${hour} 点蟹老板刷新在 ${street} 号街`,
    },
    hiphop: {
      /** place 为 null 表示"某家玩家餐厅" */
      title: (place: string | null) =>
        place === null ? '明天嘻哈男孩会去某家玩家餐厅吗' : `明天嘻哈男孩会出现在${place}吗`,
      desc: (hour: number) => `以明天 ${hour} 点嘻哈男孩出现的地点为准。`,
      note: (day: string, place: string) => `${day}嘻哈男孩出现在${place}`,
    },
    market: {
      title: (hour: number, level: number) => `今天 ${hour} 点的日常货架会出现 ${level} 级稀有食材吗`,
      desc: (hour: number) => `以 ${hour} 点系统进货的日常货架为准, 玩家手动进的货不算。`,
      /** 新手街那一格不算（用户 2026-10-17）；之前出的题还用上面那句 */
      descNoNewbie: (hour: number) =>
        `以 ${hour} 点系统进货的日常货架为准, 新手街那一格和玩家手动进的货不算。`,
      yes: (day: string, hour: number, level: number, foods: string) =>
        `${day} ${hour} 点日常货架上了 ${level} 级稀有食材: ${foods}`,
      no: (day: string, hour: number, level: number) => `${day} ${hour} 点日常货架没有 ${level} 级稀有食材`,
      newbie: (foods: string) => `；新手街那一格的${foods}不算`,
    },
    weather: {
      title: (hour: number, type: string) => `今天 ${hour} 点换天后是${type}类天气吗`,
      desc: (hour: number) => `以 ${hour} 点换天时的天气为准, 之后有人用司天罗盘、晴雨签改的不算。`,
      note: (day: string, hour: number, weather: string, type: string) =>
        `${day} ${hour} 点换天后是${weather} (${type}类)`,
      hammer: (weather: string) => `；之后有人用道具改成了${weather}, 按题目规则不算`,
      /** 天气大类（下标 = 类型） */
      types: ['', '晴', '雨', '雪', '风沙雾霾'],
    },
    stats: {
      title: '今天全服营业银币会超过昨天吗',
      desc: (close: number) =>
        `以今天全天全服餐厅的营业银币为准, 明天 0 点后判定；严格多于昨天才算"是"。${close} 点截止交易。`,
      note: (day: string, today: string, prevDay: string, yesterday: string) =>
        `${day} ${today}；${prevDay} ${yesterday}`,
    },
    /** 许愿树会不会结某样道具（2026-10-16 换掉全服营业银币题；旧的银币题还用上面的 stats） */
    wish: {
      title: (hour: number, goods: string) => `今天 ${hour} 点许愿树会结出${goods}吗`,
      desc: (hour: number) => `以今天 ${hour} 点开的这一轮许愿树结的道具为准, 不看数量。`,
      note: (day: string, goods: string, num: number) => `${day}许愿树结的是${goods} ×${num}`,
    },
    voidMissing: '数据缺失, 自动作废',
    voidRetired: '题型下线, 自动作废',
  },
  /** 广场 NPC 台词（照原版 NPCTools） */
  talk: {
    bigEater: '你真有品味! 我也是这样觉得的! 哈哈哈!',
    carmenFirst: '第一次见面, 这张神秘食材兑换券送你。',
    bigEaterFirst: '你! 很有个性是吧!',
    wenjie: '用了飘柔就明显气质上来了!',
    bro13: '爱就直接去做!!!',
  },
  /** 外卖配送失败的原因（下标 = 服务端给的序号，原版 takeawayDeliveryFailRessonList） */
  takeawayFail: [
    '遇到了大堵车!',
    '前轮爆胎了!',
    '前女友挡在路中间!',
    '电瓶车没电了!',
    '摔了一跤!',
    '接单太多了!',
    '顾客不满意!',
    '顾客退单了!',
  ] as string[],
  /** 特色菜鉴定失败的文案（下标 = 服务端给的序号，规格书 04 §4.3） */
  appraiseFail: [
    '这只是一堆厕纸而已',
    '上面只有一些看不懂的涂鸦',
    '字迹被油渍糊住了, 什么也看不清',
    '原来是一张过期的菜单',
  ] as string[],
  /** 加成来源的名字（设施、套装、道具的名字来自目录） */
  effect: {
    device: '设施',
    equip: '厨具',
    hangover: '宿醉',
    suit: (name: string, need: number) => `${name} (${need} 件)`,
  },
};
