import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { ShardSettingsDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { useAdminStore } from '../../stores/admin';
import { useToastStore } from '../../stores/toast';
import AdminShardView from './AdminShardView.vue';

vi.mock('../../api/admin', () => ({ adminApi: { settings: vi.fn(), saveOverride: vi.fn() } }));

const defaults = {
  features: {},
  restaurant: { coin: 100000, giftFoods: [] },
  tuning: { settlement: { expMultiplier: 5 }, market: { dailyKinds: 5 } },
};
const dto: ShardSettingsDto = {
  version: 2,
  defaults,
  override: {},
  effective: { ...defaults },
  features: [{ name: 'market', enabled: true }],
  docs: { features: {}, groups: {}, fields: {} },
};

async function mountView(role: 'mod' | 'admin') {
  useAdminStore().me = { accountId: 1, username: 'x', role };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/shards/:id', component: AdminShardView },
      { path: '/:p(.*)*', component: { template: '<p/>' } },
    ],
  });
  await router.push('/admin/shards/1');
  const w = mount({ template: '<RouterView />' }, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

const field = (path: string) => `[data-testid="setting-${path}"]`;

describe('AdminShardView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(adminApi.settings).mockResolvedValue(structuredClone(dto));
    vi.mocked(adminApi.saveOverride).mockResolvedValue({ version: 3 });
  });

  it('常用项显示默认值；改完填备注保存，只提交覆盖', async () => {
    const w = await mountView('admin');
    const input = w.find(field('tuning.settlement.expMultiplier'));
    expect((input.element as HTMLInputElement).value).toBe('5');
    await input.setValue('10');
    await input.trigger('change');
    await w.find('[data-testid="save-note"]').setValue('加速');
    await w.find('[data-testid="save-settings"]').trigger('click');
    await flushPromises();
    expect(adminApi.saveOverride).toHaveBeenCalledWith(1, {
      override: { tuning: { settlement: { expMultiplier: 10 } } },
      note: '加速',
      version: 2,
    });
  });

  it('已有覆盖时进页面不报错、显示覆盖值；改别的项保存时覆盖不丢', async () => {
    const withOverride = structuredClone(dto);
    withOverride.override = { tuning: { settlement: { expMultiplier: 1000 } } };
    vi.mocked(adminApi.settings).mockResolvedValue(withOverride);
    const w = await mountView('admin');
    expect(useToastStore().items).toHaveLength(0);
    expect((w.find(field('tuning.settlement.expMultiplier')).element as HTMLInputElement).value).toBe('1000');
    const kinds = w.find(field('tuning.market.dailyKinds'));
    await kinds.setValue('6');
    await kinds.trigger('change');
    await w.find('[data-testid="save-note"]').setValue('多一种菜');
    await w.find('[data-testid="save-settings"]').trigger('click');
    await flushPromises();
    expect(adminApi.saveOverride).toHaveBeenCalledWith(1, {
      override: { tuning: { settlement: { expMultiplier: 1000 }, market: { dailyKinds: 6 } } },
      note: '多一种菜',
      version: 2,
    });
  });

  it('恢复默认后没有改动，保存按钮禁用', async () => {
    const w = await mountView('admin');
    const input = w.find(field('tuning.settlement.expMultiplier'));
    await input.setValue('10');
    await input.trigger('change');
    await w.find('[data-testid="reset-tuning.settlement.expMultiplier"]').trigger('click');
    await w.find('[data-testid="save-note"]').setValue('x');
    expect(w.find('[data-testid="save-settings"]').attributes('disabled')).toBeDefined();
  });

  it('JSON 写错时标红并禁止保存；关闭功能写入 false', async () => {
    const w = await mountView('admin');
    const gift = w.find(field('restaurant.giftFoods'));
    await gift.setValue('[{');
    await gift.trigger('change');
    expect(gift.classes()).toContain('is-invalid');
    expect((gift.element as HTMLTextAreaElement).value).toBe('[{');
    await w.find('[data-testid="save-note"]').setValue('x');
    expect(w.find('[data-testid="save-settings"]').attributes('disabled')).toBeDefined();
    await gift.setValue('[]');
    await gift.trigger('change');
    await w.find('[data-testid="feature-market"]').setValue(false);
    await w.find('[data-testid="save-settings"]').trigger('click');
    await flushPromises();
    expect(vi.mocked(adminApi.saveOverride).mock.calls[0]![1].override).toEqual({
      restaurant: { giftFoods: [] },
      features: { market: false },
    });
  });

  it('协管只能看：输入框禁用，没有保存', async () => {
    const w = await mountView('mod');
    expect(w.find(field('tuning.settlement.expMultiplier')).attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="save-settings"]').exists()).toBe(false);
  });

  it('功能开关排成网格，鼠标悬停显示说明（问题记录 184）', async () => {
    const d = structuredClone(dto);
    d.docs = { features: { market: '菜场开关说明' }, groups: {}, fields: {} };
    vi.mocked(adminApi.settings).mockResolvedValue(d);
    const w = await mountView('admin');
    const grid = w.find('.dt-feature-grid');
    expect(grid.exists()).toBe(true);
    expect(grid.find('label').attributes('title')).toBe('菜场开关说明');
    expect(grid.find('[data-testid="feature-market"]').exists()).toBe(true);
  });

  it('显示说明；按名字或说明搜索，匹配的组展开（问题记录 126）', async () => {
    const d = structuredClone(dto);
    const more = { ...defaults, tuning: { ...defaults.tuning, mail: { listMax: 100 }, rank: { top: 50 } } };
    d.defaults = more;
    d.effective = structuredClone(more);
    d.docs = {
      features: { market: '菜场开关说明' },
      groups: { 'tuning.mail': '邮箱组', 'tuning.rank': '排行组' },
      fields: {
        'tuning.settlement.expMultiplier': '结算经验倍率',
        'tuning.mail.listMax': '邮箱最多列出几封',
        'tuning.rank.top': '排行榜显示前几名',
      },
    };
    vi.mocked(adminApi.settings).mockResolvedValue(d);
    const w = await mountView('admin');
    expect(w.find('[data-testid="doc-tuning.settlement.expMultiplier"]').text()).toBe('结算经验倍率');
    expect(w.find('[data-testid="feature-doc-market"]').text()).toContain('菜场开关说明');
    expect(w.find('[data-testid="group-tuning.mail"]').text()).toContain('邮箱组');
    await w.find('[data-testid="setting-search"]').setValue('邮箱');
    expect(w.find(field('tuning.mail.listMax')).exists()).toBe(true);
    expect(w.find(field('tuning.rank.top')).exists()).toBe(false);
    expect(w.find('[data-testid="group-tuning.mail"]').attributes('open')).toBeDefined();
    expect(w.find('[data-testid="group-tuning.rank"]').exists()).toBe(false);
    expect(w.find(field('tuning.settlement.expMultiplier')).exists()).toBe(false);
    await w.find('[data-testid="setting-search"]').setValue('');
    expect(w.find(field('tuning.rank.top')).exists()).toBe(true);
  });
});
