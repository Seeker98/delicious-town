import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import FriendFlipView from './FriendFlipView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { flipSlots: vi.fn(), flip: vi.fn() } }));

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/friends/:restId/flip', component: FriendFlipView }],
  });
  await router.push('/friends/2/flip');
  const w = mount(FriendFlipView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('FriendFlipView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.flipSlots).mockResolvedValue({
      slots: 5,
      cooling: [{ slotNo: 2, until: new Date(Date.now() + 3 * 3600_000).toISOString() }],
      todayTimes: 0,
      hostLeft: 3,
    });
    vi.mocked(endpoints.flip).mockResolvedValue({
      outcome: 'nothing',
      foodsId: null,
      coin: 0,
      strength: 1,
      dtTickets: 0,
    });
  });

  it('冷却中的位置不能点；点其他位置翻橱并显示结果', async () => {
    const w = await mountView();
    expect(w.find('[data-testid="slot-2"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="slot-2"]').text()).toMatch(/2 小时/);
    await w.find('[data-testid="slot-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.flip).toHaveBeenCalledWith(2, 1);
    expect(w.text()).toContain('什么都没有');
  });
});

describe('FriendFlipView：同一家店每人每天的格数（问题记录 374）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('写出今天在这家店还能翻几格', async () => {
    vi.mocked(endpoints.flipSlots).mockResolvedValue({ slots: 5, cooling: [], todayTimes: 2, hostLeft: 1 });
    const w = await mountView();
    expect(w.get('[data-testid="host-left"]').text()).toBe('今天在这家店还能翻 1 格');
    expect(w.find('[data-testid="slot-1"]').attributes('disabled')).toBeUndefined();
  });

  it('翻够了：写明明天再来，格子都不能点', async () => {
    vi.mocked(endpoints.flipSlots).mockResolvedValue({ slots: 5, cooling: [], todayTimes: 3, hostLeft: 0 });
    const w = await mountView();
    expect(w.get('[data-testid="host-left"]').text()).toBe('今天在这家店已经翻够了，明天再来');
    expect(w.find('[data-testid="slot-1"]').attributes('disabled')).toBeDefined();
  });

  it('不限时不写', async () => {
    vi.mocked(endpoints.flipSlots).mockResolvedValue({
      slots: 5,
      cooling: [],
      todayTimes: 3,
      hostLeft: null,
    });
    const w = await mountView();
    expect(w.find('[data-testid="host-left"]').exists()).toBe(false);
  });
});

describe('FriendFlipView：翻失败后重新读格子（问题记录 374 审查）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('别的页面把次数用完了，这里翻时报错：重新读，按钮跟着锁上', async () => {
    vi.mocked(endpoints.flipSlots)
      .mockResolvedValueOnce({ slots: 5, cooling: [], todayTimes: 2, hostLeft: 1 })
      .mockResolvedValueOnce({ slots: 5, cooling: [], todayTimes: 3, hostLeft: 0 });
    vi.mocked(endpoints.flip).mockRejectedValueOnce(new Error('limit'));
    const w = await mountView();
    await w.find('[data-testid="slot-1"]').trigger('click');
    await flushPromises();
    expect(w.get('[data-testid="host-left"]').text()).toBe('今天在这家店已经翻够了，明天再来');
    expect(w.find('[data-testid="slot-1"]').attributes('disabled')).toBeDefined();
  });
});
