import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { PlayerDetailDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import AdminPlayerView from './AdminPlayerView.vue';

vi.mock('../../api/admin', () => ({
  adminApi: {
    player: vi.fn(),
    restaurant: vi.fn(),
    ledger: vi.fn(),
    restLog: vi.fn(),
    income: vi.fn(),
    ban: vi.fn(),
    unban: vi.fn(),
    rename: vi.fn(),
    setRole: vi.fn(),
    icons: vi.fn().mockResolvedValue([]),
    titles: vi.fn().mockResolvedValue([]),
  },
}));

const player: PlayerDetailDto = {
  accountId: 7,
  username: 'alice',
  email: 'a@x',
  role: 'player',
  banned: false,
  restaurants: [{ id: 3, shardId: 1, shardName: '一服', name: '爱丽丝店', level: 12, star: 1, state: 1 }],
  emailVerified: true,
  bannedAt: null,
  bannedUntil: null,
  banReason: null,
  createdAt: '2026-09-01T00:00:00.000Z',
};

async function mountView(role: 'mod' | 'admin') {
  useAdminStore().me = { accountId: 1, username: 'boss', role };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/admin/players/:id', component: AdminPlayerView }],
  });
  await router.push('/admin/players/7');
  const w = mount({ template: '<RouterView />' }, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('AdminPlayerView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(adminApi.player).mockResolvedValue(structuredClone(player));
    vi.mocked(adminApi.restaurant).mockResolvedValue({
      overview: {
        id: 3,
        name: '爱丽丝店',
        level: 12,
        starLevel: 1,
        coin: 5000,
        diamond: 2,
        oil: 800,
        oilMax: 1000,
      } as never,
      owner: { accountId: 7, username: 'alice' },
      shardName: '一服',
      equips: [],
      store: [{ goodsId: 1, num: 3, expiresAt: null }],
      cupboard: [{ foodsId: 101, num: 4, fridgeNum: 1, locked: false }],
    });
    vi.mocked(adminApi.ledger).mockResolvedValue({
      items: [
        { kind: 'coin', itemId: null, delta: 500, source: 'admin.grant', at: '2026-09-30T00:00:00.000Z' },
      ],
      nextBefore: null,
    });
    vi.mocked(adminApi.ban).mockResolvedValue({ banned: true });
  });

  it('显示账号、餐厅和流水', async () => {
    const w = await mountView('mod');
    expect(w.text()).toContain('alice');
    expect(w.text()).toContain('爱丽丝店');
    expect(adminApi.ledger).toHaveBeenCalledWith(3, {
      kind: undefined,
      source: undefined,
      before: undefined,
    });
    expect(w.text()).toContain('admin.grant');
    expect(w.find('[data-testid="grant-link"]').attributes('href')).toBe('/admin/grants?restId=3');
  });

  it('封号要填原因；协管看不到改角色；协管只能选 1 天或 7 天（子项目 6B-1）', async () => {
    const w = await mountView('mod');
    const days = w.findAll('[data-testid="ban-days"] option').map((o) => o.attributes('value'));
    expect(days).toEqual(['1', '7']);
    expect(w.find('[data-testid="role-select"]').exists()).toBe(false);
    expect(w.find('[data-testid="ban"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="ban-reason"]').setValue('刷分');
    await w.find('[data-testid="ban"]').trigger('click');
    await flushPromises();
    expect(adminApi.ban).toHaveBeenCalledWith(7, '刷分', 1);
    expect(adminApi.player).toHaveBeenCalledTimes(2);
  });

  it('管理员可以改角色', async () => {
    vi.mocked(adminApi.setRole).mockResolvedValue({ role: 'mod' });
    const w = await mountView('admin');
    await w.find('[data-testid="role-select"]').setValue('mod');
    await flushPromises();
    expect(adminApi.setRole).toHaveBeenCalledWith(7, 'mod');
  });

  it('封号中：写明到期时间或永久；只有管理员看得到解封（子项目 6B-1）', async () => {
    vi.mocked(adminApi.player).mockResolvedValue({
      ...structuredClone(player),
      banned: true,
      bannedAt: '2026-10-01T00:00:00.000Z',
      bannedUntil: '2026-10-08T00:00:00.000Z',
      banReason: '刷屏',
    });
    const w = await mountView('mod');
    expect(w.text()).toContain('封号至');
    expect(w.find('[data-testid="unban"]').exists()).toBe(false);
    vi.mocked(adminApi.player).mockResolvedValue({
      ...structuredClone(player),
      banned: true,
      bannedAt: '2026-10-01T00:00:00.000Z',
      bannedUntil: null,
      banReason: '盗号',
    });
    const w2 = await mountView('admin');
    expect(w2.text()).toContain('永久封号');
    expect(w2.find('[data-testid="unban"]').exists()).toBe(true);
    expect(w2.findAll('[data-testid="ban-days"] option')).toHaveLength(0);
  });
});
