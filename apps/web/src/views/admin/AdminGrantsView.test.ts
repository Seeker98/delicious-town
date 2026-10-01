import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GrantDto } from '@dt/shared';
import { createMemoryHistory, createRouter } from 'vue-router';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import AdminGrantsView from './AdminGrantsView.vue';

vi.mock('../../api/admin', () => ({
  adminApi: {
    grantPreview: vi.fn(),
    createGrant: vi.fn(),
    grants: vi.fn(),
    restaurant: vi.fn(),
    searchPlayers: vi.fn(),
  },
}));

const done: GrantDto = {
  id: 1,
  shardId: 1,
  target: 'rest',
  restId: 3,
  minLevel: null,
  items: { coin: 500 },
  reason: '补偿',
  status: 'done',
  total: 1,
  doneCount: 1,
  failedCount: 0,
  actor: 'boss',
  createdAt: '2026-09-30T00:00:00.000Z',
  finishedAt: '2026-09-30T00:00:00.000Z',
};

async function setup(role: 'mod' | 'admin', query = '') {
  const admin = useAdminStore();
  admin.me = { accountId: 1, username: 'boss', role };
  admin.shardId = 1;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/admin/grants', component: AdminGrantsView }],
  });
  await router.push(`/admin/grants${query}`);
  return mount({ template: '<RouterView />' }, { global: { plugins: [router] } });
}

const shop = {
  overview: { id: 3, shardId: 1, name: '爱丽丝店' },
  owner: { accountId: 7, username: 'alice' },
  shardName: '一服',
  store: [],
  cupboard: [],
} as never;

describe('AdminGrantsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(adminApi.grants).mockResolvedValue([done]);
    vi.mocked(adminApi.createGrant).mockResolvedValue(done);
  });

  it('单店：显示店名和店主，确认后只提交填了的内容', async () => {
    vi.mocked(adminApi.restaurant).mockResolvedValue(shop);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await setup('admin');
    await flushPromises();
    await w.find('[data-testid="grant-rest"]').setValue('3');
    await flushPromises();
    expect(w.find('[data-testid="grant-rest-who"]').text()).toContain('爱丽丝店');
    expect(w.find('[data-testid="grant-rest-who"]').text()).toContain('alice');
    await w.find('[data-testid="grant-coin"]').setValue('500');
    await w.find('[data-testid="grant-add-goods"]').trigger('click');
    await w.find('[data-testid="grant-goods-id-0"]').setValue('1');
    await w.find('[data-testid="grant-goods-num-0"]').setValue('2');
    await w.find('[data-testid="grant-reason"]').setValue('补偿');
    await w.find('form').trigger('submit');
    await flushPromises();
    expect(adminApi.createGrant).toHaveBeenCalledWith({
      shardId: 1,
      target: 'rest',
      restId: 3,
      items: { coin: 500, goods: [{ id: 1, num: 2 }] },
      reason: '补偿',
    });
    expect(confirm.mock.calls[0]![0]).toContain('爱丽丝店');
    expect(confirm.mock.calls[0]![0]).toContain('alice');
    confirm.mockRestore();
  });

  it('找不到这家餐厅时提示，不能发放', async () => {
    vi.mocked(adminApi.restaurant).mockRejectedValue(new Error('404'));
    const w = await setup('admin');
    await flushPromises();
    await w.find('[data-testid="grant-rest"]').setValue('999');
    await flushPromises();
    expect(w.find('[data-testid="grant-rest-who"]').text()).toContain('找不到');
    await w.find('[data-testid="grant-coin"]').setValue('1');
    await w.find('[data-testid="grant-reason"]').setValue('x');
    await w.find('form').trigger('submit');
    await flushPromises();
    expect(adminApi.createGrant).not.toHaveBeenCalled();
  });

  it('从玩家页带着 restId 进来时自动填好并显示店名', async () => {
    vi.mocked(adminApi.restaurant).mockResolvedValue(shop);
    const w = await setup('admin', '?restId=3');
    await flushPromises();
    expect((w.find('[data-testid="grant-rest"]').element as HTMLInputElement).value).toBe('3');
    expect(w.find('[data-testid="grant-rest-who"]').text()).toContain('爱丽丝店');
  });

  it('全区服：先预览人数并确认，取消就不发', async () => {
    vi.mocked(adminApi.grantPreview).mockResolvedValue({ count: 42 });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = await setup('admin');
    await flushPromises();
    await w.find('[data-testid="grant-target-shard"]').setValue(true);
    await w.find('[data-testid="grant-min-level"]').setValue('10');
    await w.find('[data-testid="grant-coin"]').setValue('100');
    await w.find('[data-testid="grant-reason"]').setValue('全服补偿');
    await w.find('form').trigger('submit');
    await flushPromises();
    expect(adminApi.grantPreview).toHaveBeenCalledWith(1, 10);
    expect(confirm.mock.calls[0]![0]).toContain('42');
    expect(adminApi.createGrant).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await w.find('form').trigger('submit');
    await flushPromises();
    expect(adminApi.createGrant).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'shard', minLevel: 10 }),
    );
    confirm.mockRestore();
  });

  it('协管只能看记录', async () => {
    const w = await setup('mod');
    await flushPromises();
    expect(w.find('form').exists()).toBe(false);
    expect(w.text()).toContain('补偿');
  });

  it('按店名或用户名查餐厅，点一下填入餐厅 id；只列当前区服的店（问题记录：不知道餐厅 id 在哪查）', async () => {
    vi.mocked(adminApi.grants).mockResolvedValue([]);
    vi.mocked(adminApi.restaurant).mockResolvedValue(shop);
    vi.mocked(adminApi.searchPlayers).mockResolvedValue([
      {
        accountId: 7,
        username: 'alice',
        email: 'a@x',
        role: 'player',
        banned: false,
        restaurants: [
          { id: 3, shardId: 1, shardName: '一服', name: '爱丽丝店', level: 12, star: 1, state: 1 },
          { id: 9, shardId: 2, shardName: '二服', name: '爱丽丝二店', level: 3, star: 0, state: 1 },
        ],
      },
    ]);
    const w = await setup('admin');
    await flushPromises();
    await w.find('[data-testid="grant-search"]').setValue('ali');
    await w.find('[data-testid="grant-search-go"]').trigger('click');
    await flushPromises();
    expect(adminApi.searchPlayers).toHaveBeenCalledWith('ali');
    expect(w.find('[data-testid="grant-pick-9"]').exists()).toBe(false);
    await w.find('[data-testid="grant-pick-3"]').trigger('click');
    await flushPromises();
    expect((w.find('[data-testid="grant-rest"]').element as HTMLInputElement).value).toBe('3');
    expect(adminApi.restaurant).toHaveBeenCalledWith(3);
  });

  it('每项旁边写出上限；超出时当场提示并禁止发放（问题记录：不知道最大值）', async () => {
    vi.mocked(adminApi.grants).mockResolvedValue([]);
    const w = await setup('admin');
    await flushPromises();
    expect(w.find('[data-testid="grant-coin"]').attributes('placeholder')).toBe('银币（≤ 100,000,000）');
    expect(w.find('[data-testid="grant-limits"]').text()).toContain('道具、食材每种 ≤ 9,999');
    await w.find('[data-testid="grant-coin"]').setValue(200_000_000);
    await w.find('[data-testid="grant-add-goods"]').trigger('click');
    await w.find('[data-testid="grant-goods-id-0"]').setValue(1);
    await w.find('[data-testid="grant-goods-num-0"]').setValue(10_000);
    await w.find('[data-testid="grant-reason"]').setValue('补偿');
    expect(w.find('[data-testid="grant-over"]').text()).toBe(
      '超出上限：银币最多 100,000,000；道具1 最多 9,999',
    );
    expect(w.find('[data-testid="grant-submit"]').attributes('disabled')).toBeDefined();
    await w.find('[data-testid="grant-coin"]').setValue(100);
    await w.find('[data-testid="grant-goods-num-0"]').setValue(5);
    expect(w.find('[data-testid="grant-over"]').exists()).toBe(false);
    expect(w.find('[data-testid="grant-submit"]').attributes('disabled')).toBeUndefined();
  });

  it('勾"改为发邮件"后，请求里带 asMail（子项目 6A）', async () => {
    vi.mocked(adminApi.restaurant).mockResolvedValue(shop);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const w = await setup('admin');
    await flushPromises();
    await w.find('[data-testid="grant-rest"]').setValue('3');
    await flushPromises();
    await w.find('[data-testid="grant-coin"]').setValue('500');
    await w.find('[data-testid="grant-as-mail"]').setValue(true);
    await w.find('[data-testid="grant-reason"]').setValue('补偿');
    await w.find('form').trigger('submit');
    await flushPromises();
    expect(adminApi.createGrant).toHaveBeenCalledWith(
      expect.objectContaining({ asMail: true, items: { coin: 500 } }),
    );
  });
});
