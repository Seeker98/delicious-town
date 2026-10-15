import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { FriendRestDto, RestaurantDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import { useLocaleStore } from '../stores/locale';
import { usePageTitleStore } from '../stores/pageTitle';
import { useRestaurantStore } from '../stores/restaurant';
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
    acquireRest: vi.fn(),
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
  thumbs: 1234,
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
  // 点桌子、公告、厨具、收购、顶栏“⋯”都从下面弹出（DtSheet 用 Teleport 挂到 body）：测试里桩掉（界面改版 P10）
  const w = mount(FriendRestView, { global: { plugins: [router], stubs: { teleport: true } } });
  await flushPromises();
  return w;
}

/** 顶栏右边的“⋯”在 AppHeader 里：这里直接调页面登记的 open（界面改版 P10） */
async function openMenu() {
  // 全量跑、机器忙时页面的读取可能还没回来：等顶栏登记了“⋯”再点
  await vi.waitFor(() => expect(usePageTitleStore().menu).not.toBeNull());
  usePageTitleStore().menu!.open();
  await flushPromises();
}

describe('FriendRestView', () => {
  // 上一条测试挂着的页面卸掉：全量跑、机器忙时它的读取晚到，会碰到下一条测试（顶栏“⋯”偶发不为空）
  enableAutoUnmount(afterEach);
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
      npcRestId: null,
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
    expect(w.find('[data-testid="icon-tag"]').text()).toBe('开服元老');
    await w.find('[data-testid="table-1"]').trigger('click');
    await w.find('[data-testid="act-dine"]').trigger('click');
    await flushPromises();
    expect(endpoints.dineStart).toHaveBeenCalledWith(2, 1);
  });

  it('等级那一行带累计获赞（问题记录 553）', async () => {
    const w = await mountView();
    expect(w.get('[data-testid="friend-thumbs"]').text()).toBe('累计获赞 1,234');
  });

  it('旧服务端没有 thumbs：不显示累计获赞（终审：前端先上线）', async () => {
    const { thumbs: _t, ...old } = detail();
    vi.mocked(endpoints.friendDetail).mockResolvedValue(old as ReturnType<typeof detail>);
    const w = await mountView();
    expect(w.find('[data-testid="friend-thumbs"]').exists()).toBe(false);
    expect(w.text()).toContain('欢迎光临');
  });

  it('店头左上角最前面是所在街道；目录里没有这条街时不写（问题记录 571；界面改版 P10 等级挪到等级环里）', async () => {
    useCatalogStore().streets = [{ id: 3, name: '川菜街' }] as never;
    vi.mocked(endpoints.friendDetail).mockResolvedValue(detail({ streetId: 3 }));
    const w = await mountView();
    expect(w.get('[data-testid="friend-street"]').text()).toBe('川菜街 · 0 星');
    expect(w.get('[data-testid="friend-level"]').text()).toBe('5');
    vi.mocked(endpoints.friendDetail).mockResolvedValue(detail({ streetId: 99 }));
    expect((await mountView()).get('[data-testid="friend-street"]').text()).toBe('0 星');
  });

  it('从上到下：称号、公告、厨具、收购（问题记录 571；界面改版 P10 收成“店里”几行）；每行左边是加粗的标题', async () => {
    vi.mocked(endpoints.acquireRest).mockResolvedValue({
      restId: 2,
      name: '乙店',
      level: 5,
      star: 2,
      base: 100_000,
      heat: 1,
      price: 100_000,
      owner: null,
      listed: null,
      taxRate: 0.1,
      protectedUntil: null,
      acquireBlock: null,
      listedBlock: 'not_listed',
    });
    vi.mocked(endpoints.friendDetail).mockResolvedValue(
      detail({ equips: [{ part: 1, goodsId: 30, stress: 3, name: null }] }),
    );
    const w = await mountView();
    const pos = (id: string) => w.html().indexOf(`data-testid="${id}"`);
    const order = ['icon-tag', 'friend-notice', 'friend-equips', 'friend-acquire'].map(pos);
    expect(order.every((x) => x > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const notice = w.get('[data-testid="friend-notice"]');
    expect(notice.get('.dt-row-title.is-strong').text()).toBe('公告');
    expect(notice.text()).toContain('欢迎光临');
    expect(w.get('[data-testid="friend-equips"] .dt-row-title.is-strong').text()).toBe('厨具');
    expect(w.get('[data-testid="friend-acquire"] .dt-row-title.is-strong').text()).toBe('收购');
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
    expect(w.get('[data-testid="own-roach"]').text()).toBe('这只蟑螂是你放的, 自己不能消灭');
  });

  it('好友店的蟑螂：写今天还能灭几只；灭够了换成说明，不放按钮（问题记录 374）', async () => {
    const w = await mountView();
    await w.find('[data-testid="table-2"]').trigger('click');
    // 面板里先说明蟑螂的影响，后面接今天还能灭几只（界面改版 P10）
    expect(w.get('[data-testid="kill-left"]').text()).toBe(
      '有蟑螂的桌子接不了客, 消灭它才能继续接客。 今天在这家店还能灭 3 只蟑螂',
    );
    expect(w.find('[data-testid="act-kill"]').exists()).toBe(true);
    vi.mocked(endpoints.friendDetail).mockResolvedValue(detail({ killLeft: 0 }));
    const done = await mountView();
    await done.find('[data-testid="table-2"]').trigger('click');
    expect(done.find('[data-testid="act-kill"]').exists()).toBe(false);
    expect(done.get('[data-testid="kill-done"]').text()).toBe('今天在这家店灭的蟑螂够多了, 留点给别人吧');
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
    // “店里”一行写件数和最高强化，点开面板看每件（界面改版 P10）
    expect(w.get('[data-testid="friend-equips"]').text()).toContain('1 件 · 最高 +3');
    await w.get('[data-testid="friend-equips"]').trigger('click');
    const list = w.get('[data-testid="friend-equips-list"]');
    expect(list.text()).toContain('铲');
    expect(list.text()).toContain('+3');
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
    await w.get('[data-testid="friend-equips"]').trigger('click');
    const rows = w.findAll('[data-testid="friend-equips-list"] [data-testid^="friend-equip-"]');
    expect(rows.map((r) => r.attributes('data-testid'))).toEqual(['friend-equip-1', 'friend-equip-3']);
    // 部位写在副行，强化等级是行尾的小标签（界面改版 P10）
    expect(rows[0]!.get('.dt-row-sub').text()).toBe('铲');
    expect(rows[0]!.get('.dt-row-end .dt-tag').text()).toBe('+10');
    expect(rows[1]!.text()).toContain('大锅');
    expect(rows[1]!.find('.dt-row-end').exists()).toBe(false);
  });

  it('厨具一栏英文：标题不带冒号，部位按英文（#111 终审）', async () => {
    const pinia = getActivePinia()!;
    await useLocaleStore().set('en');
    setActivePinia(pinia);
    try {
      vi.mocked(endpoints.friendDetail).mockResolvedValue(
        detail({ equips: [{ part: 1, goodsId: 30, stress: 3, name: null }] }),
      );
      const w = await mountView();
      const box = w.get('[data-testid="friend-equips"]');
      expect(box.get('.dt-row-title').text()).toBe('Cookware');
      expect(box.text()).not.toMatch(/[:：]/);
      await box.trigger('click');
      expect(w.get('[data-testid="friend-equip-1"] .dt-row-sub').text()).toBe('Spatula');
    } finally {
      await useLocaleStore().set('zh-CN');
    }
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
    // 吃过换成“已品尝”标签，不再是按钮（界面改版 P10）
    expect(w2.get('[data-testid="act-taste"]').element.tagName).not.toBe('BUTTON');
    expect(w2.get('[data-testid="act-taste"]').text()).toBe('已品尝');
  });

  it('菜园删掉了：好友页没有"去它的菜园"链接', async () => {
    const w = await mountView();
    expect(w.find('[data-testid="to-yard"]').exists()).toBe(false);
  });

  it('好友店有"切磋"，蟹老板店没有', async () => {
    const w = await mountView();
    expect(w.find('[data-testid="act-duel"]').exists()).toBe(true);
    vi.mocked(endpoints.friendDetail).mockResolvedValue(detail({ npc: true }));
    const npc = await mountView();
    expect(npc.find('[data-testid="act-duel"]').exists()).toBe(false);
  });

  it('别人店的店名、公告有举报（子项目 6B-1）：店名在顶栏“⋯”里，公告在点开的公告面板里（界面改版 P10）', async () => {
    vi.mocked(endpoints.friendDetail).mockResolvedValue(detail());
    const w = await mountView();
    await openMenu();
    expect(w.find('[data-testid="rest-name-report-open"]').exists()).toBe(true);
    expect(w.find('[data-testid="remove-friend"]').exists()).toBe(true);
    await w.get('[data-testid="friend-notice"]').trigger('click');
    expect(w.find('[data-testid="notice-report-open"]').exists()).toBe(true);
  });

  it('蟹老板（NPC 店）的店名、公告没有举报（backlog 6B-1：点了会被拒）', async () => {
    vi.mocked(endpoints.friendDetail).mockResolvedValue(detail({ npc: true }));
    const w = await mountView();
    // 蟹老板不能举报也不能删：顶栏不放“⋯”
    // 等店头出来（读取回来了）再看顶栏，免得机器忙时还没读到就算通过
    await vi.waitFor(() => expect(w.find('[data-testid="friend-hero"]').exists()).toBe(true));
    expect(usePageTitleStore().menu).toBeNull();
    expect(w.find('[data-testid="rest-name-report-open"]').exists()).toBe(false);
    await w.get('[data-testid="friend-notice"]').trigger('click');
    expect(w.find('[data-testid="friend-notice-body"]').exists()).toBe(true);
    expect(w.find('[data-testid="notice-report-open"]').exists()).toBe(false);
  });

  it('收购卡片（收购 PR 3）：别人的店显示；蟹老板、自己的店、区服关了收购不显示', async () => {
    vi.mocked(endpoints.acquireRest).mockResolvedValue({
      restId: 2,
      name: '乙店',
      level: 5,
      star: 2,
      base: 100_000,
      heat: 1,
      price: 100_000,
      owner: null,
      listed: null,
      taxRate: 0.1,
      protectedUntil: null,
      acquireBlock: null,
      listedBlock: 'not_listed',
    });
    // “店里”的收购一行，点开面板才是收购卡片（界面改版 P10）
    const w = await mountView();
    await w.get('[data-testid="friend-acquire"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="acquire-card"]').exists()).toBe(true);
    vi.mocked(endpoints.friendDetail).mockResolvedValue(detail({ npc: true }));
    expect((await mountView()).find('[data-testid="friend-acquire"]').exists()).toBe(false);
    vi.mocked(endpoints.friendDetail).mockResolvedValue(detail({ id: 1 }));
    expect((await mountView()).find('[data-testid="friend-acquire"]').exists()).toBe(false);
    vi.mocked(endpoints.friendDetail).mockResolvedValue(detail());
    useRestaurantStore().rest = { disabledFeatures: ['acquire'] } as unknown as RestaurantDto;
    expect((await mountView()).find('[data-testid="friend-acquire"]').exists()).toBe(false);
  });

  it('蟹老板的店：英文界面写 Mr. Krab 和英文公告（服务器给的是中文）', async () => {
    const pinia = getActivePinia()!;
    await useLocaleStore().set('en');
    setActivePinia(pinia);
    useSessionStore().me = { ...useSessionStore().me!, npcRestId: 2 };
    vi.mocked(endpoints.friendDetail).mockResolvedValue(
      detail({ name: '蟹老板', notice: '欢迎光临蟹黄堡！', npc: true }),
    );
    const w = await mountView();
    expect(w.text()).toContain('Mr. Krab');
    expect(w.text()).toContain('Welcome to the Krusty Krab!');
    expect(w.text()).not.toContain('蟹老板');
    await useLocaleStore().set('zh-CN');
  });

  it('门画成门的图形（界面改版 P4：原来请求原版图包、一直显示替代图标）', async () => {
    useCatalogStore().looks = {
      doors: [{ id: 0, name: '木门', coin: 0, art: 'wood' }],
      avatars: [],
      icons: [],
    };
    const w = await mountView();
    // 店头和自己首页同一个场景（界面改版 P10）：门是场景里的装饰图，读屏不念
    const door = w.get('[data-testid="friend-hero"] .dt-scene-door');
    expect(door.get('use').attributes('href')).toContain('#door-wood');
    // 唯一的位图是场景的店面插画，门不再用原版图包
    expect(w.findAll('img').map((x) => x.classes())).toEqual([['dt-scene-shop']]);
  });
});
