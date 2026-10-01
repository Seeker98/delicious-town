import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GardenSis from './GardenSis.vue';

describe('GardenSis（问题记录 176）', () => {
  afterEach(() => vi.restoreAllMocks());

  it('点一下换一句不同的', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.3);
    const w = mount(GardenSis, { props: { data: null } });
    const first = w.find('[data-testid="garden-sis-line"]').text();
    expect(first).not.toBe('');
    await w.find('[data-testid="garden-sis"]').trigger('click');
    expect(w.find('[data-testid="garden-sis-line"]').text()).not.toBe(first);
  });
});
