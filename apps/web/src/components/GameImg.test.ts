import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import GameImg from './GameImg.vue';

describe('GameImg', () => {
  it('图片加载失败时显示图标兜底', async () => {
    const w = mount(GameImg, { props: { path: 'goods/开张大吉', alt: '开张大吉' } });
    expect(w.find('img').attributes('src')).toContain('/pack/goods/');
    await w.find('img').trigger('error');
    expect(w.find('img').exists()).toBe(false);
    expect(w.find('i.bi').classes()).toContain('bi-image');
  });
});
