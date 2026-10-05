import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { FriendRestDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useSessionStore } from '../stores/session';
import FriendRestView from './FriendRestView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    friendDetail: vi.fn(),
    dineStart: vi.fn(),
    roachLay: vi.fn(),
    roachKill: vi.fn(),
    thumbUp: vi.fn(),
    friendApply: vi.fn(),
    friendRefuel: vi.fn(),
    friendRemove: vi.fn(),
    mcTaste: vi.fn(),
    duelInfo: vi.fn(),
    friendDuel: vi.fn(),
  },
}));

const detail = (patch: Partial<FriendRestDto> = {}): FriendRestDto => ({
  id: 2,
  name: '乙店',
  level: 5,
  star: 0,
  streetId: 0,
  renown: 10,
  door: 0,
  avatar: 1,
  notice: '欢迎光临',
  npc: false,
  state: 1,
  isFriend: true,
  requested: false,
  icons: [{ key: 'founder', title: '开服元老' }],
  honors: [],
  plaques: [],
  tables: [
    { no: 1, floor: 1, customer: 0 },
    { no: 2, floor: 1, customer: 3, roach: true, roachBy: null },
  ],
  thumbedToday: false,
  killLeft: 3,
  equips: [],
  special: null,
  ...patch,
});

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/friends/:restId', component: FriendRestView }],
  });
  await router.push('/friends/2');
  const w = mount(FriendRestView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('FriendRestView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useSessionStore().me = {
      accountId: 1,
      username: 'u',
      email: 'u@x',
      emailVerified: true,
      role: 'player',
      shardId: 1,
      restaurantId: 1,
      lang: null,
    };
    vi.mocked(endpoints.friendDetail).mockResolvedValue(detail());
    vi.mocked(endpoints.dineStart).mockResolvedValue({});
    vi.mocked(endpoints.roachKill).mockResolvedValue({ strength: 2, coin: 10, exp: 5, tickets: 0 });
    vi.mocked(endpoints.duelInfo).mockResolvedValue({ left: 10, spar: 0, strength: 100, duelStrength: 5 });
  });

  it('显示公告栏和图标；点空桌可以白食', async () => {
    const w = await mountView();
    expect(w.text()).toContain('欢迎光临');
    expect(w.text()).toContain('开服元老');
    await w.find('[data-testid="table-1"]').trigger('click');
    await w.find('[data-testid="act-dine"]').trigger('click');
    await flushPromises();
    expect(endpoints.dineStart).toHaveBeenCalledWith(2, 1);
  });

  it('点蟑螂可以消灭', async () => {
    const w = await mountView();
    await w.find('[data-testid="table-2"]').trigger('click');
    await w.find('[data-testid="act-kill"]').trigger('click');
    await flushPromises();
    expect(endpoints.roachKill).toHaveBeenCalledWith(2, 2);
  });

  it('自己放的蟑螂：写明不能自己消灭，不写“不能操作”（问题记录 374）', async () => {
    vi.mocked(endpoints.friendDetail).mockResolvedValue(
      detail({
        tables: [
          { no: 1, floor: 1, customer: 0 },
          { no: 2, floor: 1, customer: 3, roach: true, roachBy: 1 },
        ],
      }),
    );
    const w = await mountView();
    await w.find('[data-testid="table-2"]').trigger('click');
    expect(w.find('[data-testid="act-kill"]').exists()).toBe(false);
    expect(w.get('[data-testid="own-roach"]').text()).toBe('这只蟑螂是你放的，自己不能消灭');
  });

  it('好友店的蟑螂：写今天还能灭几只；灭够了换成说明，不放按钮（问题记录 374）', async () => {
    const w = await mountView();
    await w.find('[data-testid="table-2"]').trigger('click');
    expect(w.get('[data-testid="kill-left"]').text()).toBe('今天在这家店还能灭 3 只蟑螂');
    vi.mocked(endpoints.friendDetail).mockResolvedValue(detail({ killLeft: 0 }));
    const done = await mountView();
    await done.find('[data-testid="table-2"]').trigger('click');
    expect(done.find('[data-testid="act-kill"]').exists()).toBe(false);
    expect(done.get('[data-testid="kill-done"]').text()).toBe('今天在这家店灭的蟑螂够多了，留点给别人吧');
  });

  it('不限（蟹老板的店）时不写剩几只', async () => {
    vi.mocked(endpoints.friendDetail).mockResolvedValue(detail({ npc: true, killLeft: null }));
    const w = await mountView();
    await w.find('[data-testid="table-2"]').trigger('click');
    expect(w.find('[data-testid="act-kill"]').exists()).toBe(true);
    expect(w.find('[data-testid="kill-left"]').exists()).toBe(false);
  });

  it('不是好友时只显示加好友', async () => {
    vi.mocked(endpoints.friendDetail).mockResolvedValue(detail({ isFriend: false }));
    const w = await mountView();
    expect(w.find('[data-testid="add-friend"]').exists()).toBe(true);
    expect(w.find('[data-testid="act-bar"]').exists()).toBe(false);
  });

  it('显示对方穿着的厨具', async () => {
    vi.mocked(endpoints.friendDetail).mockResolvedValue(
      detail({ equips: [{ part: 1, goodsId: 30, stress: 3, name: null }] }),
    );
    const w = await mountView();
    expect(w.find('[data-testid="friend-equips"]').text()).toContain('铲');
    expect(w.find('[data-testid="friend-equips"]').text()).toContain('+3');
  });

  it('厨具每个部位一行，按部位排好，强化等级单独标出（问题记录 323）', async () => {
    vi.mocked(endpoints.friendDetail).mockResolvedValue(
      detail({
        equips: [
          { part: 3, goodsId: 30, stress: 0, name: '大锅' },
          { part: 1, goodsId: 30, stress: 10, name: null },
        ],
      }),
    );
    const w = await mountView();
    const rows = w.findAll('[data-testid^="friend-equip-"]');
    expect(rows.map((r) => r.attributes('data-testid'))).toEqual(['friend-equip-1', 'friend-equip-3']);
    expect(rows[0]!.find('span').text()).toBe('铲');
    expect(rows[0]!.find('.badge').text()).toBe('+10');
    expect(rows[1]!.text()).toContain('大锅');
    expect(rows[1]!.find('.badge').exists()).toBe(false);
  });

  it('对方有特色菜时可以品尝；吃过显示已品尝', async () => {
    vi.mocked(endpoints.friendDetail).mockResolvedValue(
      detail({ special: { mcId: 1, grade: 3, leftNum: 20, price: 40, eaten: false } }),
    );
    vi.mocked(endpoints.mcTaste).mockResolvedValue({ strength: 40, recipe: false, left: 18 });
    const w = await mountView();
    expect(w.find('[data-testid="friend-special"]').text()).toContain('剩 20 份');
    await w.find('[data-testid="act-taste"]').trigger('click');
    await flushPromises();
    expect(endpoints.mcTaste).toHaveBeenCalledWith(2);
    vi.mocked(endpoints.friendDetail).mockResolvedValue(
      detail({ special: { mcId: 1, grade: 3, leftNum: 18, price: 40, eaten: true } }),
    );
    const w2 = await mountView();
    expect(w2.find('[data-testid="act-taste"]').attributes('disabled')).toBeDefined();
    expect(w2.find('[data-testid="act-taste"]').text()).toBe('已品尝');
  });

  it('好友页有"去它的菜园"链接', async () => {
    const w = await mountView();
    expect(w.find('[data-testid="to-yard"]').attributes('href')).toBe('/yard?friend=2');
  });

  it('好友店有"切磋"，蟹老板店没有', async () => {
    const w = await mountView();
    expect(w.find('[data-testid="act-duel"]').exists()).toBe(true);
    vi.mocked(endpoints.friendDetail).mockResolvedValue(detail({ npc: true }));
    const npc = await mountView();
    expect(npc.find('[data-testid="act-duel"]').exists()).toBe(false);
  });

  it('别人店的店名、公告旁有举报（子项目 6B-1）', async () => {
    vi.mocked(endpoints.friendDetail).mockResolvedValue(detail());
    const w = await mountView();
    expect(w.find('[data-testid="rest-name-report-open"]').exists()).toBe(true);
    expect(w.find('[data-testid="notice-report-open"]').exists()).toBe(true);
  });

  it('蟹老板（NPC 店）的店名、公告旁没有举报（backlog 6B-1：点了会被拒）', async () => {
    vi.mocked(endpoints.friendDetail).mockResolvedValue(detail({ npc: true }));
    const w = await mountView();
    expect(w.find('[data-testid="rest-name-report-open"]').exists()).toBe(false);
    expect(w.find('[data-testid="notice-report-open"]').exists()).toBe(false);
  });
});
