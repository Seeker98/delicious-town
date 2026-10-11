import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { ShardDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useSessionStore } from '../stores/session';
import ShardSelectView from './ShardSelectView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    listShards: vi.fn(),
    selectShard: vi.fn(),
    sendVerifyEmail: vi.fn(),
    logout: vi.fn(),
    catalog: vi.fn().mockRejectedValue(new Error('offline')),
  },
}));

const shard = (id: number, patch: Partial<ShardDto> = {}): ShardDto => ({
  id,
  name: `${id}服`,
  status: 'open',
  openedAt: '2026-01-01T00:00:00Z',
  hasRestaurant: false,
  rest: null,
  ...patch,
});
const mountView = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/shards', component: ShardSelectView },
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/create', name: 'create-restaurant', component: { template: '<div />' } },
      { path: '/login', name: 'login', component: { template: '<div />' } },
      { path: '/account', component: { template: '<div />' } },
    ],
  });
  await router.push('/shards');
  const w = mount(ShardSelectView, { global: { plugins: [router] } });
  await flushPromises();
  return { w, router };
};

describe('切换区服（界面改版 P11：原来账号页的“我的店”挪到这里）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.selectShard).mockReset();
    useSessionStore().me = {
      accountId: 1,
      username: 'u1',
      email: 'u@x',
      emailVerified: true,
      role: 'player',
      shardId: 2,
      restaurantId: 8,
      lang: null,
      npcRestId: 3,
    };
  });

  it('一个区服一张卡：有店写店名，没店写“还没在这里开店”；关闭的区服灰掉点不动', async () => {
    vi.mocked(endpoints.listShards).mockResolvedValue([
      shard(1, {
        hasRestaurant: true,
        rest: { id: 5, name: '小店', level: 12, avatar: null, starLevel: 2, streetId: 1 },
      }),
      shard(2),
      shard(3, { status: 'closed' }),
    ]);
    const { w } = await mountView();
    expect(w.findAll('button.dt-shard')).toHaveLength(3);
    expect(w.get('[data-testid="shard-1"]').text()).toContain('小店');
    expect(w.get('[data-testid="shard-2"]').text()).toContain('还没在这里开店');
    expect(w.get('[data-testid="shard-2"]').classes()).toContain('is-here');
    expect(w.get('[data-testid="shard-3"]').attributes('disabled')).toBeDefined();
    await w.get('[data-testid="shard-3"]').trigger('click');
    await flushPromises();
    expect(endpoints.selectShard).not.toHaveBeenCalled();
  });

  it('进入别的区服：会话里换成那个区服的店和蟹老板店编号，有店去首页（backlog 第 ⑦ 批审查）', async () => {
    vi.mocked(endpoints.listShards).mockResolvedValue([
      shard(1, {
        hasRestaurant: true,
        rest: { id: 5, name: '小店', level: 12, avatar: null, starLevel: 2, streetId: 1 },
      }),
    ]);
    vi.mocked(endpoints.selectShard).mockResolvedValue({ shardId: 1, restaurantId: 5, npcRestId: 99 });
    const { w, router } = await mountView();
    await w.get('[data-testid="shard-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.selectShard).toHaveBeenCalledWith(1);
    expect(useSessionStore().me).toMatchObject({ shardId: 1, restaurantId: 5, npcRestId: 99 });
    expect(router.currentRoute.value.name).toBe('home');
  });

  it('进入还没开店的区服：去开店页', async () => {
    vi.mocked(endpoints.listShards).mockResolvedValue([shard(4)]);
    vi.mocked(endpoints.selectShard).mockResolvedValue({ shardId: 4, restaurantId: null, npcRestId: 7 });
    const { w, router } = await mountView();
    await w.get('[data-testid="shard-4"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('create-restaurant');
  });
});
