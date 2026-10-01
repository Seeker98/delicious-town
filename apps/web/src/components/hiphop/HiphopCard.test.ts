import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HiphopSpotDto, HiphopTipDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import HiphopCard from './HiphopCard.vue';

vi.mock('../../api/endpoints', () => ({
  endpoints: { hiphopSpot: vi.fn(), hiphopTip: vi.fn(), cupboard: vi.fn() },
}));

const spot: HiphopSpotDto = {
  here: true,
  place: 1,
  restId: null,
  food: { id: 101, level: 3 },
  worth: 50_000,
  myWeekWorth: 1234,
  closeAt: '2026-10-01T14:00:00.000Z',
};
const tipDto = (patch: Partial<HiphopTipDto> = {}): HiphopTipDto => ({
  worth: 20_000,
  exp: 476,
  krabCoin: 0,
  tickets: 0,
  rainbow: false,
  fresh: true,
  reply: 'thanks',
  ...patch,
});

describe('HiphopCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.cupboard).mockResolvedValue({
      items: [
        { foodsId: 101, num: 30, locked: false, streetNeed: 0 },
        { foodsId: 102, num: 5, locked: false, streetNeed: 0 },
      ],
    } as never);
  });

  it('他不在这里时什么都不显示', async () => {
    vi.mocked(endpoints.hiphopSpot).mockResolvedValue({ here: false });
    const w = mount(HiphopCard, { props: { place: 2 } });
    await flushPromises();
    expect(endpoints.hiphopSpot).toHaveBeenCalledWith({ place: 2 });
    expect(w.find('[data-testid="hiphop-card"]').exists()).toBe(false);
  });

  it('在这里：显示想要的食材和门槛；银币打赏后显示回话和经验', async () => {
    vi.mocked(endpoints.hiphopSpot).mockResolvedValue(spot);
    vi.mocked(endpoints.hiphopTip).mockResolvedValue(tipDto());
    const w = mount(HiphopCard, { props: { place: 1 } });
    await flushPromises();
    const card = w.find('[data-testid="hiphop-card"]');
    expect(card.text()).toContain('食材101');
    expect(card.text()).toContain('你有 30 份');
    expect(card.text()).toContain('50,000');
    await w.find('[data-testid="hiphop-kind-coin"]').trigger('click');
    await w.find('[data-testid="hiphop-num"]').setValue(100000);
    await w.find('[data-testid="hiphop-tip"]').trigger('click');
    await flushPromises();
    expect(endpoints.hiphopTip).toHaveBeenCalledWith({ place: 1, kind: 'coin', num: 100000 });
    expect(w.find('[data-testid="hiphop-result"]').text()).toBe(
      '感谢您的支持和鼓励，你们是我进步的动力！额外获得经验 476',
    );
    expect(w.emitted('changed')).toHaveLength(1);
  });

  it('食材打赏默认选他想要的那种；餐厅地点带上店号', async () => {
    vi.mocked(endpoints.hiphopSpot).mockResolvedValue({ ...spot, place: 9, restId: 77 });
    vi.mocked(endpoints.hiphopTip).mockResolvedValue(tipDto({ exp: 0, reply: 'wanted' }));
    const w = mount(HiphopCard, { props: { restId: 77 } });
    await flushPromises();
    expect(endpoints.hiphopSpot).toHaveBeenCalledWith({ restId: 77 });
    await w.find('[data-testid="hiphop-num"]').setValue(10);
    await w.find('[data-testid="hiphop-tip"]').trigger('click');
    await flushPromises();
    expect(endpoints.hiphopTip).toHaveBeenCalledWith({
      place: 9,
      restId: 77,
      kind: 'food',
      foodsId: 101,
      num: 10,
    });
    expect(w.find('[data-testid="hiphop-result"]').text()).toBe('这些正是我需要的！谢谢！');
  });

  it('中蟹币（虹）和礼券；不新鲜的食材先说一句', async () => {
    vi.mocked(endpoints.hiphopSpot).mockResolvedValue(spot);
    vi.mocked(endpoints.hiphopTip).mockResolvedValue(
      tipDto({ exp: 0, reply: 'krab', krabCoin: 3, rainbow: true, tickets: 2 }),
    );
    const w = mount(HiphopCard, { props: { place: 1 } });
    await flushPromises();
    await w.find('[data-testid="hiphop-num"]').setValue(10);
    await w.find('[data-testid="hiphop-tip"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="hiphop-result"]').text()).toBe('你在旁边捡到 道具240×3（虹）、道具1×2');
    vi.mocked(endpoints.hiphopTip).mockResolvedValue(tipDto({ exp: 0, fresh: false }));
    await w.find('[data-testid="hiphop-food"]').setValue('102');
    await w.find('[data-testid="hiphop-num"]').setValue(5);
    await w.find('[data-testid="hiphop-tip"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="hiphop-result"]').text()).toBe(
      '这些食材看起来不怎么新鲜的样子。感谢您的支持和鼓励，你们是我进步的动力！',
    );
  });

  it('橱柜里没有他想要的食材：默认选第一个有的；一样都没有就写明并禁用打赏（PR29 遗留）', async () => {
    vi.mocked(endpoints.hiphopSpot).mockResolvedValue({ ...spot, food: { id: 555, level: 2 } });
    const w = mount(HiphopCard, { props: { place: 1 } });
    await flushPromises();
    expect((w.find('[data-testid="hiphop-food"]').element as HTMLSelectElement).value).toBe('101');
    vi.mocked(endpoints.cupboard).mockResolvedValue({ items: [] } as never);
    const empty = mount(HiphopCard, { props: { place: 1 } });
    await flushPromises();
    expect(empty.find('[data-testid="hiphop-no-food"]').text()).toBe(
      '橱柜里没有食材，可以改用银币或钻石打赏',
    );
    expect(empty.find('[data-testid="hiphop-tip"]').attributes('disabled')).toBeDefined();
  });
});
