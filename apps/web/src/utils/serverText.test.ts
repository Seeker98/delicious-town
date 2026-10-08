import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EffectDto, MailTpl } from '@dt/shared';
import { useLocaleStore } from '../stores/locale';
import {
  appraiseFailText,
  dayLabel,
  effectName,
  mailBody,
  mailTitle,
  predictDesc,
  predictNote,
  predictTitle,
  takeawayFailText,
  talkText,
} from './serverText';

const names = {
  goodsName: (id: number) => `道具${id}`,
  foodName: (id: number) => `食材${id}`,
  weatherName: (id: number) => `天气${id}`,
  goods: (id: number) => (id === 7 ? { id } : undefined),
  deviceName: (id: number) => (id === 3 ? '冰箱' : undefined),
  suit: (id: number) =>
    id === 2 ? { id, name: '阿卡玛的神谕', maxNum: 5, tiers: [{ need: 2, desc: '' }] } : undefined,
};
const mail = (key: MailTpl['key'], params: Record<string, unknown> = {}) => ({
  title: '原标题',
  body: '原正文',
  tpl: { key, params },
});
const effect = (sourceType: string, sourceId: number, name = '原名') =>
  ({ sourceType, sourceId, name, effects: {}, expiresAt: null }) as unknown as EffectDto;

describe('服务端代码 → 文字（问题记录 272）', () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(async () => {
    await useLocaleStore().set('zh-CN');
  });

  it('简中：系统邮件和服务端原来写的中文一致；没有模板时用原文', () => {
    expect(mailTitle(mail('activity.rank', { activity: '合力', rank: 2 }))).toBe('《合力》贡献榜第 2 名奖励');
    expect(mailBody(mail('invite.reward', { rest: '小店', level: 10 }))).toBe(
      '你邀请的「小店」达到 10 级, 感谢你把朋友带到小镇！',
    );
    expect(mailBody(mail('hat.upgrade', { name: '大橘' }))).toBe(
      '餐厅升到六星, 玉•大橘之帽升级为铉•大橘之帽。',
    );
    expect(
      mailBody(mail('report.penalty', { target: 'notice', action: 'clear', banDays: 7, note: '发广告' })),
    ).toBe('你的店铺公告因违规已被清空。账号封禁 7 天。\n说明: 发广告');
    expect(mailBody(mail('report.penalty', { target: 'post', action: 'none', banDays: 0, note: 'x' }))).toBe(
      // 内容已经不在（action = none）：以前读作"因违规已记录违规"（backlog 6B-1）
      '你的帖子被认定违规, 已记录在案。账号永久封禁。\n说明: x',
    );
    // 系统补偿的说明是管理员写的：正文用原文
    expect(mailTitle(mail('grant'))).toBe('系统补偿');
    expect(mailBody(mail('grant'))).toBe('原正文');
    expect(mailTitle({ title: '管理员写的', body: 'b', tpl: null })).toBe('管理员写的');
  });

  it('简中：自动预测题的题目、说明、判定依据和服务端原来写的一致', () => {
    const krab = { kind: 'krab', title: '旧', description: '旧说明', params: { from: 3, to: 8, hour: 9 } };
    expect(predictTitle(krab)).toBe('明天蟹老板会在 3~8 号街出现吗');
    expect(predictDesc(krab)).toBe('以明天 9 点系统刷新的位置为准, 之后被驱赶改变的不算。');
    // 旧题没存 hour：说明用原文
    expect(predictDesc({ ...krab, params: { from: 3, to: 8 } })).toBe('旧说明');
    expect(
      predictNote(
        { kind: 'krab', resultNote: '旧', resultParams: { day: '2026-11-04', hour: 9, street: 5 } },
        names,
      ),
    ).toBe('11月4日 9 点蟹老板刷新在 5 号街');
    expect(
      predictNote(
        {
          kind: 'weather',
          resultNote: '旧',
          resultParams: { day: '2026-11-03', hour: 15, weather: 2, type: 2, hammerTo: 5 },
        },
        names,
      ),
    ).toBe('11月3日 15 点自动轮换的天气是天气2 (雨类)；之后有人用雷神锤改成了天气5, 按题目规则不算');
    expect(
      predictNote(
        {
          kind: 'market',
          resultNote: '旧',
          resultParams: { day: '2026-11-03', hour: 12, level: 2, foods: [1, 2] },
        },
        names,
      ),
    ).toBe('11月3日 12 点日常货架上了 2 级稀有食材: 食材1、食材2');
    expect(
      predictNote(
        {
          kind: 'stats',
          resultNote: '旧',
          resultParams: { day: '2026-11-03', today: 1000, prevDay: '2026-11-02', yesterday: 1000 },
        },
        names,
      ),
    ).toBe('11月3日 1,000, 11月2日 1,000');
    expect(predictNote({ kind: 'market', resultNote: '旧', resultParams: { void: 'missing' } }, names)).toBe(
      '数据缺失, 自动作废',
    );
    expect(predictTitle({ kind: 'hiphop', title: '旧', params: { place: 9 } })).toBe(
      '明天嘻哈男孩会去某家玩家餐厅吗',
    );
    // 手动题、旧数据用原文
    expect(predictTitle({ kind: 'manual', title: '手动题', params: {} })).toBe('手动题');
    expect(predictNote({ kind: 'krab', resultNote: '旧依据', resultParams: null }, names)).toBe('旧依据');
  });

  it('简中：台词、外卖意外、鉴定失败、加成来源', () => {
    expect(talkText('mayorWrong')).toBe('你觉得乱说一个位置我就会信吗！');
    expect(takeawayFailText({ reason: '旧原因', reasonId: 7 })).toBe('顾客退单了!');
    expect(takeawayFailText({ reason: '旧原因' })).toBe('旧原因');
    expect(appraiseFailText({ text: '旧', textId: 3 })).toBe('原来是一张过期的菜单');
    expect(effectName(effect('equip', 0), names)).toBe('厨具');
    expect(effectName(effect('suit', 20), names)).toBe('阿卡玛的神谕 (2 件)');
    expect(effectName(effect('device', 3), names)).toBe('冰箱');
    expect(effectName(effect('bless', 4, '招财进宝'), names)).toBe('今日星愿: 招财进宝');
    expect(effectName(effect('honor', 7), names)).toBe('道具7');
    expect(effectName(effect('honor', 8, '没有这个道具'), names)).toBe('没有这个道具');
  });

  it('英语：邮件、预测题、台词、日期', async () => {
    await useLocaleStore().set('en');
    expect(mailTitle(mail('activity.unclaimed', { activity: 'National Day' }))).toBe(
      'Unclaimed rewards from "National Day"',
    );
    expect(mailBody(mail('report.rejected', { target: 'broadcast' }))).toBe(
      'The horn message you reported was checked and found not to break the rules.',
    );
    expect(dayLabel('2026-11-04')).toBe('Nov 4');
    expect(predictTitle({ kind: 'market', title: '旧', params: { hour: 12, level: 2 } })).toBe(
      'Will level-2 rare ingredients appear on the daily market shelf at 12:00 today?',
    );
    expect(talkText('bro13')).toBe('If you love it, just go for it!!!');
    expect(effectName(effect('bar', 0), names)).toBe('Hangover');
  });
});
