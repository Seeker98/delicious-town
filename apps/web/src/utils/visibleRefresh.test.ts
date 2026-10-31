import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createThrottle, useVisibleRefresh, VISIBLE_REFRESH_MIN_MS } from './visibleRefresh';

describe('切回前台重读的节流（性能 2026-10-31）', () => {
  afterEach(() => vi.restoreAllMocks());

  it('第一次放行；一分钟内不放行；别处读过（touch）也重新计时', () => {
    let t = 1_000_000;
    const th = createThrottle(VISIBLE_REFRESH_MIN_MS, () => t);
    expect(th.take()).toBe(true);
    t += 59_999;
    expect(th.take()).toBe(false);
    t += 2;
    expect(th.take()).toBe(true);
    t += 61_000;
    th.touch();
    t += 1_000;
    expect(th.take()).toBe(false);
  });

  it('组件里：只在切回前台时读；挂载期间读过就跳过；卸载后不再读', async () => {
    vi.useFakeTimers();
    try {
      const refresh = vi.fn();
      let touch!: () => void;
      const C = defineComponent({
        setup() {
          touch = useVisibleRefresh(refresh).touch;
          return () => h('p');
        },
      });
      const w = mount(C);
      const state = vi.spyOn(document, 'visibilityState', 'get');
      const flip = (v: 'visible' | 'hidden') => {
        state.mockReturnValue(v);
        document.dispatchEvent(new Event('visibilitychange'));
      };
      touch();
      flip('hidden');
      flip('visible');
      expect(refresh).not.toHaveBeenCalled();
      vi.advanceTimersByTime(VISIBLE_REFRESH_MIN_MS);
      flip('hidden');
      expect(refresh).not.toHaveBeenCalled();
      flip('visible');
      expect(refresh).toHaveBeenCalledTimes(1);
      flip('visible');
      expect(refresh).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(VISIBLE_REFRESH_MIN_MS);
      w.unmount();
      flip('visible');
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
