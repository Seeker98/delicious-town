import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import { useCatalogStore } from '../../stores/catalog';
import MoveSheet from './MoveSheet.vue';

vi.mock('../../api/endpoints', () => ({
  endpoints: {
    move: vi.fn(),
    overview: vi.fn().mockRejectedValue(new Error('offline')),
  },
}));

// 面板在 Teleport 到 body 的底部面板里：测试里把 teleport 桩掉
const mountSheet = (cost: number | null = 20000) =>
  mount(MoveSheet, { props: { open: true, cost }, global: { stubs: { teleport: true } } });

describe('MoveSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().streets = [
      { id: 0, name: '新手街', cookName: '家常菜', desc: '上座率+35%', theme: '', focus: null },
      {
        id: 24,
        name: '摩洛哥街',
        cookName: '摩洛哥菜',
        desc: '探险时获得神秘食材概率+2%,幸运值+25',
        theme: '香料集市与沙漠商队',
        focus: 'balanced',
      },
    ];
  });

  it('选中一条街后显示它的加成（问题记录 284：30 条街只看名字不好选）', async () => {
    const w = mountSheet();
    await flushPromises();
    expect(w.find('[data-testid="move-picked"]').exists()).toBe(false);
    expect(w.find('[data-testid="move-bonus"]').exists()).toBe(false);
    // 没选街道时不能搬
    expect(w.get('[data-testid="move-ok"]').attributes('disabled')).toBeDefined();
    await w.get('[data-testid="move-street"]').setValue(24);
    expect(w.get('[data-testid="move-bonus"]').text()).toBe('街道加成: 探险时获得神秘食材概率+2%,幸运值+25');
    // 街道类型和为什么是这个加成（问题记录 380、378 方案 C）
    expect(w.get('[data-testid="move-focus"]').text()).toBe('均衡街');
    expect(w.get('[data-testid="move-theme"]').text()).toBe('香料集市与沙漠商队');
    expect(w.get('[data-testid="move-ok"]').attributes('disabled')).toBeUndefined();
  });

  it('没有类型和介绍的街道不显示这两行', async () => {
    const w = mountSheet();
    await flushPromises();
    await w.get('[data-testid="move-street"]').setValue(0);
    expect(w.get('[data-testid="move-bonus"]').text()).toBe('街道加成: 上座率+35%');
    expect(w.find('[data-testid="move-focus"]').exists()).toBe(false);
    expect(w.find('[data-testid="move-theme"]').exists()).toBe(false);
  });

  it('搬街费显示服务端算好的数（240-1 终审 I-2：前端不自己算，星级系数也在里面）', async () => {
    const w = mountSheet(20000);
    await flushPromises();
    expect(w.get('[data-testid="move-cost"]').text()).toBe('约 20,000 银币, 幸运时半价');
    const none = mountSheet(null);
    await flushPromises();
    expect(none.get('[data-testid="move-cost"]').text()).toBe('—');
  });

  it('确认后调接口搬家，发出 done', async () => {
    vi.mocked(endpoints.move).mockResolvedValue(undefined as never);
    const w = mountSheet();
    await flushPromises();
    await w.get('[data-testid="move-street"]').setValue(24);
    await w.get('[data-testid="move-ok"]').trigger('click');
    await flushPromises();
    expect(endpoints.move).toHaveBeenCalledWith(24);
    expect(w.emitted('done')).toHaveLength(1);
  });

  it('搬家失败时不发 done', async () => {
    vi.mocked(endpoints.move).mockRejectedValue(new Error('x'));
    const w = mountSheet();
    await flushPromises();
    await w.get('[data-testid="move-street"]').setValue(24);
    await w.get('[data-testid="move-ok"]').trigger('click');
    await flushPromises();
    expect(w.emitted('done')).toBeUndefined();
  });
});
