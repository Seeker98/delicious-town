import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import MascotCard from './MascotCard.vue';

describe('MascotCard', () => {
  it('右边插槽里的按钮按空格、回车不会换台词（P9 终审 I1：雯姐的“聊天”按空格变成换一句）', async () => {
    const w = mount(MascotCard, {
      props: {
        name: '雯姐',
        icon: 'bi-cup-hot',
        lines: [
          { text: 'a', weight: 1 },
          { text: 'b', weight: 1 },
        ],
        ready: true,
        testid: 'm',
      },
      slots: { default: '<button data-testid="talk">聊天</button>' },
    });
    const before = w.get('[data-testid="m-line"]').text();
    await w.get('[data-testid="talk"]').trigger('keydown', { key: ' ' });
    await w.get('[data-testid="talk"]').trigger('keydown', { key: 'Enter' });
    expect(w.get('[data-testid="m-line"]').text()).toBe(before);
    // 点卡片本身还是换一句
    await w.get('[data-testid="m"]').trigger('click');
    expect(w.get('[data-testid="m-line"]').text()).not.toBe(before);
  });

  it('large：大头像（界面改版 P10：协会 NPC 页），卡片带 is-large；默认是 40px', () => {
    const props = {
      name: '卡门',
      icon: 'bi-stars',
      art: 'npc-carmen' as const,
      lines: [{ text: 'a', weight: 1 }],
      ready: true,
      testid: 'm',
    };
    const big = mount(MascotCard, { props: { ...props, large: true } });
    expect(big.get('[data-testid="m"]').classes()).toContain('is-large');
    expect(big.get('.dt-npc-ava svg').attributes('width')).toBe('56');
    const small = mount(MascotCard, { props });
    expect(small.get('[data-testid="m"]').classes()).not.toContain('is-large');
    expect(small.get('.dt-npc-ava svg').attributes('width')).toBe('40');
  });
});
