import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import type { NewsDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useSessionStore } from '../../stores/session';
import NewsPanel from './NewsPanel.vue';
import { townData } from './testData';

vi.mock('../../api/endpoints', () => ({ endpoints: { townNews: vi.fn(), townBroadcast: vi.fn() } }));

const item = (id: number, type = 'star.up', params: Record<string, unknown> = { star: 1 }): NewsDto => ({
  id,
  type,
  restId: 7,
  restName: '小王的店',
  params,
  createdAt: '2026-09-30T04:00:00.000Z',
});

describe('NewsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('列出新闻，广播醒目；"加载更多"带上最后一条的 id', async () => {
    vi.mocked(endpoints.townNews)
      .mockResolvedValueOnce({ items: [item(9, 'town.broadcast', { text: '你好' }), item(8)], hasMore: true })
      .mockResolvedValueOnce({ items: [item(3)], hasMore: false });
    const w = mount(NewsPanel, { props: { data: townData() } });
    await flushPromises();
    const rows = w.findAll('[data-testid="news-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain('小王的店：你好');
    expect(rows[0]!.classes()).toContain('text-primary');
    await w.find('[data-testid="news-more"]').trigger('click');
    await flushPromises();
    expect(endpoints.townNews).toHaveBeenLastCalledWith(8);
    expect(w.findAll('[data-testid="news-row"]')).toHaveLength(3);
    expect(w.find('[data-testid="news-more"]').exists()).toBe(false);
  });

  it('广播：发送后清空输入、通知刷新、重新读第一页', async () => {
    vi.mocked(endpoints.townNews).mockResolvedValue({ items: [], hasMore: false });
    vi.mocked(endpoints.townBroadcast).mockResolvedValue({ text: '大家好' });
    const w = mount(NewsPanel, { props: { data: townData() } });
    await flushPromises();
    await w.find('[data-testid="bc-input"]').setValue('大家好');
    await w.find('[data-testid="bc-send"]').trigger('click');
    await flushPromises();
    expect(endpoints.townBroadcast).toHaveBeenCalledWith('大家好');
    expect((w.find('[data-testid="bc-input"]').element as HTMLInputElement).value).toBe('');
    expect(w.emitted('reload')).toHaveLength(1);
    expect(endpoints.townNews).toHaveBeenCalledTimes(2);
  });

  it('没有喇叭或星级不够时按钮灰掉并写明原因', async () => {
    vi.mocked(endpoints.townNews).mockResolvedValue({ items: [], hasMore: false });
    const w = mount(NewsPanel, {
      props: { data: townData({ broadcast: { horns: 0, readyAt: null, minStar: 1, maxLen: 64 } }) },
    });
    await flushPromises();
    expect(w.find('[data-testid="bc-block"]').text()).toBe('没有喇叭（和 13 哥聊天可以拿到）');
    expect(w.find('[data-testid="bc-send"]').attributes('disabled')).toBeDefined();
    const low = mount(NewsPanel, { props: { data: townData({ star: 0 }) } });
    await flushPromises();
    expect(low.find('[data-testid="bc-block"]').text()).toBe('餐厅 1 星才能广播');
  });

  describe('冷却按服务器时间倒计时（终审 I1）', () => {
    afterEach(() => vi.useRealTimers());
    it('冷却结束后按钮自己恢复，不用刷新', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
      // 本机时钟比服务器慢 1 小时：倒计时仍按服务器时间算
      vi.setSystemTime(new Date('2026-09-30T03:00:00.000Z'));
      vi.mocked(endpoints.townNews).mockResolvedValue({ items: [], hasMore: false });
      const data = townData({
        now: '2026-09-30T04:00:00.000Z',
        broadcast: { horns: 2, readyAt: '2026-09-30T04:00:02.000Z', minStar: 1, maxLen: 64 },
      });
      const w = mount(NewsPanel, { props: { data } });
      await flushPromises();
      await w.find('[data-testid="bc-input"]').setValue('你好');
      expect(w.find('[data-testid="bc-block"]').text()).toBe('广播冷却中，还要等 2 秒');
      expect(w.find('[data-testid="bc-send"]').attributes('disabled')).toBeDefined();
      vi.advanceTimersByTime(1000);
      await nextTick();
      expect(w.find('[data-testid="bc-block"]').text()).toBe('广播冷却中，还要等 1 秒');
      vi.advanceTimersByTime(1000);
      await nextTick();
      expect(w.find('[data-testid="bc-block"]').exists()).toBe(false);
      expect(w.find('[data-testid="bc-send"]').attributes('disabled')).toBeUndefined();
    });
  });

  it('新闻用紧凑行（问题记录 104：垂直留空太大）', async () => {
    vi.mocked(endpoints.townNews).mockResolvedValue({ items: [item(1)], hasMore: false });
    const w = mount(NewsPanel, { props: { data: townData() } });
    await flushPromises();
    expect(w.find('[data-testid="news-row"]').classes()).toContain('dt-feed');
  });

  it('新闻页的广播带【广播】前缀（终审 I6）', async () => {
    vi.mocked(endpoints.townNews).mockResolvedValue({
      items: [item(9, 'town.broadcast', { text: '你好' })],
      hasMore: false,
    });
    const w = mount(NewsPanel, { props: { data: townData() } });
    await flushPromises();
    expect(w.find('[data-testid="news-row"]').text()).toContain('【广播】小王的店：你好');
  });

  it('加载更多连点两次只请求一次（终审 I6）', async () => {
    vi.mocked(endpoints.townNews).mockResolvedValueOnce({ items: [item(9)], hasMore: true });
    let release: (v: { items: NewsDto[]; hasMore: boolean }) => void = () => {};
    vi.mocked(endpoints.townNews).mockImplementationOnce(() => new Promise((r) => (release = r)));
    const w = mount(NewsPanel, { props: { data: townData() } });
    await flushPromises();
    await w.find('[data-testid="news-more"]').trigger('click');
    await w.find('[data-testid="news-more"]').trigger('click');
    expect(endpoints.townNews).toHaveBeenCalledTimes(2);
    release({ items: [item(3)], hasMore: false });
    await flushPromises();
    expect(w.findAll('[data-testid="news-row"]')).toHaveLength(2);
  });

  it('广播失败后也通知刷新', async () => {
    vi.mocked(endpoints.townNews).mockResolvedValue({ items: [], hasMore: false });
    vi.mocked(endpoints.townBroadcast).mockRejectedValue(new Error('x'));
    const w = mount(NewsPanel, { props: { data: townData() } });
    await flushPromises();
    await w.find('[data-testid="bc-input"]').setValue('大家好');
    await w.find('[data-testid="bc-send"]').trigger('click');
    await flushPromises();
    expect(w.emitted('reload')).toHaveLength(1);
  });

  it('加载更多还没回来时发广播：刷新第一页照样执行，旧的追加作废（PR27 遗留）', async () => {
    let more!: (v: { items: NewsDto[]; hasMore: boolean }) => void;
    vi.mocked(endpoints.townNews)
      .mockResolvedValueOnce({ items: [item(9), item(8)], hasMore: true })
      .mockImplementationOnce(() => new Promise((r) => (more = r)))
      .mockResolvedValueOnce({
        items: [item(12, 'town.broadcast', { text: '刚发的' }), item(9)],
        hasMore: true,
      });
    vi.mocked(endpoints.townBroadcast).mockResolvedValue({ text: '刚发的' });
    const w = mount(NewsPanel, { props: { data: townData() } });
    await flushPromises();
    await w.find('[data-testid="news-more"]').trigger('click');
    await w.find('[data-testid="bc-input"]').setValue('刚发的');
    await w.find('[data-testid="bc-send"]').trigger('click');
    await flushPromises();
    more({ items: [item(3)], hasMore: false });
    await flushPromises();
    expect(endpoints.townNews).toHaveBeenCalledTimes(3);
    const rows = w.findAll('[data-testid="news-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain('刚发的');
  });

  it('别人的喇叭旁有举报，其他新闻和自己的喇叭没有（子项目 6B-1）', async () => {
    useSessionStore().me = {
      accountId: 1,
      username: 'u',
      email: 'u@x',
      emailVerified: true,
      role: 'player' as const,
      shardId: 1,
      restaurantId: 1,
      lang: null,
      npcRestId: null,
    };
    vi.mocked(endpoints.townNews).mockResolvedValue({
      items: [
        item(9, 'town.broadcast', { text: '你好' }),
        item(8),
        { ...item(7, 'town.broadcast', { text: '我' }), restId: 1 },
      ],
      hasMore: false,
    });
    const w = mount(NewsPanel, { props: { data: townData() } });
    await flushPromises();
    expect(w.find('[data-testid="news-report-9-open"]').exists()).toBe(true);
    expect(w.find('[data-testid="news-report-8-open"]').exists()).toBe(false);
    expect(w.find('[data-testid="news-report-7-open"]').exists()).toBe(false);
  });

  it('广播只加粗内容，时间不加粗；举报按钮跟正文同字号同行高（问题记录 196）', async () => {
    useSessionStore().me = {
      accountId: 1,
      username: 'u',
      email: 'u@x',
      emailVerified: true,
      role: 'player' as const,
      shardId: 1,
      restaurantId: 1,
      lang: null,
      npcRestId: null,
    };
    vi.mocked(endpoints.townNews).mockResolvedValue({
      items: [item(9, 'town.broadcast', { text: '你好' })],
      hasMore: false,
    });
    const w = mount(NewsPanel, { props: { data: townData() } });
    await flushPromises();
    const row = w.find('[data-testid="news-row"]');
    expect(row.classes()).not.toContain('fw-bold');
    expect(row.find('.dt-feed-time').classes()).not.toContain('fw-bold');
    expect(row.find('[data-testid="news-text"]').classes()).toContain('fw-bold');
    expect(w.find('[data-testid="news-report-9-open"]').classes()).toContain('dt-inline-btn');
  });

  it('一番赏大赏和喇叭一样醒目显示（和首页一致），但没有举报按钮（backlog 一番赏）', async () => {
    vi.mocked(endpoints.townNews).mockResolvedValueOnce({
      items: [item(9, 'kuji.big', { tier: 'A', pool: 1, seq: 1 })],
      hasMore: false,
    });
    const w = mount(NewsPanel, { props: { data: townData() } });
    await flushPromises();
    const row = w.get('[data-testid="news-row"]');
    expect(row.classes()).toContain('text-primary');
    expect(row.get('[data-testid="news-text"]').text()).toContain('【广播】');
    expect(row.find('[data-testid="news-report-9"]').exists()).toBe(false);
  });
});
