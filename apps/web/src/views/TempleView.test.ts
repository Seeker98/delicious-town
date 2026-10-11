import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
import { templeData } from '../components/temple/testData';
import TempleView from './TempleView.vue';

vi.mock('../api/endpoints', () => ({ endpoints: { temple: vi.fn() } }));

const stubs = {
  AppraisePanel: { template: '<p>appraise-panel</p>' },
  GuardianPanel: { template: '<p>guardian-panel</p>', props: ['data'] },
  ExplorePanel: { template: '<p>explore-panel</p>', props: ['data'] },
  TrialPanel: { template: '<p>trial-panel</p>', props: ['data'] },
  KrakenPanel: { template: '<p>kraken-panel</p>', props: ['data'] },
};

describe('TempleView（标签页）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    localStorage.clear();
    vi.mocked(endpoints.temple).mockResolvedValue(templeData({ strength: 9848, tentacles: 3 }));
  });

  it('默认是鉴定；头图的数字要神殿数据，鉴定页也读；切到守护兽；记住上次的标签', async () => {
    const w = mount(TempleView, { global: { stubs } });
    await flushPromises();
    expect(w.text()).toContain('appraise-panel');
    // 统一标签页（界面改版 P2b）：按钮式、选中的 aria-selected
    expect(w.get('[data-testid="tab-appraise"]').attributes('aria-selected')).toBe('true');
    // 头图上的数字胶囊（界面改版 P9）：鉴定页也读一次神殿数据
    expect(endpoints.temple).toHaveBeenCalledTimes(1);
    expect(w.get('[data-testid="temple-strength"]').text()).toContain('9,848');
    expect(w.get('[data-testid="temple-hp"]').text()).toContain('12,000 / 15,000');
    expect(w.get('[data-testid="temple-tentacles"]').text()).toContain('3');
    await w.find('[data-testid="tab-guardian"]').trigger('click');
    await flushPromises();
    expect(w.text()).toContain('guardian-panel');
    const w2 = mount(TempleView, { global: { stubs } });
    await flushPromises();
    expect(w2.text()).toContain('guardian-panel');
  });

  it('切标签重读神殿数据；读不到时写明并能重试（P9 终审 I5）', async () => {
    vi.mocked(endpoints.temple).mockRejectedValueOnce(new Error('net'));
    const w = mount(TempleView, { global: { stubs } });
    await flushPromises();
    await w.find('[data-testid="tab-guardian"]').trigger('click');
    await flushPromises();
    expect(endpoints.temple).toHaveBeenCalledTimes(2);
    expect(w.text()).toContain('guardian-panel');
    vi.mocked(endpoints.temple).mockRejectedValueOnce(new Error('net'));
    const bad = mount(TempleView, { global: { stubs } });
    await flushPromises();
    expect(bad.get('[data-testid="temple-failed"]').text()).toContain('读取神殿失败');
    await bad.get('[data-testid="temple-failed"] button').trigger('click');
    await flushPromises();
    expect(bad.find('[data-testid="temple-failed"]').exists()).toBe(false);
    expect(bad.text()).toContain('guardian-panel');
  });
});
