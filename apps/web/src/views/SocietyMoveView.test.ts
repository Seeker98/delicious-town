import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCatalogStore } from '../stores/catalog';
import SocietyMoveView from './SocietyMoveView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { move: vi.fn(), overview: vi.fn().mockRejectedValue(new Error('offline')) },
}));

describe('SocietyMoveView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('选中一条街后显示它的加成（问题记录 284：30 条街只看名字不好选）', async () => {
    useCatalogStore().streets = [
      { id: 0, name: '新手街', cookName: '家常菜', desc: '上座率+35%' },
      { id: 24, name: '摩洛哥街', cookName: '摩洛哥菜', desc: '探险时获得神秘食材概率+2%,幸运值+25' },
    ];
    const w = mount(SocietyMoveView);
    await flushPromises();
    expect(w.find('[data-testid="move-bonus"]').exists()).toBe(false);
    await w.find('select').setValue(24);
    expect(w.get('[data-testid="move-bonus"]').text()).toBe('街道加成：探险时获得神秘食材概率+2%,幸运值+25');
  });
});
