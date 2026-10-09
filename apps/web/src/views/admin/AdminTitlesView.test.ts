import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminTitleDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { ApiError } from '../../api/client';
import { useAdminStore } from '../../stores/admin';
import AdminTitlesView from './AdminTitlesView.vue';
import { resetTitleList, useTitleList } from '../../components/admin/titleList';

vi.mock('../../api/admin', () => ({
  adminApi: { titles: vi.fn(), createTitle: vi.fn(), updateTitle: vi.fn(), deleteTitle: vi.fn() },
}));

const row = (p: Partial<AdminTitleDto> & { key: string; title: string }): AdminTitleDto => ({
  id: null,
  desc: null,
  note: null,
  source: 'general',
  retired: false,
  owners: 0,
  createdBy: null,
  createdAt: null,
  ...p,
});
const LIST = [
  row({ key: 'c2', id: 2, title: '面霸', source: 'custom', note: '给群主', owners: 3, createdBy: 'boss' }),
  row({ key: 'founder', title: '开服元老', desc: '开服第一周加入小镇', owners: 10 }),
];
const T = (s: string) => `[data-testid="${s}"]`;

describe('AdminTitlesView（定制称号设计 二）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useAdminStore().me = { accountId: 1, username: 'boss', role: 'admin' };
    vi.mocked(adminApi.titles).mockResolvedValue(LIST);
  });

  it('定制和配置分两张表，带拥有人数和来源；协管只读', async () => {
    const w = mount(AdminTitlesView);
    await flushPromises();
    expect(w.find(T('title-row-c2')).text()).toContain('面霸');
    expect(w.find(T('title-row-c2')).text()).toContain('给群主');
    expect(w.find(T('title-row-c2')).text()).toContain('3');
    expect(w.find(T('conf-row-founder')).text()).toContain('开服元老');
    expect(w.find(T('title-create')).exists()).toBe(true);
    useAdminStore().me = { accountId: 1, username: 'm', role: 'mod' };
    const ro = mount(AdminTitlesView);
    await flushPromises();
    expect(ro.find(T('title-create')).exists()).toBe(false);
    expect(ro.find(T('title-edit-2')).exists()).toBe(false);
  });

  it('“已有同名”和全部称号比，不只和当前搜索结果比（backlog 1010）', async () => {
    resetTitleList();
    vi.mocked(adminApi.titles).mockImplementation(async (q?: string) =>
      q ? LIST.filter((x) => x.title.includes(q)) : LIST,
    );
    const w = mount(AdminTitlesView);
    await flushPromises();
    await w.find(T('title-q')).setValue('开服');
    await w.find(T('title-search')).trigger('click');
    await flushPromises();
    expect(w.find(T('title-row-c2')).exists()).toBe(false);
    await w.find(T('title-new-title')).setValue('面霸');
    expect(w.text()).toContain('已有同名称号');
  });

  it('搜索、新建、改、停用', async () => {
    vi.mocked(adminApi.createTitle).mockResolvedValue(
      row({ key: 'c3', id: 3, title: '饭王', source: 'custom' }),
    );
    vi.mocked(adminApi.updateTitle).mockResolvedValue(LIST[0]!);
    const w = mount(AdminTitlesView);
    await flushPromises();
    await w.find(T('title-q')).setValue('群主');
    await w.find(T('title-search')).trigger('click');
    expect(adminApi.titles).toHaveBeenLastCalledWith('群主');
    await w.find(T('title-new-title')).setValue('饭王');
    await w.find(T('title-new-desc')).setValue('能吃');
    await w.find(T('title-create')).trigger('click');
    await flushPromises();
    expect(adminApi.createTitle).toHaveBeenCalledWith({ title: '饭王', desc: '能吃', note: '' });
    await w.find(T('title-edit-2')).trigger('click');
    await w.find(T('title-edit-title-2')).setValue('面神');
    await w.find(T('title-save-2')).trigger('click');
    await flushPromises();
    expect(adminApi.updateTitle).toHaveBeenCalledWith(2, { title: '面神', desc: '', note: '给群主' });
    await w.find(T('title-retire-2')).trigger('click');
    await flushPromises();
    expect(adminApi.updateTitle).toHaveBeenLastCalledWith(2, { retired: true });
  });

  it('删除要确认；有人拥有或被引用时提示只能停用', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(adminApi.deleteTitle).mockRejectedValue(
      new ApiError('INVALID_STATE', { reason: 'title_in_use' }),
    );
    const w = mount(AdminTitlesView);
    await flushPromises();
    await w.find(T('title-delete-2')).trigger('click');
    await flushPromises();
    expect(adminApi.deleteTitle).toHaveBeenCalledWith(2);
    expect(w.text()).toContain('只能停用');
  });

  it('称号页改动后，邮件、兑换码页用的下拉列表跟着刷新', async () => {
    resetTitleList();
    await useTitleList().load();
    expect(useTitleList().list.value).toHaveLength(2);
    vi.mocked(adminApi.createTitle).mockResolvedValue(
      row({ key: 'c3', id: 3, title: '饭王', source: 'custom' }),
    );
    vi.mocked(adminApi.titles).mockResolvedValue([
      ...LIST,
      row({ key: 'c3', id: 3, title: '饭王', source: 'custom' }),
    ]);
    const w = mount(AdminTitlesView);
    await flushPromises();
    await w.find(T('title-new-title')).setValue('饭王');
    await w.find(T('title-create')).trigger('click');
    await flushPromises();
    expect(useTitleList().list.value.map((x) => x.key)).toContain('c3');
  });
});
