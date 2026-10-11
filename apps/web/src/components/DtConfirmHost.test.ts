import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useConfirmStore } from '../stores/confirm';
import DtConfirmHost from './DtConfirmHost.vue';

const mountHost = () => mount(DtConfirmHost, { global: { stubs: { teleport: true } } });

describe('确认面板（界面改版 P3）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('挂上就接管确认，卸载交回浏览器确认框', () => {
    const w = mountHost();
    expect(useConfirmStore().hosts).toBe(1);
    w.unmount();
    expect(useConfirmStore().hosts).toBe(0);
  });

  it('显示标题、正文；普通确认是紫色按钮，点了得 true', async () => {
    const w = mountHost();
    const p = useConfirmStore().ask({ title: '购买称号？', body: '花 1,000 银币', ok: '购买' });
    await flushPromises();
    expect(w.text()).toContain('购买称号？');
    expect(w.text()).toContain('花 1,000 银币');
    const ok = w.get('[data-testid="confirm-ok"]');
    expect(ok.text()).toBe('购买');
    expect(ok.classes()).toContain('btn-primary');
    await ok.trigger('click');
    await expect(p).resolves.toBe(true);
    await flushPromises();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
  });

  it('危险操作是红色描边按钮；取消得 false；没写按钮文案时写“确定”', async () => {
    const w = mountHost();
    const p = useConfirmStore().ask({ title: '分解？', danger: true });
    await flushPromises();
    const ok = w.get('[data-testid="confirm-ok"]');
    expect(ok.classes()).toContain('btn-outline-danger');
    expect(ok.text()).toBe('确定');
    await w.get('[data-testid="confirm-cancel"]').trigger('click');
    await expect(p).resolves.toBe(false);
  });
});
