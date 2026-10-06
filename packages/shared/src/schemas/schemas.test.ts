import { describe, expect, it } from 'vitest';
import { registerBody } from './auth';
import { selectShardBody } from './shard';
import { createRestaurantBody } from './restaurant';
import { GRANT_LIMITS, createGrantBody } from './admin';
import { rewardItems, sendMailBody } from './mail';
import { announcementBody } from './announce';
import { createBatchBody, createSharedCodeBody, redeemBody } from './redeem';
import { banBody, reportBody, resolveReportBody } from './report';
import { suspiciousQuery } from './ops';
import { barNimFirstBody, barNimStartBody, barNimTakeBody } from './bar';

describe('registerBody', () => {
  const base = { username: '厨神小王', password: 'secret123', email: 'A@B.com', captchaToken: 't' };
  it('接受中文用户名，邮箱转小写，不需要手机号', () => {
    const r = registerBody.parse(base);
    expect(r.email).toBe('a@b.com');
    expect(r.inviteCode).toBeUndefined();
  });
  it('拒绝过长用户名和过短密码', () => {
    expect(registerBody.safeParse({ ...base, username: '一二三四五六七八九十' }).success).toBe(false);
    expect(registerBody.safeParse({ ...base, password: '123' }).success).toBe(false);
  });
});

describe('其他 schema', () => {
  it('selectShardBody 只接受正整数', () => {
    expect(selectShardBody.safeParse({ shardId: 1 }).success).toBe(true);
    expect(selectShardBody.safeParse({ shardId: -1 }).success).toBe(false);
    expect(selectShardBody.safeParse({ shardId: '1' }).success).toBe(false);
  });
  it('createRestaurantBody 限制长度', () => {
    expect(createRestaurantBody.safeParse({ name: 'x'.repeat(33) }).success).toBe(false);
  });
});

describe('附件、邮件、公告（子项目 6A-1）', () => {
  it('帽子名字：去掉首尾空格，1~8 个字，不能有换行；每封最多 5 顶', () => {
    expect(rewardItems.parse({ hats: [{ tier: 'jade', name: ' 大橘 ' }] }).hats![0]!.name).toBe('大橘');
    expect(rewardItems.safeParse({ hats: [{ tier: 'jade', name: '' }] }).success).toBe(false);
    expect(rewardItems.safeParse({ hats: [{ tier: 'jade', name: '一二三四五六七八九' }] }).success).toBe(
      false,
    );
    expect(rewardItems.safeParse({ hats: [{ tier: 'jade', name: '一二三四五六七八' }] }).success).toBe(true);
    expect(rewardItems.safeParse({ hats: [{ tier: 'jade', name: '大\n橘' }] }).success).toBe(false);
    expect(rewardItems.safeParse({ hats: [{ tier: 'gold', name: '大橘' }] }).success).toBe(false);
    const six = Array.from({ length: 6 }, () => ({ tier: 'jade' as const, name: '大橘' }));
    expect(rewardItems.safeParse({ hats: six }).success).toBe(false);
  });

  it('附件沿用补偿的上限、去重、非空；只有帽子也算不空', () => {
    expect(rewardItems.safeParse({}).success).toBe(false);
    expect(rewardItems.safeParse({ coin: GRANT_LIMITS.coin + 1 }).success).toBe(false);
    expect(
      rewardItems.safeParse({
        goods: [
          { id: 1, num: 1 },
          { id: 1, num: 2 },
        ],
      }).success,
    ).toBe(false);
    expect(rewardItems.safeParse({ hats: [{ tier: 'xuan', name: '大橘' }] }).success).toBe(true);
  });

  it('发邮件：标题、正文按字符计长度；附件可以没有；单店要有店 id', () => {
    const base = { scope: 'shard', shardId: 1, title: '标题', body: '正文' };
    expect(sendMailBody.safeParse(base).success).toBe(true);
    expect(sendMailBody.safeParse({ ...base, title: '😀'.repeat(40) }).success).toBe(true);
    expect(sendMailBody.safeParse({ ...base, title: '字'.repeat(41) }).success).toBe(false);
    expect(sendMailBody.safeParse({ ...base, scope: 'rest' }).success).toBe(false);
    expect(sendMailBody.safeParse({ ...base, scope: 'all', shardId: undefined }).success).toBe(true);
  });

  it('公告：结束时间要晚于开始时间', () => {
    const b = { shardId: null, title: '停服', body: '维护', important: true };
    expect(
      announcementBody.safeParse({ ...b, startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-10-02T00:00:00Z' })
        .success,
    ).toBe(true);
    expect(
      announcementBody.safeParse({ ...b, startsAt: '2026-10-02T00:00:00Z', endsAt: '2026-10-01T00:00:00Z' })
        .success,
    ).toBe(false);
  });

  it('补偿可以改为发邮件', () => {
    const b = { shardId: 1, target: 'rest', restId: 2, items: { coin: 1 }, reason: 'r', asMail: true };
    expect(createGrantBody.parse(b).asMail).toBe(true);
  });
});

describe('兑换码（子项目 6A-2）', () => {
  it('兑换：去空格、转大写；字符只能是字母数字', () => {
    expect(redeemBody.parse({ code: ' kaifu2026 ' }).code).toBe('KAIFU2026');
    expect(redeemBody.safeParse({ code: 'ab' }).success).toBe(false);
    expect(redeemBody.safeParse({ code: 'AB_CD' }).success).toBe(false);
  });

  it('兑换时去掉码中间的空格和连字符（backlog：从别处复制来的码常带分隔）', () => {
    expect(redeemBody.parse({ code: 'abcd-efgh 2345' }).code).toBe('ABCDEFGH2345');
    expect(redeemBody.parse({ code: 'AB CD' }).code).toBe('ABCD');
  });

  it('建通用码：自定码要合规；结束晚于开始；一批 1~1000 个', () => {
    const base = { items: { coin: 1 }, note: '开服' };
    expect(createSharedCodeBody.parse({ ...base, code: 'kaifu' }).code).toBe('KAIFU');
    expect(createSharedCodeBody.safeParse({ ...base, code: '开服' }).success).toBe(false);
    expect(
      createSharedCodeBody.safeParse({
        ...base,
        startsAt: '2026-10-02T00:00:00Z',
        endsAt: '2026-10-01T00:00:00Z',
      }).success,
    ).toBe(false);
    expect(createBatchBody.safeParse({ ...base, count: 0 }).success).toBe(false);
    expect(createBatchBody.safeParse({ ...base, count: 1001 }).success).toBe(false);
    expect(
      createBatchBody.safeParse({ ...base, count: 5, items: { hats: [{ tier: 'jade', name: '大橘' }] } })
        .success,
    ).toBe(true);
  });
});

describe('举报（子项目 6B-1）', () => {
  it('举报：类型、理由在范围内，说明不超过 100 字', () => {
    expect(reportBody.parse({ targetType: 'notice', targetId: 3, reason: 'ad' })).toEqual({
      targetType: 'notice',
      targetId: 3,
      reason: 'ad',
    });
    expect(reportBody.safeParse({ targetType: 'x', targetId: 3, reason: 'ad' }).success).toBe(false);
    expect(
      reportBody.safeParse({ targetType: 'post', targetId: 3, reason: 'ad', detail: '字'.repeat(101) })
        .success,
    ).toBe(false);
  });
  it('处理：说明必填；封号天数只能 0/1/7', () => {
    expect(resolveReportBody.safeParse({ note: '' }).success).toBe(false);
    expect(resolveReportBody.safeParse({ note: '辱骂', banDays: 3 }).success).toBe(false);
    expect(resolveReportBody.parse({ note: '辱骂', banDays: 7 }).banDays).toBe(7);
    expect(banBody.parse({ reason: '刷号' }).days).toBeUndefined();
  });
});

describe('可疑数据查询（backlog 6B-2）', () => {
  it('日期必须真实存在：2026-02-30 被拒，2028-02-29 可以', () => {
    expect(suspiciousQuery.safeParse({ shardId: 1, day: '2026-02-30' }).success).toBe(false);
    expect(suspiciousQuery.safeParse({ shardId: 1, day: '2026-13-01' }).success).toBe(false);
    expect(suspiciousQuery.safeParse({ shardId: 1, day: '2028-02-29' }).success).toBe(true);
    expect(suspiciousQuery.safeParse({ shardId: 1 }).success).toBe(true);
  });
});

describe('最后一颗糖（问题记录 427-1）', () => {
  it('开局只认新手桌、高手桌；先后只认 me、bartender', () => {
    expect(barNimStartBody.safeParse({ table: 'novice' }).success).toBe(true);
    expect(barNimStartBody.safeParse({ table: 'expert' }).success).toBe(true);
    expect(barNimStartBody.safeParse({ table: 'vip' }).success).toBe(false);
    expect(barNimFirstBody.safeParse({ who: 'bartender' }).success).toBe(true);
    expect(barNimFirstBody.safeParse({ who: 'boss' }).success).toBe(false);
  });

  it('拿的数量是正整数', () => {
    expect(barNimTakeBody.safeParse({ num: 3 }).success).toBe(true);
    expect(barNimTakeBody.safeParse({ num: 0 }).success).toBe(false);
    expect(barNimTakeBody.safeParse({ num: 1.5 }).success).toBe(false);
  });
});
