import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../api/endpoints';
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
    vi.mocked(endpoints.temple).mockResolvedValue({} as never);
  });

  it('默认是鉴定；切到守护兽时读神殿数据；记住上次的标签', async () => {
    const w = mount(TempleView, { global: { stubs } });
    await flushPromises();
    expect(w.text()).toContain('appraise-panel');
    expect(endpoints.temple).not.toHaveBeenCalled();
    await w.find('[data-testid="tab-guardian"]').trigger('click');
    await flushPromises();
    expect(endpoints.temple).toHaveBeenCalled();
    expect(w.text()).toContain('guardian-panel');
    const w2 = mount(TempleView, { global: { stubs } });
    await flushPromises();
    expect(w2.text()).toContain('guardian-panel');
  });
});
