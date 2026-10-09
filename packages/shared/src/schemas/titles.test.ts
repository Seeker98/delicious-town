import { describe, expect, it, vi } from 'vitest';
import { grantIconBody } from './admin';
import { activityBody } from './activity';
import { rewardItems, rewardItemsNoIcons, sendMailBody } from './mail';
import { cleanTitleText, graphemeLen, titleText } from './titles';

const cp = (...xs: number[]) => String.fromCodePoint(...xs);
const CHEF = cp(0x1f468, 0x200d, 0x1f373);
const FLAG_CN = cp(0x1f1e8, 0x1f1f3);
const issues = (r: { success: boolean; error?: { issues: Array<{ message: string }> } }) =>
  r.success ? [] : r.error!.issues.map((i) => i.message);

describe('称号文字规则（定制称号设计 二）', () => {
  it('按看上去的字数：组合 emoji、国旗都算 1 个', () => {
    expect(graphemeLen(`${CHEF}${FLAG_CN}ab`)).toBe(4);
  });

  it('去掉方向控制符、零宽空格、控制字符和首尾空白，保留 emoji 的零宽连接符', () => {
    expect(cleanTitleText(` ${cp(0x202e)}坏${cp(0x200b)}人${cp(0xfeff)}${cp(0x2066)} `)).toBe('坏人');
    expect(cleanTitleText(`a${cp(0x07)}b`)).toBe('ab');
    expect(cleanTitleText(CHEF)).toBe(CHEF);
    expect(cleanTitleText(`${cp(0x2764, 0xfe0f)}`)).toBe(cp(0x2764, 0xfe0f));
  });

  it('名字 10 个字以内、清理后不能为空、不能有换行；返回清理后的文字', () => {
    const t = titleText(10);
    expect(t.parse(`${'一'.repeat(9)}${CHEF}`)).toBe(`${'一'.repeat(9)}${CHEF}`);
    expect(issues(t.safeParse('一'.repeat(11)))).toContain('too_long');
    expect(issues(t.safeParse(`${cp(0x200b)}${cp(0x2066)} `))).toContain('empty');
    expect(issues(t.safeParse('a\nb'))).toContain('newline');
    expect(t.parse(` ${cp(0x202e)}好`)).toBe('好');
  });

  it('可空的说明：空串变成 undefined', () => {
    const d = titleText(30, { optional: true });
    expect(d.parse('')).toBeUndefined();
    expect(d.parse(undefined)).toBeUndefined();
    expect(d.parse(' 说明 ')).toBe('说明');
  });
});

describe('附件里的称号', () => {
  it('只有称号也不算空附件；title 可以不传', () => {
    const r = rewardItems.parse({ icons: [{ key: 'c12' }] });
    expect(r.icons).toEqual([{ key: 'c12', title: '' }]);
  });

  it('同一个称号不能列两次；days 和 until 不能同时有', () => {
    expect(issues(rewardItems.safeParse({ icons: [{ key: 'chef' }, { key: 'chef' }] }))).toContain(
      'duplicate',
    );
    expect(
      issues(rewardItems.safeParse({ icons: [{ key: 'chef', days: 3, until: '2026-11-01T00:00:00Z' }] })),
    ).toContain('days_or_until');
    expect(issues(rewardItems.safeParse({ icons: [{ key: 'chef', days: 0 }] })).length).toBeGreaterThan(0);
    expect(issues(rewardItems.safeParse({ icons: [{ key: 'chef', days: 3651 }] })).length).toBeGreaterThan(0);
    expect(issues(rewardItems.safeParse({ icons: [{ key: 'Bad Key' }] })).length).toBeGreaterThan(0);
  });

  it('最多 5 个', () => {
    const icons = ['a', 'b', 'c', 'd', 'e', 'f'].map((key) => ({ key }));
    expect(rewardItems.safeParse({ icons }).success).toBe(false);
    expect(rewardItems.safeParse({ icons: icons.slice(0, 5) }).success).toBe(true);
  });

  it('活动奖励不能带称号', () => {
    expect(issues(rewardItemsNoIcons.safeParse({ coin: 1, icons: [{ key: 'chef' }] }))).toContain(
      'icons_not_allowed',
    );
    const r = activityBody.safeParse({
      shardId: 1,
      title: '签到',
      body: '签到领礼',
      startsAt: '2026-10-01T00:00:00.000Z',
      endsAt: '2026-10-08T00:00:00.000Z',
      minLevel: 1,
      kind: 'goals',
      def: { goals: [{ key: 'signin', target: 1, award: { coin: 1, icons: [{ key: 'chef' }] } }] },
    });
    expect(issues(r)).toContain('icons_not_allowed');
  });
});

describe('邮件发给几家店、后台直接发称号', () => {
  const mail = { scope: 'rest', shardId: 1, title: '定制称号', body: '送你' };
  it('单店范围给 restIds 或 restId 都行，都不给不行', () => {
    expect(sendMailBody.safeParse({ ...mail, restIds: [1, 2] }).success).toBe(true);
    expect(sendMailBody.safeParse({ ...mail, restId: 1 }).success).toBe(true);
    expect(sendMailBody.safeParse(mail).success).toBe(false);
    expect(sendMailBody.safeParse({ ...mail, restIds: [] }).success).toBe(false);
    expect(
      sendMailBody.safeParse({ ...mail, restIds: Array.from({ length: 51 }, (_, i) => i + 1) }).success,
    ).toBe(false);
  });

  it('后台直接发：定制称号的 key、有效期二选一', () => {
    expect(grantIconBody.safeParse({ key: 'c3', days: 7 }).success).toBe(true);
    expect(grantIconBody.safeParse({ key: 'founder', until: '2026-12-01T00:00:00+08:00' }).success).toBe(
      true,
    );
    expect(grantIconBody.safeParse({ key: 'founder', days: 7, until: '2026-12-01T00:00:00Z' }).success).toBe(
      false,
    );
  });
});

describe('没有 Intl.Segmenter 的环境（老 WebView）', () => {
  it('加载模块不报错，字数退回按码位', async () => {
    const saved = Intl.Segmenter;
    // @ts-expect-error 模拟老环境
    delete Intl.Segmenter;
    try {
      vi.resetModules();
      const m = await import('./titles');
      expect(m.graphemeLen('ab')).toBe(2);
    } finally {
      Intl.Segmenter = saved;
      vi.resetModules();
    }
  });
});
