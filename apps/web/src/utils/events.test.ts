import { describe, expect, it } from 'vitest';
import { eventText, logText } from './events';

const names = { goodsName: (id: number) => ({ 1: '神秘礼券' })[id] ?? `道具${id}`, foodName: () => '大米' };

describe('得失提示文案', () => {
  it('银币、道具、食材、幸运', () => {
    expect(eventText({ type: 'gain', kind: 'coin', num: 1500 }, names)).toBe('获得 银币 1,500');
    expect(eventText({ type: 'loss', kind: 'coin', num: 200 }, names)).toBe('消耗 银币 200');
    expect(eventText({ type: 'gain', kind: 'goods', id: 1, num: 3, lucky: true }, names)).toBe(
      '获得 神秘礼券×3（幸运）',
    );
    expect(eventText({ type: 'gain', kind: 'foods', id: 101, num: 2 }, names)).toBe('获得 大米×2');
  });
});

describe('个人日志文案', () => {
  it('升级、老鼠、蟹老板', () => {
    expect(logText({ type: 'level.up', params: { from: 1, to: 3 }, at: '' }, names)).toBe('餐厅升到了 3 级');
    expect(logText({ type: 'mouse.steal', params: { foodsId: 101, num: 2 }, at: '' }, names)).toBe(
      '老鼠偷走了 大米×2',
    );
    expect(logText({ type: 'krab.angry', params: {}, at: '' }, names)).toBe('蟹老板扫兴而归');
    expect(logText({ type: 'unknown.type', params: {}, at: '' }, names)).toBe('unknown.type');
  });
});
