import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import PickRow from './PickRow.vue';

describe('PickRow（界面改版 P10：面板里“选一个”的一行）', () => {
  it('单选圈：选中时 aria-checked 和 is-on；名字、灰字、右边插槽；点了发出 pick', async () => {
    const w = mount(PickRow, {
      props: { on: false, title: '晴天', sub: '上座率 +5%', testid: 'hammer-1' },
      slots: { end: '<span class="dt-tag">10 钻</span>' },
    });
    const b = w.get('[data-testid="hammer-1"]');
    expect(b.element.tagName).toBe('BUTTON');
    expect(b.attributes('role')).toBe('radio');
    expect(b.attributes('aria-checked')).toBe('false');
    expect(b.classes()).not.toContain('is-on');
    expect(w.get('.dt-pick-title').text()).toBe('晴天');
    expect(w.get('.dt-pick-sub').text()).toBe('上座率 +5%');
    expect(w.get('.dt-pick-end').text()).toBe('10 钻');
    await b.trigger('click');
    expect(w.emitted('pick')).toHaveLength(1);
    await w.setProps({ on: true });
    expect(b.attributes('aria-checked')).toBe('true');
    expect(b.classes()).toContain('is-on');
  });

  it('没有灰字、右边插槽、图形时不留空位；选不了的行灰掉，点了不发出', async () => {
    const w = mount(PickRow, { props: { on: false, title: '雨天', disabled: true } });
    expect(w.find('.dt-pick-sub').exists()).toBe(false);
    expect(w.find('.dt-pick-end').exists()).toBe(false);
    expect(w.find('.dt-pick-art').exists()).toBe(false);
    expect(w.get('button').attributes('disabled')).toBeDefined();
    await w.get('button').trigger('click');
    expect(w.emitted('pick')).toBeUndefined();
  });

  it('名字和灰字可以用插槽', () => {
    const w = mount(PickRow, {
      props: { on: true },
      slots: { title: '<b>自定名字</b>', sub: '<i>自定灰字</i>' },
    });
    expect(w.get('.dt-pick-title b').text()).toBe('自定名字');
    expect(w.get('.dt-pick-sub i').text()).toBe('自定灰字');
  });
});
