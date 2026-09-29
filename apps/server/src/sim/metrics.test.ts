import { describe, expect, it } from 'vitest';
import { testConfig } from '../../test/config';
import { detectStuck, starDays, type BotDay } from './metrics';

const config = testConfig();
const day = (d: number, level: number, star: number, learned: number, certs = 0): BotDay => ({
  day: d,
  bot: '勤快1',
  persona: 'diligent',
  level,
  star,
  coin: 0,
  diamond: 0,
  learned,
  certs,
  oilLevel: 0,
  renown: 0,
});

describe('卡点检测', () => {
  it('等级够了但超过 N 天升不了星：报出缺的条件', () => {
    const days = [
      day(0, 12, 0, 5),
      day(1, 13, 0, 5),
      day(2, 14, 0, 6),
      day(3, 14, 0, 7),
      day(4, 15, 0, 8),
      day(5, 15, 0, 9),
      day(6, 16, 0, 9),
    ];
    const stuck = detectStuck(days, config, 5);
    // 第 1 天等级达到 13，到最后一天（第 6 天）还是 0 星：卡了 5 天
    expect(stuck).toEqual([
      { bot: '勤快1', persona: 'diligent', star: 0, days: 5, lacking: ['cookbooks', 'certs'] },
    ]);
  });
  it('升上去了就不算卡点', () => {
    const days = [day(0, 13, 0, 15, 1), day(1, 14, 1, 15)];
    expect(detectStuck(days, config, 1)).toEqual([]);
  });
});

describe('到达星级的天数', () => {
  it('按画像取平均', () => {
    const a = [day(0, 1, 0, 0), day(3, 13, 1, 15)].map((x) => ({ ...x, bot: 'a' }));
    const b = [day(0, 1, 0, 0), day(5, 13, 1, 15)].map((x) => ({ ...x, bot: 'b' }));
    expect(starDays([...a, ...b])).toEqual({ diligent: { '1': 4 } });
  });
});
