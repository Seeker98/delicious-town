import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { CHANGELOG } from '../data/changelog';
import zhCN from '../i18n/locales/zh-CN';
import { headBody } from '../utils/headBody';
import ChangelogView from './ChangelogView.vue';

const KEY = 'dt_changelog_seen';
/** 不重复的日期，从新到旧 */
const DATES = [...new Set(CHANGELOG.map((x) => x.date))];
const countOn = (dates: string[]) => CHANGELOG.filter((x) => dates.includes(x.date)).length;

describe('ChangelogView（问题记录 348；界面改版 P11 报刊风）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('按日期分组，从新到旧；一次显示 10 天', () => {
    const w = mount(ChangelogView);
    const days = w.findAll('[data-testid^="cl-day-"]').map((x) => x.attributes('data-testid'));
    expect(days).toEqual(DATES.slice(0, 10).map((d) => `cl-day-${d}`));
    expect(w.findAll('[data-testid="cl-item"]')).toHaveLength(countOn(DATES.slice(0, 10)));
  });

  it('“再看 10 天”一次多显示 10 天，全部显示完按钮消失', async () => {
    const w = mount(ChangelogView);
    while (w.find('[data-testid="cl-more"]').exists())
      await w.get('[data-testid="cl-more"]').trigger('click');
    expect(w.findAll('[data-testid^="cl-day-"]')).toHaveLength(DATES.length);
    expect(w.findAll('[data-testid="cl-item"]')).toHaveLength(CHANGELOG.length);
    expect(w.text()).toContain('小镇发展基金');
  });

  it('每条在第一个“: ”处拆开：前面是加粗标题，后面是说明', () => {
    const w = mount(ChangelogView);
    const first = CHANGELOG.find((x) => headBody(zhCN.site.changelog[x.id]).head)!;
    const { head, body } = headBody(zhCN.site.changelog[first.id]);
    const li = w
      .get(`[data-testid="cl-day-${first.date}"]`)
      .findAll('[data-testid="cl-item"]')
      .find((x) => x.find('.dt-cl-head').text() === head)!;
    // 标题和说明之间照样写“: ”（中间可能夹着红色“新”）
    expect(li.text().startsWith(head)).toBe(true);
    expect(li.text().endsWith(`: ${body}`)).toBe(true);
  });

  it('从没看过：只有最新一天带“新”；看过之后记下最新日期', () => {
    const w = mount(ChangelogView);
    const news = w.findAll('[data-testid="cl-new"]');
    expect(news).toHaveLength(countOn([DATES[0]!]));
    expect(w.get(`[data-testid="cl-day-${DATES[0]}"]`).findAll('[data-testid="cl-new"]')).toHaveLength(
      news.length,
    );
    expect(localStorage.getItem(KEY)).toBe(DATES[0]);
  });

  it('上次看到第三新的那天：比它新的两天都带“新”；再进来就都不新了', () => {
    localStorage.setItem(KEY, DATES[2]!);
    const w = mount(ChangelogView);
    expect(w.findAll('[data-testid="cl-new"]')).toHaveLength(countOn(DATES.slice(0, 2)));
    expect(w.get(`[data-testid="cl-day-${DATES[2]}"]`).find('[data-testid="cl-new"]').exists()).toBe(false);
    const again = mount(ChangelogView);
    expect(again.find('[data-testid="cl-new"]').exists()).toBe(false);
  });
});
