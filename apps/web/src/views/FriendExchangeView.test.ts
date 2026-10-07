import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import FriendExchangeView from './FriendExchangeView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { exchangeFoods: vi.fn(), exchange: vi.fn() } }));

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/friends/:restId/exchange', component: FriendExchangeView }],
  });
  await router.push('/friends/2/exchange');
  const w = mount(FriendExchangeView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('FriendExchangeView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.exchangeFoods).mockResolvedValue({
      level: 1,
      theirs: [{ foodsId: 11, num: 3, locked: false, fee: 20, need: 0 }],
      mine: [
        { foodsId: 12, num: 5 },
        { foodsId: 13, num: 1 },
      ],
      left: 10,
      takenLeft: 20,
      storm: false,
      npc: false,
    });
    vi.mocked(endpoints.exchange).mockResolvedValue({ result: 'ok', fee: 20, redPantsFoodsId: null });
  });

  it('选对方的和我的（不足 2 个的不能选），确认后交换', async () => {
    const w = await mountView();
    expect(w.text()).toContain('今天还能换 10 次 (所有好友合计)');
    expect(w.text()).not.toContain('对方今天');
    expect(w.find('[data-testid="mine-13"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="theirs-11"]').trigger('click');
    await w.find('[data-testid="mine-12"]').trigger('click');
    expect(w.find('[data-testid="confirm"]').text()).toContain('手续费 20');
    await w.find('[data-testid="confirm"]').trigger('click');
    await flushPromises();
    expect(endpoints.exchange).toHaveBeenCalledWith({ restId: 2, giveFoodsId: 12, takeFoodsId: 11 });
  });

  it('对方今天快被换满时写明，我自己的合计次数照写（问题记录 479，终审）；蟹老板不写“所有好友合计”', async () => {
    const theirs = [{ foodsId: 11, num: 3, locked: false, fee: 0, need: 0 }];
    const mine = [{ foodsId: 12, num: 5 }];
    vi.mocked(endpoints.exchangeFoods).mockResolvedValue({
      level: 1,
      theirs,
      mine,
      left: 6,
      takenLeft: 2,
      storm: false,
      npc: false,
    });
    const w = await mountView();
    expect(w.get('[data-testid="exchange-left"]').text()).toBe(
      '今天还能换 6 次 (所有好友合计)，对方今天只能再被换 2 次',
    );
    // 对方被换满：我的次数还在，只是不能和它换
    vi.mocked(endpoints.exchangeFoods).mockResolvedValue({
      level: 1,
      theirs,
      mine,
      left: 6,
      takenLeft: 0,
      storm: false,
      npc: false,
    });
    const full = await mountView();
    expect(full.get('[data-testid="exchange-left"]').text()).toBe(
      '今天还能换 6 次 (所有好友合计)，对方今天不能再被换了',
    );
    await full.get('[data-testid="theirs-11"]').trigger('click');
    await full.get('[data-testid="mine-12"]').trigger('click');
    expect(full.get('[data-testid="confirm"]').attributes('disabled')).toBeDefined();
    vi.mocked(endpoints.exchangeFoods).mockResolvedValue({
      level: 1,
      theirs: [],
      mine: [],
      left: 3,
      takenLeft: null,
      storm: false,
      npc: true,
    });
    const k = await mountView();
    expect(k.get('[data-testid="exchange-left"]').text()).toBe('今天还能换 3 次');
  });

  it('对方的食材里我学菜缺的排前面、写缺几个，锁着的排最后；按名字搜只筛对方的（backlog 370）', async () => {
    vi.mocked(endpoints.exchangeFoods).mockResolvedValue({
      level: 2,
      theirs: [
        { foodsId: 11, num: 3, locked: false, fee: 0, need: 0 },
        { foodsId: 21, num: 300, locked: false, fee: 0, need: 4 },
        { foodsId: 22, num: 300, locked: false, fee: 0, need: 9 },
        { foodsId: 23, num: 300, locked: true, fee: 0, need: 20 },
      ],
      mine: [
        { foodsId: 12, num: 5 },
        { foodsId: 21, num: 2 },
      ],
      left: 5,
      takenLeft: null,
      storm: false,
      npc: true,
    });
    const w = await mountView();
    const ids = (side: string) =>
      w.findAll(`[data-testid^="${side}-"]`).map((x) => x.attributes('data-testid'));
    expect(ids('theirs')).toEqual(['theirs-22', 'theirs-21', 'theirs-11', 'theirs-23']);
    await w.get('[data-testid="theirs-22"]').trigger('click');
    expect(w.get('[data-testid="theirs-22"]').text()).toContain('缺 9');
    expect(w.get('[data-testid="theirs-11"]').text()).not.toContain('缺');
    await w.get('[data-testid="exchange-search"]').setValue('21');
    expect(ids('theirs')).toEqual(['theirs-21']);
    // 我的那一栏不筛；选中的 22 被筛掉了，取消选择
    expect(ids('mine')).toEqual(['mine-12', 'mine-21']);
    await w.get('[data-testid="mine-12"]').trigger('click');
    expect(w.get('[data-testid="confirm"]').attributes('disabled')).toBeDefined();
    await w.get('[data-testid="exchange-search"]').setValue('zzz');
    expect(w.text()).toContain('没有找到');
  });
});
