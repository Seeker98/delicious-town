import { describe, expect, it } from 'vitest';
import { errorText, setNameResolver } from './zh-CN';

describe('错误文案', () => {
  it('封禁带原因', () => {
    expect(errorText('ACCOUNT_BANNED', { reason: '刷分' })).toBe('账号已被封禁：刷分');
  });
  it('资源不够时说清楚缺什么', () => {
    setNameResolver({
      goodsName: () => '升星凭证',
      foodName: () => '大米',
      mcName: () => '秘·仿膳饽饽',
      seedName: () => '大米种子',
    });
    expect(errorText('NOT_ENOUGH', { kind: 'remnant', id: 1, need: 3, have: 1 })).toBe(
      '秘·仿膳饽饽残卷不够（需要 3，现有 1）',
    );
    expect(errorText('NOT_ENOUGH', { kind: 'coin', need: 500, have: 100 })).toBe(
      '银币不够（需要 500，现有 100）',
    );
    expect(errorText('NOT_ENOUGH', { kind: 'goods', id: 86, need: 1, have: 0 })).toBe(
      '升星凭证不够（需要 1，现有 0）',
    );
    expect(errorText('NOT_ENOUGH', { kind: 'foods', id: 101, need: 3, have: 1 })).toBe(
      '大米不够（需要 3，现有 1）',
    );
  });
  it('条件、上限、状态按原因说明', () => {
    expect(errorText('REQUIREMENT_NOT_MET', { reason: 'level', need: 13, have: 12 })).toBe(
      '餐厅等级不够（需要 13 级）',
    );
    expect(errorText('LIMIT_REACHED', { what: 'market', limit: 1 })).toBe('这批货每人限购 1 份');
    expect(errorText('INVALID_STATE', { reason: 'oil_full' })).toBe('油壶已经是满的');
    expect(errorText('INVALID_STATE', { reason: 'no_such_reason' })).toBe('当前状态下不能这样做');
  });
});

describe('好友互动的错误文案', () => {
  it('按 reason / what / who 出文案', () => {
    expect(errorText('INVALID_STATE', { reason: 'table_occupied' })).toBe('这张桌子有人了');
    expect(errorText('LIMIT_REACHED', { what: 'seats', max: 2 })).toBe('对方的白食位满了（最多 2 人）');
    expect(errorText('REQUIREMENT_NOT_MET', { reason: 'dine_minutes', need: 30 })).toBe(
      '白食满 30 分钟才能结束或请走',
    );
    expect(errorText('ALREADY_DONE', { what: 'thumb' })).toBe('今天已经给它点过赞了');
    expect(errorText('EMAIL_NOT_VERIFIED', { who: 'target' })).toBe('对方还没验证邮箱，不能互动');
    expect(errorText('COOLDOWN', { what: 'flip' })).toBe('这个橱柜位还在冷却中');
    expect(errorText('COOLDOWN', { what: 'market_special', seconds: 540 })).toBe(
      '特价菜同一网络 10 分钟内只能抢一次，还要等 9 分钟',
    );
    expect(errorText('NOT_FRIEND')).toBe('你们还不是好友');
  });
  it('菜园：种子、菜篮、碎片、声望、地块上限、状态', () => {
    setNameResolver({
      goodsName: () => '升星凭证',
      foodName: () => '大米',
      mcName: () => '秘·仿膳饽饽',
      seedName: () => '大米种子',
    });
    expect(errorText('NOT_ENOUGH', { kind: 'seed', id: 1, need: 1, have: 0 })).toBe(
      '大米种子不够（需要 1，现有 0）',
    );
    expect(errorText('NOT_ENOUGH', { kind: 'basket', id: 101, need: 3, have: 1 })).toBe(
      '菜篮里的大米不够（需要 3，现有 1）',
    );
    expect(errorText('NOT_ENOUGH', { kind: 'fragment', part: 'sub', id: 1, need: 1, have: 0 })).toBe(
      '配方辅碎片不够（需要 1，现有 0）',
    );
    expect(errorText('REQUIREMENT_NOT_MET', { reason: 'renown', need: 1 })).toBe(
      '声望不够（偷菜要 1 点声望）',
    );
    expect(errorText('REQUIREMENT_NOT_MET', { reason: 'renown' })).toBe('声望为负时不能点赞');
    expect(errorText('LIMIT_REACHED', { what: 'lands', max: 9 })).toBe('最多开垦 9 块地');
    expect(errorText('INVALID_STATE', { reason: 'withered' })).toBe('作物已经枯萎，只能铲除');
    expect(errorText('ALREADY_DONE', { what: 'steal' })).toBe('这株你已经偷过了');
  });
});

describe('厨塔的错误文案', () => {
  it('按 reason / what 出文案', () => {
    expect(errorText('INVALID_STATE', { reason: 'floor_locked', minLevel: 11, needFloor: 1 })).toBe(
      '这一层还没解锁：餐厅等级要够，并且先打赢下一层',
    );
    expect(errorText('INVALID_STATE', { reason: 'rank_taken' })).toBe('这个名次已经有人了');
    expect(errorText('LIMIT_REACHED', { what: 'tower', max: 5 })).toBe(
      '今天的厨塔挑战次数用完了（5 次），可以在仓库用厨塔挑战券加次数',
    );
    // 用对手的名字，不用"他"（问题记录 230：宋嫂、沙利叶、茵陈、阿卡玛是女性）
    expect(errorText('LIMIT_REACHED', { what: 'watchman', max: 1, name: '宋嫂饭店' })).toBe(
      '宋嫂饭店今天已经很累了（每人每天 1 次），明天再来',
    );
    expect(errorText('LIMIT_REACHED', { what: 'watchman', max: 1 })).toBe(
      '对手今天已经很累了（每人每天 1 次），明天再来',
    );
    expect(errorText('LIMIT_REACHED', { what: 'weekly', max: 10 })).toBe('本周兑换已达上限（10 个）');
    expect(errorText('REQUIREMENT_NOT_MET', { reason: 'renown', what: 'duel' })).toBe('声望为负时不能切磋');
    expect(errorText('REQUIREMENT_NOT_MET', { reason: 'renown' })).toBe('声望为负时不能点赞');
    expect(errorText('NOT_ENOUGH', { kind: 'renown', need: 60, have: 50 })).toContain('声望');
  });
});

describe('外卖的错误文案', () => {
  it('按 reason / what 出文案', () => {
    expect(errorText('INVALID_STATE', { reason: 'order_taken' })).toBe('这张单已经被别人接走了');
    expect(errorText('INVALID_STATE', { reason: 'rider_hired' })).toBe('他已经被别人雇为骑手了');
    expect(errorText('REQUIREMENT_NOT_MET', { reason: 'double' })).toBe('持有"使命必达"才能加料');
    expect(errorText('LIMIT_REACHED', { what: 'rider_busy', max: 2 })).toBe(
      '这个骑手同时送的单已经满了（2 单）',
    );
    expect(errorText('LIMIT_REACHED', { what: 'riders', max: 1 })).toBe('骑手已经满员了（1 个）');
    expect(errorText('ALREADY_DONE', { what: 'takeaway' })).toBe('已经开通外卖了');
  });
});

describe('小镇错误文案（4E-1）', () => {
  it('冷却、已做过、上限、状态', () => {
    expect(errorText('COOLDOWN', { what: 'broadcast', seconds: 12 })).toBe('广播冷却中，还要等 12 秒');
    expect(errorText('COOLDOWN', { what: 'hammer', seconds: 3700 })).toBe(
      '雷神锤冷却中，还要等 1 小时 2 分钟',
    );
    expect(errorText('COOLDOWN', { what: 'weather_gap', seconds: 30 })).toBe('刚换过天气，30 秒后才能再换');
    expect(errorText('ALREADY_DONE', { what: 'talk' })).toBe('今天已经聊过了');
    expect(errorText('ALREADY_DONE', { what: 'wish' })).toBe('今天已经有人许过愿了');
    expect(errorText('LIMIT_REACHED', { what: 'town_exchange', max: 1, used: 1 })).toBe(
      '这一项每人限兑 1 次（已兑 1 次）',
    );
    expect(errorText('INVALID_STATE', { reason: 'krab_broke' })).toBe('蟹老板的钱袋空空如也');
    expect(errorText('REQUIREMENT_NOT_MET', { reason: 'activation', need: 80, have: 12 })).toBe(
      '活跃度不够（需要 80，当前 12）',
    );
  });
  it('论坛：冷却、上限、长度（4E-3）', () => {
    expect(errorText('COOLDOWN', { what: 'forum_reply', seconds: 12 })).toBe('回复太快了，12 秒后再试');
    expect(errorText('LIMIT_REACHED', { what: 'forum_post', max: 10 })).toBe('今天发帖已达上限（10 篇）');
    expect(errorText('INVALID_STATE', { reason: 'post_locked' })).toBe('置顶或加精的帖子不能删除');
  });

  it('论坛长度提示用服务端给的上限（PR31 遗留）', () => {
    expect(errorText('INVALID_STATE', { reason: 'post_text', field: 'title', max: 30 })).toBe(
      '标题要 1~30 字',
    );
    expect(errorText('INVALID_STATE', { reason: 'post_text', field: 'content', max: 4000 })).toBe(
      '正文要 1~4000 字',
    );
    expect(errorText('INVALID_STATE', { reason: 'reply_text', max: 300 })).toBe('回复要 1~300 字');
    expect(errorText('INVALID_STATE', { reason: 'query_text', max: 10 })).toBe('搜索词最多 10 字');
  });
});

describe('问题记录 228：蟑螂上限', () => {
  it('好友店蟑螂太多时的提示', () => {
    expect(errorText('INVALID_STATE', { reason: 'roach_full' })).toBe('这家店的蟑螂已经太多了，换一家吧');
  });
});

describe('backlog 6B-1：举报重试', () => {
  it('report_retry 有中文，不显示原始错误码', () => {
    expect(errorText('INVALID_STATE', { reason: 'report_retry' })).toBe('举报没提交成功，请再试一次');
  });
});
