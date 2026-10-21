import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DtStepper from './DtStepper.vue';

const mountIt = (props: Record<string, unknown>) =>
  mount(DtStepper, { props: { modelValue: 5, min: 1, max: 10, testid: 'n', ...props } });
const last = (w: ReturnType<typeof mountIt>) => w.emitted('update:modelValue')?.at(-1)?.[0];

describe('数量步进器（界面改版 P3，设计 §5 第 6 条）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('加减各一；到上限加号灰、到下限减号灰；按钮有读屏名字', async () => {
    const w = mountIt({});
    const [dec, inc] = w.findAll('button');
    expect(dec!.attributes('aria-label')).toBe('减少');
    expect(inc!.attributes('aria-label')).toBe('增加');
    await inc!.trigger('click');
    expect(last(w)).toBe(6);
    await dec!.trigger('click');
    expect(last(w)).toBe(4);
    expect(mountIt({ modelValue: 10 }).findAll('button')[1]!.attributes('disabled')).toBeDefined();
    expect(mountIt({ modelValue: 1 }).findAll('button')[0]!.attributes('disabled')).toBeDefined();
  });

  it('中间的数字框有读屏名字：默认“数量”，可以传 label（backlog P3）', () => {
    expect(mountIt({}).get('input').attributes('aria-label')).toBe('数量');
    expect(mountIt({ label: '出价' }).get('input').attributes('aria-label')).toBe('出价');
  });

  it('直接打字：合法数字跟着变；空的、字母失焦后回到下限；超上限夹到上限；小数取整', async () => {
    const w = mountIt({});
    const input = w.get('input[data-testid="n"]');
    await input.setValue('7');
    expect(last(w)).toBe(7);
    await input.setValue('3.5');
    expect(last(w)).toBe(3);
    await w.setProps({ modelValue: 3 });
    await input.setValue('');
    await input.trigger('blur');
    expect(last(w)).toBe(1);
    await input.setValue('500');
    await input.trigger('blur');
    expect(last(w)).toBe(10);
    for (const [v] of w.emitted('update:modelValue')!) expect(Number.isFinite(v)).toBe(true);
  });

  it('上限变小（体力用掉了）：当前值跟着夹', async () => {
    const w = mountIt({ modelValue: 8 });
    await w.setProps({ max: 4 });
    expect(last(w)).toBe(4);
  });

  it('禁用时三个都不能用', () => {
    const w = mountIt({ disabled: true });
    for (const b of w.findAll('button')) expect(b.attributes('disabled')).toBeDefined();
    expect(w.get('input').attributes('disabled')).toBeDefined();
  });

  it('已经在上限时再打更大的数：框里马上退回上限（不等失焦）', async () => {
    const w = mountIt({ modelValue: 10 });
    const input = w.get('input');
    await input.setValue('500');
    expect((input.element as HTMLInputElement).value).toBe('10');
  });

  it('逐字打价格：打到一半低于下限时不跳回下限，失焦后才夹（P8 终审 C1）', async () => {
    const w = mountIt({ modelValue: 1600, min: 800, max: 3200 });
    const input = w.get('input');
    await input.setValue('2');
    expect((input.element as HTMLInputElement).value).toBe('2');
    expect(w.emitted('update:modelValue')).toBeUndefined();
    await input.setValue('25');
    await input.setValue('250');
    await input.setValue('2500');
    expect(last(w)).toBe(2500);
    await input.setValue('9');
    await input.trigger('blur');
    expect(last(w)).toBe(800);
  });

  it('紧凑尺寸（列表行里用，界面改版 P4）：多一个 dt-stepper-sm 类', () => {
    expect(mountIt({ size: 'sm' }).classes()).toContain('dt-stepper-sm');
    expect(mountIt({}).classes()).not.toContain('dt-stepper-sm');
  });
});

describe('按住连加（界面第二批）', () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(() => vi.useRealTimers());

  it('按住 0.4 秒后开始连着加；松手后补来的那次 click 不再多加', async () => {
    vi.useFakeTimers();
    const w = mountIt({ modelValue: 5, max: 100 });
    const inc = w.findAll('button')[1]!;
    await inc.trigger('pointerdown');
    vi.advanceTimersByTime(399);
    expect(w.emitted('update:modelValue')).toBeUndefined();
    vi.advanceTimersByTime(1 + 120 + 120);
    expect(w.emitted('update:modelValue')).toHaveLength(3);
    await inc.trigger('pointerup');
    await inc.trigger('click');
    expect(w.emitted('update:modelValue')).toHaveLength(3);
    // 之后正常点一下照常加
    vi.advanceTimersByTime(1);
    await inc.trigger('click');
    expect(w.emitted('update:modelValue')).toHaveLength(4);
  });

  it('短按（不到 0.4 秒）就是普通的一下；到上限自己停', async () => {
    vi.useFakeTimers();
    const w = mountIt({ modelValue: 9, max: 10 });
    const inc = w.findAll('button')[1]!;
    await inc.trigger('pointerdown');
    vi.advanceTimersByTime(200);
    await inc.trigger('pointerup');
    await inc.trigger('click');
    expect(w.emitted('update:modelValue')).toEqual([[10]]);
    await w.setProps({ modelValue: 10 });
    await w.findAll('button')[0]!.trigger('pointerdown');
    vi.advanceTimersByTime(400);
    expect(last(w)).toBe(9);
  });
});
