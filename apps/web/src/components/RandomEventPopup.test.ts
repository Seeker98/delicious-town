import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { RandomEventDto, RandomQuestionDto } from '@dt/shared';
import { ApiError } from '../api/client';
import { endpoints } from '../api/endpoints';
import { useRestaurantStore } from '../stores/restaurant';
import RandomEventPopup from './RandomEventPopup.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    randomEventCurrent: vi.fn(),
    randomEventChoose: vi.fn(),
    randomEventAnswer: vi.fn(),
    randomEventSeen: vi.fn(),
  },
}));

const ev = (patch: Partial<RandomEventDto> = {}): RandomEventDto => ({
  id: '5',
  kind: 'notice',
  refId: 1,
  title: '装卸队去散步',
  body: '菜场的装卸队今天集体去广场散步了。',
  status: 'done',
  expiresAt: '2026-11-02T06:00:00.000Z',
  options: null,
  questions: null,
  chosen: null,
  result: {
    text: '散完步的队员们都跑来你店里歇脚。',
    effects: { atRate: 0.06 },
    until: '2026-11-02T04:00:00.000Z',
    reward: null,
  },
  ...patch,
});

const q = (patch: Partial<RandomQuestionDto> = {}): RandomQuestionDto => ({
  id: 1,
  type: 'game',
  q: '下面哪种天气里, 合成与分解食材一定成功?',
  choices: ['雾', '大风', '晴', '沙尘暴'],
  grades: null,
  picked: null,
  answer: null,
  correct: null,
  explain: null,
  ...patch,
});

async function mountPopup(current: RandomEventDto | null) {
  vi.mocked(endpoints.randomEventCurrent).mockResolvedValue({ event: current });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { template: '<p />' } }],
  });
  await router.push('/rest');
  const w = mount(RandomEventPopup, { global: { plugins: [router], stubs: { teleport: true } } });
  await flushPromises();
  return w;
}

describe('RandomEventPopup（随机事件，设计稿 2026-10-28 §10）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.randomEventSeen).mockResolvedValue({ ok: true });
    // 店读到了、区服开着随机事件才问（性能 2026-10-31）
    useRestaurantStore().rest = { disabledFeatures: [] } as never;
  });

  it('没有事件不弹', async () => {
    const w = await mountPopup(null);
    expect(w.find('[data-testid="random-event"]').exists()).toBe(false);
  });

  it('通知: 正文、结果、效果标签；“知道了”记已看并关掉', async () => {
    const w = await mountPopup(ev());
    expect(w.text()).toContain('菜场的装卸队');
    expect(w.get('[data-testid="random-event-result"]').text()).toContain('上座率+6%');
    await w.get('[data-testid="random-event-ok"]').trigger('click');
    await flushPromises();
    expect(endpoints.randomEventSeen).toHaveBeenCalledWith('5');
    expect(w.find('[data-testid="random-event"]').exists()).toBe(false);
  });

  it('选择: 花钱的选项写价格；选了以后显示结果和奖励', async () => {
    const pending = ev({
      kind: 'choice',
      status: 'pending',
      result: null,
      options: [
        { key: 'a', label: '买下', cost: 20 },
        { key: 'b', label: '不买', cost: null },
      ],
    });
    vi.mocked(endpoints.randomEventChoose).mockResolvedValue(
      ev({
        kind: 'choice',
        chosen: 'a',
        options: pending.options,
        result: {
          text: '锅底夹着两张券。',
          effects: null,
          until: null,
          reward: { coin: 0, exp: 0, tickets: 2, foods: [] },
        },
      }),
    );
    const w = await mountPopup(pending);
    const opts = w.findAll('[data-testid="random-event-option"]');
    expect(opts[0]!.text()).toContain('花 20 银币');
    expect(opts[1]!.text()).not.toContain('银币');
    await opts[0]!.trigger('click');
    await flushPromises();
    expect(endpoints.randomEventChoose).toHaveBeenCalledWith('5', 'a', 'zh-CN');
    expect(w.get('[data-testid="random-event-result"]').text()).toContain('神秘礼券×2');
  });

  it('银币不够时花钱的选项置灰', async () => {
    useRestaurantStore().rest = { coin: 10 } as never;
    const w = await mountPopup(
      ev({
        kind: 'choice',
        status: 'pending',
        result: null,
        options: [
          { key: 'a', label: '买下', cost: 20 },
          { key: 'b', label: '不买', cost: null },
        ],
      }),
    );
    const opts = w.findAll('[data-testid="random-event-option"]');
    expect(opts[0]!.attributes('disabled')).toBeDefined();
    expect(opts[1]!.attributes('disabled')).toBeUndefined();
  });

  it('问答: 标题写“小镇问答”；答完标出对错和解说', async () => {
    const pending = ev({
      kind: 'quiz',
      title: null,
      body: null,
      status: 'pending',
      result: null,
      questions: [q()],
    });
    vi.mocked(endpoints.randomEventAnswer).mockResolvedValue({
      ...pending,
      status: 'done',
      questions: [q({ picked: 1, answer: 1, correct: true, explain: '大风和飓风天都是百分之百成功。' })],
      result: { text: null, effects: null, until: null, reward: { coin: 0, exp: 0, tickets: 1, foods: [] } },
    });
    const w = await mountPopup(pending);
    expect(w.text()).toContain('小镇问答');
    await w.findAll('[data-testid="random-event-choice"]')[1]!.trigger('click');
    await flushPromises();
    expect(endpoints.randomEventAnswer).toHaveBeenCalledWith('5', 1, undefined, 'zh-CN');
    expect(w.text()).toContain('答对了!');
    expect(w.text()).toContain('百分之百');
    expect(w.findAll('[data-testid="random-event-choice"]')[1]!.classes()).toContain('btn-success');
  });

  it('问答夜: 显示第几题, 从第一道没答的开始; 挂着时可以先关掉', async () => {
    const w = await mountPopup(
      ev({
        kind: 'quizNight',
        title: '酒吧问答夜',
        status: 'pending',
        result: null,
        questions: [q({ picked: 0, answer: 1, correct: false }), q({ id: 2 }), q({ id: 3 })],
      }),
    );
    expect(w.get('[data-testid="random-event-progress"]').text()).toBe('第 2 / 3 题');
    await w.get('[data-testid="random-event-later"]').trigger('click');
    await flushPromises();
    expect(endpoints.randomEventSeen).not.toHaveBeenCalled();
    expect(w.find('[data-testid="random-event"]').exists()).toBe(false);
  });
  it('超时结算的问答夜: 停在最后一道答过的, 没答的题不能再点', async () => {
    const w = await mountPopup(
      ev({
        kind: 'quizNight',
        title: '酒吧问答夜',
        questions: [q({ picked: 0, answer: 1, correct: false }), q({ id: 2 }), q({ id: 3 })],
      }),
    );
    expect(w.get('[data-testid="random-event-progress"]').text()).toBe('第 1 / 3 题');
    expect(w.find('[data-testid="random-event-result"]').exists()).toBe(true);
    for (const b of w.findAll('[data-testid="random-event-choice"]'))
      expect(b.attributes('disabled')).toBeDefined();
  });

  const choice = () =>
    ev({
      kind: 'choice',
      status: 'pending',
      result: null,
      options: [
        { key: 'a', label: '买下', cost: 20 },
        { key: 'b', label: '不买', cost: null },
      ],
    });

  it('选择报错（银币不够、网络）: 弹窗留着, 可以改选', async () => {
    vi.mocked(endpoints.randomEventChoose).mockRejectedValue(new ApiError('NOT_ENOUGH', { what: 'coin' }));
    const w = await mountPopup(choice());
    await w.findAll('[data-testid="random-event-option"]')[0]!.trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="random-event"]').exists()).toBe(true);
    expect(w.findAll('[data-testid="random-event-option"]')[1]!.attributes('disabled')).toBeUndefined();
  });

  it('这件已经了结或超时: 重新问一次现在该看什么', async () => {
    vi.mocked(endpoints.randomEventChoose).mockRejectedValue(
      new ApiError('INVALID_STATE', { reason: 'random_event_expired' }),
    );
    const w = await mountPopup(choice());
    vi.mocked(endpoints.randomEventCurrent).mockResolvedValue({ event: null });
    await w.findAll('[data-testid="random-event-option"]')[1]!.trigger('click');
    await flushPromises();
    expect(endpoints.randomEventCurrent).toHaveBeenCalledTimes(2);
    expect(w.find('[data-testid="random-event"]').exists()).toBe(false);
  });

  describe('什么时候问（性能 2026-10-31）', () => {
    const setHidden = (hidden: boolean) => {
      vi.spyOn(document, 'hidden', 'get').mockReturnValue(hidden);
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(hidden ? 'hidden' : 'visible');
    };
    afterEach(() => vi.restoreAllMocks());

    it('区服关着随机事件：不问，也不定时问', async () => {
      vi.useFakeTimers();
      try {
        useRestaurantStore().rest = { disabledFeatures: ['randomEvents'] } as never;
        await mountPopup(ev());
        await vi.advanceTimersByTimeAsync(30 * 60_000);
        expect(endpoints.randomEventCurrent).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('店还没读到时先不问，读到了、开着再问一次', async () => {
      const s = useRestaurantStore();
      s.rest = null;
      await mountPopup(null);
      expect(endpoints.randomEventCurrent).not.toHaveBeenCalled();
      s.rest = { disabledFeatures: [] } as never;
      await flushPromises();
      expect(endpoints.randomEventCurrent).toHaveBeenCalledTimes(1);
    });

    it('页面在后台时不问（定时的也跳过）；切回前台问一次，一分钟内再切回来不问', async () => {
      vi.useFakeTimers();
      try {
        setHidden(true);
        await mountPopup(null);
        await vi.advanceTimersByTimeAsync(10 * 60_000);
        expect(endpoints.randomEventCurrent).not.toHaveBeenCalled();
        setHidden(false);
        document.dispatchEvent(new Event('visibilitychange'));
        await flushPromises();
        expect(endpoints.randomEventCurrent).toHaveBeenCalledTimes(1);
        document.dispatchEvent(new Event('visibilitychange'));
        await flushPromises();
        expect(endpoints.randomEventCurrent).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(60_001);
        document.dispatchEvent(new Event('visibilitychange'));
        await flushPromises();
        expect(endpoints.randomEventCurrent).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
