import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { endpoints } from '../api/endpoints';
import ForumEditView from './ForumEditView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { forumCreate: vi.fn(), forumEdit: vi.fn(), forumSource: vi.fn() },
}));

async function mountAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/forum/new', component: ForumEditView },
      { path: '/forum/:id/edit', component: ForumEditView },
      { path: '/forum/:id', component: { template: '<div />' } },
    ],
  });
  await router.push(path);
  const w = mount(ForumEditView, { global: { plugins: [router] } });
  await flushPromises();
  return { w, router };
}

describe('ForumEditView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('新建：选分类、填标题正文后发布，跳到详情', async () => {
    vi.mocked(endpoints.forumCreate).mockResolvedValue({ id: 12 });
    const { w, router } = await mountAt('/forum/new');
    await w.find('[data-testid="edit-cat-guide"]').setValue(true);
    await w.find('[data-testid="edit-title"]').setValue('新手攻略');
    await w.find('[data-testid="edit-content"]').setValue('第一步');
    expect(w.text()).toContain('3/5000');
    await w.find('[data-testid="edit-submit"]').trigger('click');
    await flushPromises();
    expect(endpoints.forumCreate).toHaveBeenCalledWith({
      category: 'guide',
      title: '新手攻略',
      content: '第一步',
    });
    expect(router.currentRoute.value.path).toBe('/forum/12');
  });

  it('编辑：预填原内容，保存调用编辑接口', async () => {
    vi.mocked(endpoints.forumSource).mockResolvedValue({
      id: 5,
      category: 'feedback',
      title: '旧标题',
      content: '旧正文',
    });
    vi.mocked(endpoints.forumEdit).mockResolvedValue({ id: 5 });
    const { w } = await mountAt('/forum/5/edit');
    expect((w.find('[data-testid="edit-title"]').element as HTMLInputElement).value).toBe('旧标题');
    await w.find('[data-testid="edit-title"]').setValue('新标题');
    await w.find('[data-testid="edit-submit"]').trigger('click');
    await flushPromises();
    expect(endpoints.forumEdit).toHaveBeenCalledWith(5, {
      category: 'feedback',
      title: '新标题',
      content: '旧正文',
    });
  });

  it('字数按字符算：40 个 emoji 的标题可以发，41 个字不行（PR31 遗留）', async () => {
    const { w } = await mountAt('/forum/new');
    await w.find('[data-testid="edit-title"]').setValue('😀'.repeat(40));
    await w.find('[data-testid="edit-content"]').setValue('正文');
    expect(w.find('[data-testid="edit-title-count"]').text()).toBe('40/40');
    expect(w.find('[data-testid="edit-submit"]').attributes('disabled')).toBeUndefined();
    await w.find('[data-testid="edit-title"]').setValue('a'.repeat(41));
    expect(w.find('[data-testid="edit-title-count"]').classes()).toContain('text-danger');
    expect(w.find('[data-testid="edit-submit"]').attributes('disabled')).toBeDefined();
  });
});
