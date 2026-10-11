import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { usePageTitle, usePageTitleStore } from './pageTitle';

beforeEach(() => setActivePinia(createPinia()));

describe('动态标题（界面改版 P2a）', () => {
  it('页面写进标题，数据变了跟着变；还没读回来（空）时不写；离开页面清掉', async () => {
    const name = ref<string | null>(null);
    const C = defineComponent({ setup: () => (usePageTitle(() => name.value), () => h('div')) });
    const w = mount(C);
    const s = usePageTitleStore();
    expect(s.title).toBeNull();
    name.value = '不会玩的店';
    await nextTick();
    expect(s.title).toBe('不会玩的店');
    w.unmount();
    expect(s.title).toBeNull();
  });
});
