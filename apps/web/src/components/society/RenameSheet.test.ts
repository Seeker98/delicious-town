import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import RenameSheet from './RenameSheet.vue';

vi.mock('../../api/endpoints', () => ({
  endpoints: {
    rename: vi.fn(),
    overview: vi.fn().mockRejectedValue(new Error('offline')),
  },
}));

const mountSheet = () => mount(RenameSheet, { props: { open: true }, global: { stubs: { teleport: true } } });

describe('RenameSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('输入框带字数；空的或超过 9 个字不能提交', async () => {
    const w = mountSheet();
    expect(w.get('[data-testid="rename-count"]').text()).toBe('0 / 9');
    expect(w.get('[data-testid="rename-ok"]').attributes('disabled')).toBeDefined();
    await w.get('[data-testid="rename-input"]').setValue('  小饭馆  ');
    // 前后空格不算
    expect(w.get('[data-testid="rename-count"]').text()).toBe('3 / 9');
    expect(w.get('[data-testid="rename-ok"]').attributes('disabled')).toBeUndefined();
    await w.get('[data-testid="rename-input"]').setValue('一二三四五六七八九十');
    expect(w.get('[data-testid="rename-count"]').text()).toBe('10 / 9');
    expect(w.get('[data-testid="rename-ok"]').attributes('disabled')).toBeDefined();
  });

  it('提交时去掉前后空格调接口，成功后发出 done', async () => {
    vi.mocked(endpoints.rename).mockResolvedValue({ name: '小饭馆' } as never);
    const w = mountSheet();
    await w.get('[data-testid="rename-input"]').setValue(' 小饭馆 ');
    await w.get('form').trigger('submit');
    await flushPromises();
    expect(endpoints.rename).toHaveBeenCalledWith('小饭馆');
    expect(w.emitted('done')).toHaveLength(1);
  });

  it('改名失败时不发 done', async () => {
    vi.mocked(endpoints.rename).mockRejectedValue(new Error('x'));
    const w = mountSheet();
    await w.get('[data-testid="rename-input"]').setValue('小饭馆');
    await w.get('form').trigger('submit');
    await flushPromises();
    expect(w.emitted('done')).toBeUndefined();
  });
});
