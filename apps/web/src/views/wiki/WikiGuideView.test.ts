import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { OpenGuideNumbers, OpenIndexDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
// 从语言包入口取：直接引 zh-CN/wiki 会和 utils/format → i18n 绕成循环引用
import zhCN from '../../i18n/locales/zh-CN';
import WikiGuideView from './WikiGuideView.vue';

vi.mock('../../api/endpoints', () => ({ endpoints: { openIndex: vi.fn() } }));

/** 故意和现在的默认值都不一样：页面上的数要跟着接口走 */
const guide: OpenGuideNumbers = {
  startStreet: { name: '新手街', cookbooks: 71 },
  star2Cookbooks: 120,
  biggestStreet: { name: '测试大街', cookbooks: 345 },
  takeaway: { star: 3, renown: 999, coin: 9_990_000, diamond: 250 },
  exchange: { level: 25, days: 5 },
  predict: { level: 25, days: 5 },
  newbieExp: { maxLevel: 35, rate: 1.5 },
  acquire: {
    minStar: 2,
    taxRate: 0.1,
    maxHoldings: 10,
    dividendRate: 0.05,
    tendBonus: 0.5,
    minRounds: 90,
    tendFoods: 5,
    protectDays: 3,
  },
};
const index = (g: OpenGuideNumbers | undefined) =>
  ({
    version: 'v1',
    lang: 'zh-CN',
    langs: [],
    counts: {},
    endpoints: [],
    guide: g,
  }) as unknown as OpenIndexDto;

async function mountGuide() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: WikiGuideView }],
  });
  await router.push('/wiki/guide');
  const w = mount(WikiGuideView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}

describe('玩法攻略（问题记录 384）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(endpoints.openIndex).mockResolvedValue(index(guide));
  });

  it('按节写出三种节奏、每次上线做什么、搬街、花钱、其他玩法，每节逐条列出', async () => {
    const w = await mountGuide();
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

  it('攻略里的数按开放接口给的默认配置写，不写死（backlog 384）', async () => {
    const text = (await mountGuide()).text();
    expect(text).toContain('新手街只有 71 道, 升 2 星要学会 120 道');
    expect(text).toContain('测试大街有 345 道');
    expect(text).toContain('外卖要 3 星、999 声望');
    expect(text).toContain('999 万银币和 250 钻石');
    expect(text).toContain('25 级、注册满 5 天');
    expect(text).toContain('35 级以下结算经验有额外加成 (1 级 +150%');
  });

  it('事件预测的门槛和交易所不一样时分开写（审查 I1）', async () => {
    vi.mocked(endpoints.openIndex).mockResolvedValue(index({ ...guide, predict: { level: 30, days: 10 } }));
    const text = (await mountGuide()).text();
    expect(text).toContain('25 级、注册满 5 天并验证邮箱以后能用交易所');
    expect(text).toContain('事件预测要 30 级、注册满 10 天');
  });

  it('接口还没有这些数（发版前缓存的旧响应）时，带数的几条先不显示', async () => {
    vi.mocked(endpoints.openIndex).mockResolvedValue(index(undefined));
    const w = await mountGuide();
    expect(w.text()).not.toContain('新手街只有');
    expect(w.text()).toContain('勤快');
  });

  it('旧响应有 guide、但缺后来加的数（收购 PR 3 审查）：缺数的那条不显示，别的照常，页面不报错', async () => {
    const { acquire: _drop, ...old } = guide;
    vi.mocked(endpoints.openIndex).mockResolvedValue(index(old as OpenGuideNumbers));
    const w = await mountGuide();
    expect(w.text()).toContain('勤快');
    expect(w.text()).toContain('新手街');
    expect(w.text()).not.toContain('收购');
  });
});
