import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
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
});
