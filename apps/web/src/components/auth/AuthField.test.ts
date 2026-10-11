import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import AuthField from './AuthField.vue';

const mountField = (props: Record<string, unknown> = {}) =>
  mount(AuthField, { props: { label: '用户名', modelValue: '', testid: 'f', ...props } });

describe('表单里的一格（界面改版 P11：登录注册、改密码、开店）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('标签在上面，用 for 指向输入框；输入时更新 v-model', async () => {
    const w = mountField({ autocomplete: 'username', required: true });
    const label = w.get('label');
    const input = w.get('[data-testid="f"]');
    expect(label.text()).toBe('用户名');
    expect(label.attributes('for')).toBe(input.attributes('id'));
    expect(input.attributes('autocomplete')).toBe('username');
    expect(input.attributes('required')).toBeDefined();
    await input.setValue('小王');
    expect(w.emitted('update:modelValue')).toEqual([['小王']]);
  });

  it('“(可不填)”写在标签后面的灰字里', () => {
    const w = mountField({ label: '邀请码', optional: '(可不填)' });
    expect(w.get('label .dt-auth-optional').text()).toBe('(可不填)');
  });

  it('没错时写灰字说明，并用 aria-describedby 关联', () => {
    const w = mountField({ hint: '用来找回密码' });
    const note = w.get('.dt-field-hint');
    expect(note.text()).toBe('用来找回密码');
    expect(note.classes()).not.toContain('is-bad');
    expect(w.get('input').attributes('aria-describedby')).toBe(note.attributes('id'));
    expect(w.get('input').attributes('aria-invalid')).toBeUndefined();
    expect(w.get('.dt-field').classes()).not.toContain('is-bad');
  });

  it('有错：说明换成红字、框变红、标 aria-invalid', () => {
    const w = mountField({ hint: '用来找回密码', error: '密码至少 6 位' });
    const note = w.get('.dt-field-hint');
    expect(note.text()).toBe('密码至少 6 位');
    expect(note.classes()).toContain('is-bad');
    expect(w.get('.dt-field').classes()).toContain('is-bad');
    expect(w.get('input').attributes('aria-invalid')).toBe('true');
  });

  it('既没说明也没错、也没字数：不出说明那一行', () => {
    const w = mountField();
    expect(w.find('.dt-field-hint').exists()).toBe(false);
    expect(w.get('input').attributes('aria-describedby')).toBeUndefined();
  });

  it('密码框右边的眼睛：点一下显示密码，再点藏起来；别的框没有眼睛', async () => {
    const w = mountField({ label: '密码', type: 'password' });
    const input = w.get('input');
    const eye = w.get('button.dt-field-eye');
    expect(input.attributes('type')).toBe('password');
    expect(eye.attributes('aria-pressed')).toBe('false');
    expect(eye.attributes('aria-label')).toBe('显示密码');
    await eye.trigger('click');
    expect(input.attributes('type')).toBe('text');
    expect(eye.attributes('aria-pressed')).toBe('true');
    await eye.trigger('click');
    expect(input.attributes('type')).toBe('password');
    expect(mountField({ type: 'email' }).find('button').exists()).toBe(false);
  });

  it('字数写在说明那一行右边，有错时照样显示', () => {
    const w = mountField({ count: '3 / 8', error: '名字里有不能用的字' });
    expect(w.get('[data-testid="field-count"]').text()).toBe('3 / 8');
    expect(w.get('.dt-field-hint').text()).toContain('名字里有不能用的字');
    const plain = mountField({ count: '0 / 8' });
    expect(plain.get('[data-testid="field-count"]').text()).toBe('0 / 8');
    expect(plain.get('input').attributes('aria-describedby')).toBeTruthy();
  });
});
