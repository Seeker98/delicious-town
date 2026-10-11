import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { endpoints } from '../../api/endpoints';
import { useRestaurantStore } from '../../stores/restaurant';
import { useToastStore } from '../../stores/toast';
import MayorAsk from './MayorAsk.vue';
import { townData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: { townMayor: vi.fn() },
}));

/** 告诉镇长大胃锅嘻哈男孩在哪（原来在广场居民里，问题记录 441 搬到协会；用例原样搬过来） */
describe('MayorAsk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });
  afterEach(() => vi.useRealTimers());

  it('镇长问答：页面开着过了嘻哈男孩出来的整点，按钮自己变可点，并重新读取（backlog #118）', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-09-30T04:59:30.000Z'));
    const w = mount(MayorAsk, {
      props: {
        data: townData({
          now: '2026-09-30T04:59:30.000Z',
          mayor: { answered: false, hiphopOut: false, hour: 13 },
        }),
      },
      global: { stubs: { teleport: true } },
    });
    // 界面改版 P10：还没出来时按钮换成小标签
    expect(w.find('[data-testid="mayor-open"]').exists()).toBe(false);
    expect(w.get('[data-testid="mayor-wait"]').text()).toBe('13 点出来');
    vi.advanceTimersByTime(60_000);
    await nextTick();
    expect(w.find('[data-testid="mayor-wait"]').exists()).toBe(false);
    expect(w.get('[data-testid="mayor-open"]').attributes('disabled')).toBeUndefined();
    // 服务端每几秒才生成当天的嘻哈男孩记录：过 15 秒再读，免得读到的还是没出来
    expect(w.emitted('reload')).toBeUndefined();
    vi.advanceTimersByTime(15_000);
    expect(w.emitted('reload')).toHaveLength(1);
    vi.advanceTimersByTime(60_000);
    await nextTick();
    expect(w.emitted('reload')).toHaveLength(1);
  });

  it('镇长问答：嘻哈男孩今天还没出来时写明几点出来，按钮不能点（问题记录 333）', () => {
    const w = mount(MayorAsk, {
      props: { data: townData({ mayor: { answered: false, hiphopOut: false, hour: 13 } }) },
    });
    expect(w.get('[data-testid="mayor-row"]').text()).toContain('嘻哈男孩 13 点出来, 到时再来告诉镇长');
    // 界面改版 P10：按钮换成小标签，点不了
    expect(w.find('[data-testid="mayor-open"]').exists()).toBe(false);
    expect(w.get('[data-testid="mayor-wait"]').text()).toBe('13 点出来');
  });

  it('镇长问答：服务端还没更新、不带嘻哈男孩状态时照旧可以问，不写 undefined（终审）', () => {
    const w = mount(MayorAsk, { props: { data: townData({ mayor: { answered: false } as never }) } });
    expect(w.get('[data-testid="mayor-row"]').text()).not.toContain('undefined');
    expect(w.get('[data-testid="mayor-open"]').attributes('disabled')).toBeUndefined();
  });

  it('镇长问答：区服关掉嘻哈男孩时不显示镇长这一行（他不会出来，问不了）', () => {
    useRestaurantStore().rest = { disabledFeatures: ['hiphop'] } as never;
    const w = mount(MayorAsk, { props: { data: townData() } });
    expect(w.find('[data-testid="mayor-row"]').exists()).toBe(false);
  });

  it('镇长问答：区服关掉的功能对应的地点不列出来（问题记录 256：嘻哈男孩不会去那里）', async () => {
    useRestaurantStore().rest = { disabledFeatures: ['kuji', 'temple'] } as never;
    const w = mount(MayorAsk, { props: { data: townData() }, global: { stubs: { teleport: true } } });
    await w.find('[data-testid="mayor-open"]').trigger('click');
    expect(w.find('[data-testid="mayor-12"]').exists()).toBe(false);
    expect(w.find('[data-testid="mayor-6"]').exists()).toBe(false);
    expect(w.find('[data-testid="mayor-10"]').text()).toBe('交易所');
    expect(w.find('[data-testid="mayor-9"]').exists()).toBe(true);
  });

  it('镇长问答：点开后选地点，提示回话和道具；答过就不能再答', async () => {
    vi.mocked(endpoints.townMayor).mockResolvedValue({
      npc: 'mayor',
      talk: 'mayorRight',
      rewards: [{ kind: 'goods', id: 231, num: 1 }],
    });
    const w = mount(MayorAsk, { props: { data: townData() }, global: { stubs: { teleport: true } } });
    expect(w.find('[data-testid="mayor-3"]').exists()).toBe(false);
    await w.find('[data-testid="mayor-open"]').trigger('click');
    expect(
      w.findAll('[data-testid^="mayor-"]').filter((b) => /mayor-\d/.test(b.attributes('data-testid')!)),
    ).toHaveLength(13);
    // 界面改版 P10：先选地点再确认，没选时确认灰掉
    expect(w.get('[data-testid="mayor-ok"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="mayor-ok"]').text()).toBe('先选地点');
    await w.find('[data-testid="mayor-3"]').trigger('click');
    expect(endpoints.townMayor).not.toHaveBeenCalled();
    expect(w.get('[data-testid="mayor-3"]').attributes('aria-checked')).toBe('true');
    expect(w.get('[data-testid="mayor-ok"]').text()).toBe(`就是${w.get('[data-testid="mayor-3"]').text()}`);
    await w.get('[data-testid="mayor-ok"]').trigger('click');
    await flushPromises();
    expect(endpoints.townMayor).toHaveBeenCalledWith(3);
    // 答完面板关掉
    expect(w.find('[data-testid="mayor-ok"]').exists()).toBe(false);
    expect(useToastStore().items.at(-1)!.text).toBe(
      '镇长大胃锅: 谢谢你, 我现在就去找他, 好好弥补他！ 获得 道具231×1',
    );
    expect(w.emitted('reload')).toHaveLength(1);

    const done = mount(MayorAsk, {
      props: { data: townData({ mayor: { answered: true, hiphopOut: true, hour: 9 } }) },
    });
    expect(done.find('[data-testid="mayor-open"]').exists()).toBe(false);
    expect(done.text()).toContain('今天已经告诉过镇长了');
    expect(done.get('[data-testid="mayor-done"]').text()).toBe('告诉过了');
  });
});
