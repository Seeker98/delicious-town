/** 排行榜定义（子项目 4E-2 设计文档 §2.6）：前后端共用 */
export interface RankBoardDef {
  key: string;
  group: string;
  label: string;
  /** 这个榜的排行奖励说明 */
  reward?: string;
  /** 值越小越靠前（问题记录 569：秘制调料最少几次猜中） */
  asc?: boolean;
}

export const RANK_GROUPS: readonly string[] = [
  '收益',
  '食谱',
  '等级',
  '厨力',
  '声望',
  '赞',
  '灭蟑螂',
  '产蟑螂',
  '被翻厨',
  '划拳',
  '猜酒杯',
  '转数字',
  // 新出的几种酒吧游戏（问题记录 569；老虎机不排）
  '飞镖',
  '最后一颗糖',
  '秘制调料',
  '记忆调酒',
  '魔鬼辣杯',
  '一掷千金',
  '特色菜',
  '打赏',
];

const PERIODS: ReadonlyArray<[string, string]> = [
  ['today', '今日'],
  ['yesterday', '昨日'],
  ['thisWeek', '本周'],
  ['lastWeek', '上周'],
];

const periodBoards = (prefix: string, group: string, reward?: string): RankBoardDef[] =>
  PERIODS.map(([p, label]) => ({
    key: `${prefix}.${p}`,
    group,
    label,
    ...(p === 'lastWeek' && reward ? { reward } : {}),
  }));

/** 只分本周、上周的榜（问题记录 569：新出的酒吧游戏，按每日计数加起来） */
const weekBoards = (prefix: string, group: string, what: string, asc?: boolean): RankBoardDef[] =>
  (['thisWeek', 'lastWeek'] as const).map((p) => ({
    key: `${prefix}.${p}`,
    group,
    label: `${p === 'thisWeek' ? '本周' : '上周'}${what}`,
    ...(asc ? { asc } : {}),
  }));

export const RANK_BOARDS: readonly RankBoardDef[] = [
  { key: 'income.coin.today', group: '收益', label: '银币今日' },
  { key: 'income.coin.round', group: '收益', label: '银币单轮' },
  { key: 'income.coin.yesterday', group: '收益', label: '银币昨日' },
  { key: 'income.exp.today', group: '收益', label: '经验今日' },
  { key: 'income.exp.round', group: '收益', label: '经验单轮' },
  { key: 'income.exp.yesterday', group: '收益', label: '经验昨日' },
  { key: 'cookbook.7', group: '食谱', label: '佳肴' },
  { key: 'cookbook.6', group: '食谱', label: '珍品' },
  { key: 'cookbook.5', group: '食谱', label: '金牌' },
  { key: 'cookbook.4', group: '食谱', label: '极品' },
  { key: 'cookbook.1', group: '食谱', label: '已学' },
  { key: 'level', group: '等级', label: '当前' },
  { key: 'power', group: '厨力', label: '当前' },
  { key: 'renown', group: '声望', label: '当前' },
  { key: 'thumb.received', group: '赞', label: '被赞' },
  { key: 'thumb.given', group: '赞', label: '点赞' },
  ...periodBoards('roach.kill', '灭蟑螂', '上周前 2 名：午夜蟑螂杀手 (周一 7:59 发)'),
  ...periodBoards('roach.lay', '产蟑螂'),
  ...periodBoards('flip.flipped', '被翻厨', '上周前 4 名：屋漏偏逢连夜雨 / 鞭炮 / 灯笼 / 福 (周一 7:59 发)'),
  // 酒吧：这一周达到过的最高连胜 / 连败，输一局不掉榜（问题记录 517）
  { key: 'bar.fg.win.thisWeek', group: '划拳', label: '本周连胜' },
  { key: 'bar.fg.win.lastWeek', group: '划拳', label: '上周连胜' },
  { key: 'bar.fg.lose.thisWeek', group: '划拳', label: '本周连败' },
  { key: 'bar.fg.lose.lastWeek', group: '划拳', label: '上周连败' },
  { key: 'bar.cup.win.thisWeek', group: '猜酒杯', label: '本周连胜' },
  { key: 'bar.cup.win.lastWeek', group: '猜酒杯', label: '上周连胜' },
  { key: 'bar.cup.lose.thisWeek', group: '猜酒杯', label: '本周连败' },
  { key: 'bar.cup.lose.lastWeek', group: '猜酒杯', label: '上周连败' },
  { key: 'bar.num.win.thisWeek', group: '转数字', label: '本周连中' },
  { key: 'bar.num.win.lastWeek', group: '转数字', label: '上周连中' },
  { key: 'bar.num.lose.thisWeek', group: '转数字', label: '本周连不中' },
  { key: 'bar.num.lose.lastWeek', group: '转数字', label: '上周连不中' },
  ...weekBoards('bar.darts.win', '飞镖', '胜场'),
  ...weekBoards('bar.nim.novice', '最后一颗糖', '新手桌胜场'),
  ...weekBoards('bar.nim.expert', '最后一颗糖', '高手桌胜场'),
  ...weekBoards('bar.spice.best', '秘制调料', '最少几次猜中', true),
  ...weekBoards('bar.spice.win', '秘制调料', '猜中次数'),
  ...weekBoards('bar.memory.top', '记忆调酒', '通关次数'),
  ...weekBoards('bar.devil.payout', '魔鬼辣杯', '赢得礼券'),
  ...weekBoards('bar.deal.top', '一掷千金', '开出最大奖'),
  { key: 'mc.today', group: '特色菜', label: '今日价值' },
  { key: 'mc.yesterday', group: '特色菜', label: '昨日价值', reward: '第一名：特色菜冠军 (每天发)' },
  { key: 'mc.best', group: '特色菜', label: '历史价值' },
  { key: 'mc.times', group: '特色菜', label: '总次数' },
  { key: 'mc.learned', group: '特色菜', label: '已学' },
  {
    key: 'hiphop.week',
    group: '打赏',
    label: '本周',
    reward:
      '前 5 名：商店 / 改名处 / 菜场 / 搬家处工作证、保安证 (周日 23 点发, 有效 160 小时, 周一 7:59 发工资)',
  },
  { key: 'hiphop.lastWeek', group: '打赏', label: '上周' },
];

export const RANK_KEYS: ReadonlySet<string> = new Set(RANK_BOARDS.map((b) => b.key));

export interface LeaderboardRowDto {
  rank: number;
  restId: number;
  name: string;
  value: number;
}

export interface LeaderboardDto {
  key: string;
  rows: LeaderboardRowDto[];
  me: { rank: number; value: number } | null;
  updatedAt: string;
}
