import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MayorDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useRestaurantStore } from '../../stores/restaurant';
import { useToastStore } from '../../stores/toast';
import MayorAsk from './MayorAsk.vue';
import { townData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: { townMayor: vi.fn() },
}));

/** 17:00 换天（服务器时间 = UTC+8） */
const AT = '2026-10-01T09:00:00.000Z';
const mayor = (today: MayorDto['today']): MayorDto => ({ ...townData().mayor, today });

/** 镇长猜天气（天气改版 PR③，设计图 Jc-D） */
describe('MayorAsk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('没猜时：写下一轮几点换天、猜对给什么、猜错不罚，按钮“猜天气”', () => {
    const w = mount(MayorAsk, { props: { data: townData() } });
    const row = w.get('[data-testid="mayor-row"]').text();
    expect(row).toContain('猜下一轮天气');
    expect(row).toContain('「17:00 换天以后是哪一类天气? 猜对了有赏。」');
    expect(row).toContain('每天猜一次 · 17:00 揭晓 · 猜对得道具60504 (猜错不罚)');
    expect(w.get('[data-testid="mayor-open"]').text()).toBe('猜天气');
  });

  it('面板：四类两两一排、写预报；先选一类再确认；猜完提示几点揭晓并重新读取', async () => {
    vi.mocked(endpoints.townMayor).mockResolvedValue(mayor({ type: 2, at: AT, right: null, actual: null }));
    const w = mount(MayorAsk, { props: { data: townData() }, global: { stubs: { teleport: true } } });
    await w.get('[data-testid="mayor-open"]').trigger('click');
    expect(w.text()).toContain('猜 17:00 换天后的天气');
    expect(w.get('[data-testid="mayor-2"]').text()).toBe('雨预报 58%');
    // 按预报从高到低：雨、晴、风沙雾、雪冰
    expect(w.findAll('.dt-guess').map((b) => b.attributes('data-testid'))).toEqual([
      'mayor-2',
      'mayor-1',
      'mayor-4',
      'mayor-3',
    ]);
    expect(w.get('[data-testid="mayor-ok"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="mayor-ok"]').text()).toBe('先选一类');
    await w.get('[data-testid="mayor-2"]').trigger('click');
    expect(w.get('[data-testid="mayor-2"]').attributes('aria-checked')).toBe('true');
    expect(w.get('[data-testid="mayor-ok"]').text()).toBe('就猜雨');
    await w.get('[data-testid="mayor-ok"]').trigger('click');
    await flushPromises();
    expect(endpoints.townMayor).toHaveBeenCalledWith(2);
    expect(w.find('[data-testid="mayor-ok"]').exists()).toBe(false);
    expect(useToastStore().items.at(-1)!.text).toBe('猜好了: 雨, 17:00 揭晓');
    expect(w.emitted('reload')).toHaveLength(1);
  });

  it('猜了还没揭晓：写猜的是什么、几点揭晓；按钮换成“等 17:00”', () => {
    const w = mount(MayorAsk, {
      props: { data: townData({ mayor: mayor({ type: 2, at: AT, right: null, actual: null }) }) },
    });
    expect(w.get('[data-testid="mayor-sub"]').text()).toBe(
      '你猜的是雨。17:00 换天时揭晓, 结果会发到消息里。',
    );
    expect(w.find('[data-testid="mayor-open"]').exists()).toBe(false);
    expect(w.get('[data-testid="mayor-wait"]').text()).toBe('等 17:00');
  });

  it('揭晓后：猜对写得到了什么；猜错写实际是哪类、不罚', () => {
    const right = mount(MayorAsk, {
      props: { data: townData({ mayor: mayor({ type: 2, at: AT, right: true, actual: 2 }) }) },
    });
    expect(right.get('[data-testid="mayor-sub"]').text()).toBe('猜对了, 是雨。获得道具60504, 明天还能再猜。');
    expect(right.get('[data-testid="mayor-right"]').text()).toBe('猜对了');
    const wrong = mount(MayorAsk, {
      props: { data: townData({ mayor: mayor({ type: 2, at: AT, right: false, actual: 1 }) }) },
    });
    expect(wrong.get('[data-testid="mayor-sub"]').text()).toBe('没猜中, 是晴 (你猜的是雨)。明天再来。');
    expect(wrong.get('[data-testid="mayor-wrong"]').text()).toBe('没猜中');
  });

  it('区服关掉天气时不显示（没有换天可猜）', () => {
    useRestaurantStore().rest = { disabledFeatures: ['world'] } as never;
    const w = mount(MayorAsk, { props: { data: townData() } });
    expect(w.find('[data-testid="mayor-row"]').exists()).toBe(false);
  });
});
