import type { ErrorCode } from '@dt/shared';
import { ApiError } from '../api/client';

const TEXT: Record<ErrorCode | 'NETWORK', string> = {
  VALIDATION_FAILED: '填写的内容不正确，请检查后再试',
  UNAUTHORIZED: '请先登录',
  FORBIDDEN: '没有权限进行这个操作',
  NOT_FOUND: '要找的内容不存在',
  RATE_LIMITED: '操作太频繁了，歇一会儿再试吧',
  IDEMPOTENCY_IN_PROGRESS: '正在处理上一次的请求，请稍候',
  CAPTCHA_FAILED: '人机验证没有通过，请刷新页面重试',
  USERNAME_TAKEN: '这个用户名已经被注册了',
  EMAIL_TAKEN: '这个邮箱已经被注册了',
  INVALID_CREDENTIALS: '用户名或密码错误',
  ACCOUNT_BANNED: '账号已被封禁，如有疑问请联系管理员',
  EMAIL_NOT_VERIFIED: '请先验证邮箱',
  TOKEN_INVALID: '链接无效或已过期，请重新获取',
  EMAIL_COOLDOWN: '邮件发送太频繁，请 1 分钟后再试',
  SHARD_NOT_FOUND: '区服不存在',
  SHARD_CLOSED: '这个区服已关闭',
  NO_SHARD_SELECTED: '请先选择区服',
  RESTAURANT_EXISTS: '你在这个区服已经有一家餐厅了',
  RESTAURANT_NOT_FOUND: '你在这个区服还没有餐厅',
  RESTAURANT_NAME_INVALID: '餐厅名称不合适',
  RESTAURANT_NAME_TAKEN: '这个名字已经被别的餐厅用了',
  FEATURE_DISABLED: '这个区服暂未开放该功能',
  NOT_ENOUGH: '数量不够',
  REQUIREMENT_NOT_MET: '还没有达到条件',
  LIMIT_REACHED: '已经达到上限了',
  ALREADY_DONE: '已经做过了',
  NOT_USABLE: '这个物品暂时无法使用',
  STORE_FULL: '仓库满了，先整理一下吧',
  CUPBOARD_FULL: '橱柜满了，先整理一下吧',
  COOKBOOK_MAX_GRADE: '这道菜已经是最高品级了',
  SOLD_OUT: '已经卖完了',
  COOLDOWN: '操作太快了，请稍后再试',
  INVALID_CONFIG: '配置不合法，请检查标红的项',
  VERSION_CONFLICT: '配置已被别人修改，请刷新后再改',
  NOT_FRIEND: '你们还不是好友',
  INVALID_STATE: '当前状态下不能这样做',
  INTERNAL: '服务器开小差了，请稍后再试',
  NETWORK: '网络连接失败，请稍后再试',
};

const NAME_REASON: Record<string, string> = {
  empty: '请输入餐厅名称',
  bad_chars: '只能使用中文、字母、数字、下划线和减号',
  too_long: '名称太长了，最多 8 个汉字或 12 个字母数字',
  reserved: '名称里不能包含小镇人物或官方字样',
};

export interface NameResolver {
  goodsName(id: number): string;
  foodName(id: number): string;
}
let names: NameResolver = { goodsName: (id) => `道具${id}`, foodName: (id) => `食材${id}` };
/** 由目录 store 在加载后注入，错误文案里才能显示道具、食材名称 */
export function setNameResolver(r: NameResolver): void {
  names = r;
}

const KIND: Record<string, string> = {
  coin: '银币',
  diamond: '钻石',
  strength: '体力',
  attrPoint: '属性点',
};

const REQUIREMENT: Record<string, (p: Record<string, unknown>) => string> = {
  level: (p) => `餐厅等级不够（需要 ${String(p.need)} 级）`,
  star: (p) => `星级不够（需要 ${String(p.need)} 星）`,
  cookbooks: (p) => `学会的食谱不够（需要 ${String(p.need)} 道）`,
  not_available: () => '这个星级暂未开放',
  slot_locked: () => '这个设施位还没开放',
  statue: (p) => `需要持有 ${names.goodsName(Number(p.goodsId))}`,
  necklace: () => '需要佩戴有效的爱心项链',
  task: (p) => `任务还没完成（${String(p.progress)}/${String(p.target)}）`,
  activation: (p) => `活跃度不够（需要 ${String(p.need)}）`,
  avatar: () => '先在"装扮"里设置头像才能白食',
  dine_minutes: (p) => `白食满 ${String(p.need)} 分钟才能结束或请走`,
  renown: () => '声望为负时不能点赞',
};

const LIMIT: Record<string, (p: Record<string, unknown>) => string> = {
  market: (p) => `这批货每人限购 ${String(p.limit)} 份`,
  foods_max: (p) => `单种食材最多 ${String(p.max)} 个`,
  tables: () => '餐桌已经摆满了（受等级和楼层限制）',
  lock: () => '锁定格用完了',
  owned: () => '已经拥有了，不能再买',
  max: (p) => `最多持有 ${String(p.max)} 个`,
  friends: (p) => `好友已满（最多 ${String(p.max)} 个）`,
  target_friends: () => '对方的好友已满',
  dine: () => '今天已经白食过了，明天再来',
  seats: (p) => `对方的白食位满了（最多 ${String(p.max)} 人）`,
  roach_lay: (p) => `今天放蟑螂的次数用完了（${String(p.max)} 次）`,
  exchange: (p) => `今天和它的交换次数用完了（${String(p.max)} 次）`,
  exchange_total: () => '今天换得太多了，明天再来',
  exchange_taken: () => '对方今天已经被换太多次了，放过它吧',
  icons: (p) => `最多展示 ${String(p.max)} 个图标`,
};

const STATE: Record<string, string> = {
  oil_full: '油壶已经是满的',
  max_star: '已经是最高星级了',
  max_oil: '油壶已经是最高级了',
  wrong_device: '这个道具不能摆在这个位置',
  plaque_in_use: '这块牌匾已经摆在别的位置了',
  same_name: '新名字和现在一样',
  bad_street: '不能搬到这条街',
  already_on: '已经开启了',
  already_off: '已经关闭了',
  flag: '档位不对',
  not_plankton_host: '痞老板不在你店里',
  no_angry_krab: '蟹老板没有生气',
  no_food: '橱柜里没有这种食材',
  not_locked: '这种食材没有锁定',
  fridge_empty: '冰箱里没有这种食材',
  cannot_handle: '这个等级的食材不能这样处理',
  odd_num: '合成需要成对的食材',
  no_batch: '这个道具不能批量使用',
  no_points_to_reset: '还没有加过属性点',
  not_on_sale: '没有在售',
  no_special: '今天还没有特价',
  single: '一次只能买 1 个',
  not_sellable: '这个道具不能出售',
  keep_one_plaque: '牌匾至少要留 1 块',
  not_discardable: '这个道具不能丢弃',
  not_owned: '没有这个道具',
  item_gone: '这批货已经下架了',
  pick_count: '竞猜的食材数量不对',
  bad_food: '只能竞猜 1~2 级食材',
  not_visible: '这个任务现在不能领取',
  target_self: '不能对自己这样做',
  target_npc: '不用申请，蟹老板会主动来加你',
  target_banned: '对方账号已被封禁',
  target_closed: '对方正在停业',
  target_no_food: '对方已经没有这个食材了',
  no_request: '没有这条好友申请',
  no_table: '没有这张桌子',
  already_dining: '你已经在别人店里白食了',
  not_dining: '没有在白食',
  diner_protected: '对方受蟹老板庇佑（神灯），请不走',
  table_occupied: '这张桌子有人了',
  no_roach: '这张桌上没有蟑螂',
  own_roach: '不能消灭自己放的蟑螂',
  friend_oil_full: '好友的油壶已经满了',
  bad_slot: '没有这个橱柜位',
  blessed: '对方的餐厅受到蟹老板的庇佑，这次什么也没翻到',
  level_mismatch: '只能交换同等级、5 级以内的食材',
  foods_locked: '对方锁定了这种食材，飓风天才能换',
  bad_look: '没有这个款式',
  same_door: '已经是这扇门了',
};

const ALREADY: Record<string, string> = {
  friend: '已经是好友了',
  thumb: '今天已经给它点过赞了',
  thumb_ip: '同一网络今天已经给它点过赞了',
};

export function errorText(code: string, params: Record<string, unknown> = {}): string {
  if (code === 'ACCOUNT_BANNED' && typeof params.reason === 'string' && params.reason) {
    return `账号已被封禁：${params.reason}`;
  }
  if (code === 'RESTAURANT_NAME_INVALID' && typeof params.reason === 'string' && NAME_REASON[params.reason]) {
    return NAME_REASON[params.reason]!;
  }
  if (code === 'ALREADY_DONE' && typeof params.what === 'string' && ALREADY[params.what]) {
    return ALREADY[params.what]!;
  }
  if (code === 'EMAIL_NOT_VERIFIED' && params.who === 'target') return '对方还没验证邮箱，不能互动';
  if (code === 'COOLDOWN' && params.what === 'flip') return '这个橱柜位还在冷却中';
  if (code === 'NOT_ENOUGH') {
    const kind = String(params.kind ?? '');
    const what =
      kind === 'goods'
        ? names.goodsName(Number(params.id))
        : kind === 'foods'
          ? names.foodName(Number(params.id))
          : (KIND[kind] ?? '数量');
    return `${what}不够（需要 ${String(params.need)}，现有 ${String(params.have)}）`;
  }
  if (code === 'REQUIREMENT_NOT_MET' && typeof params.reason === 'string' && REQUIREMENT[params.reason]) {
    return REQUIREMENT[params.reason]!(params);
  }
  if (code === 'LIMIT_REACHED' && typeof params.what === 'string' && LIMIT[params.what]) {
    return LIMIT[params.what]!(params);
  }
  if (code === 'INVALID_STATE' && typeof params.reason === 'string' && STATE[params.reason]) {
    return STATE[params.reason]!;
  }
  return (TEXT as Record<string, string>)[code] ?? `出错了（${code}）`;
}

/** 把任意异常转成给玩家看的文案 */
export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof ApiError ? errorText(e.code, e.params) : fallback;
}
