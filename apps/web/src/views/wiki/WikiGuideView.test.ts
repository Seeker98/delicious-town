import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
// 从语言包入口取：直接引 zh-CN/wiki 会和 utils/format → i18n 绕成循环引用
import zhCN from '../../i18n/locales/zh-CN';
import WikiGuideView from './WikiGuideView.vue';

describe('玩法攻略（问题记录 384）', () => {
  beforeEach(() => setActivePinia(createPinia()));
  it('按节写出三种节奏、每次上线做什么、搬街、花钱、其他玩法，每节逐条列出', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:p(.*)*', component: WikiGuideView }],
    });
    await router.push('/wiki/guide');
    const w = mount(WikiGuideView, { global: { plugins: [router] } });
    expect(w.get('h5').text()).toBe('玩法攻略');
    const sections = w.findAll('[data-testid="guide-section"]');
    expect(sections).toHaveLength(zhCN.wiki.guide.sections.length);
    sections.forEach((s, i) => {
      expect(s.get('h6').text()).toBe(zhCN.wiki.guide.sections[i]!.title);
      expect(s.findAll('li')).toHaveLength(zhCN.wiki.guide.sections[i]!.items.length);
    });
    expect(sections[0]!.text()).toContain('勤快');
    expect(w.get('a').attributes('href')).toBe('/wiki');
  });
});
