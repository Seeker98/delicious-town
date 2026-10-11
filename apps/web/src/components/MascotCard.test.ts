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
});
