import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useRestaurantStore } from '../stores/restaurant';
import SocietyView from './SocietyView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: { hiphopSpot: vi.fn().mockResolvedValue({ here: false }) },
}));

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:p(.*)*', component: { template: '<div />' } }],
  });
  const w = mount(SocietyView, { global: { plugins: [router] } });
  await flushPromises();
  return w;
}
const hrefs = (w: Awaited<ReturnType<typeof mountView>>) => w.findAll('a').map((a) => a.attributes('href'));

describe('协会（问题记录 441、443）', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('原来的四项之外，多了教室、镇长大胃锅、13 哥、卡门、盖乐瑞', async () => {
    const w = await mountView();
    expect(hrefs(w)).toEqual([
      '/society/star',
      '/society/oil',
      '/society/rename',
      '/society/move',
      '/society/classroom',
      '/society/mayor',
      '/society/bro13',
      '/society/carmen',
      '/society/fund',
    ]);
    expect(w.text()).toContain('镇长大胃锅');
    expect(w.text()).toContain('盖乐瑞');
  });

  it('区服关掉的功能对应的入口不显示：广场关了没有三位兑换的 NPC，神秘食谱关了没有教室，基金关了没有盖乐瑞', async () => {
    useRestaurantStore().rest = { disabledFeatures: ['town', 'mysterious', 'fund'] } as never;
    const w = await mountView();
    expect(hrefs(w)).toEqual(['/society/star', '/society/oil', '/society/rename', '/society/move']);
  });
});
