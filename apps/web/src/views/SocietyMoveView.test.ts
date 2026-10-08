import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCatalogStore } from '../stores/catalog';
import SocietyMoveView from './SocietyMoveView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    move: vi.fn(),
    moveCost: vi.fn().mockResolvedValue({ cost: 20000 }),
    overview: vi.fn().mockRejectedValue(new Error('offline')),
  },
}));

describe('SocietyMoveView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('选中一条街后显示它的加成（问题记录 284：30 条街只看名字不好选）', async () => {
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
    const w = mount(SocietyMoveView);
    await flushPromises();
    expect(w.find('[data-testid="move-bonus"]').exists()).toBe(false);
    await w.find('select').setValue(24);
    expect(w.get('[data-testid="move-bonus"]').text()).toBe('街道加成: 探险时获得神秘食材概率+2%,幸运值+25');
    // 街道类型和为什么是这个加成（问题记录 380、378 方案 C）
    expect(w.get('[data-testid="move-focus"]').text()).toBe('均衡街');
    expect(w.get('[data-testid="move-theme"]').text()).toBe('香料集市与沙漠商队');
  });

  it('搬街费显示服务端算好的数（240-1 终审 I-2：前端不自己算，星级系数也在里面）', async () => {
    const w = mount(SocietyMoveView);
    await flushPromises();
    expect(w.text()).toContain('20,000');
  });
});
