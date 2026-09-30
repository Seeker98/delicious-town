import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LessonsDto, McOverviewDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import ClassroomView from './ClassroomView.vue';

vi.mock('../api/endpoints', () => ({
  endpoints: {
    lessons: vi.fn(),
    mc: vi.fn(),
    lessonOpen: vi.fn(),
    lessonLearn: vi.fn(),
    lessonClose: vi.fn(),
  },
}));

const future = new Date(Date.now() + 5 * 3600_000).toISOString();
const lessons: LessonsDto = {
  items: [
    {
      id: 7,
      teacherId: 2,
      teacherName: '乙店',
      mcId: 3,
      level: 3,
      maxNum: 5,
      learned: 1,
      stolen: 0,
      endsAt: future,
      tried: false,
    },
  ],
  mine: null,
  certs: [
    { goodsId: 177, num: 1, levels: [1, 2], needStrength: 50, maxNum: 5, lessonHour: 24 },
    { goodsId: 178, num: 1, levels: [3, 4], needStrength: 65, maxNum: 5, lessonHour: 24 },
  ],
  canForceClose: false,
  forceCloseCoinPerLevel: 50000,
  forgetPerLevel: 3,
};
const mc = {
  learned: [
    { mcId: 1, curlevel: 1, levelName: '初学', curexp: 0, expNext: 200, trialWorth: 0, trialExp: 0, way: 1 },
  ],
} as McOverviewDto;

describe('ClassroomView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
      mysterious: [
        { id: 1, name: '秘·仿膳饽饽', level: 4, road: 1, nutritive: 31, coin: 1, foods: [] },
        { id: 3, name: '秘·凤凰展翅', level: 3, road: 1, nutritive: 22, coin: 1, foods: [] },
      ],
    } as never);
    vi.mocked(endpoints.lessons).mockResolvedValue(structuredClone(lessons));
    vi.mocked(endpoints.mc).mockResolvedValue(structuredClone(mc));
  });

  it('偷学先确认（写明会遗忘几道食谱）；失败时提示遗忘了多少', async () => {
    vi.mocked(endpoints.lessonLearn).mockResolvedValue({
      success: false,
      forgot: { cookbooks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], mcId: null },
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = mount(ClassroomView);
    await flushPromises();
    await w.find('[data-testid="steal-7"]').trigger('click');
    expect(confirm.mock.calls[0]![0]).toContain('遗忘 10 道食谱');
    expect(endpoints.lessonLearn).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await w.find('[data-testid="steal-7"]').trigger('click');
    await flushPromises();
    expect(endpoints.lessonLearn).toHaveBeenCalledWith(7, 2);
    expect(useToastStore().items.some((x) => x.text.includes('遗忘了 10 道食谱'))).toBe(true);
    confirm.mockRestore();
  });

  it('开课：教师证只列等级合适且持有的', async () => {
    vi.mocked(endpoints.lessonOpen).mockResolvedValue({ id: 9 });
    const w = mount(ClassroomView);
    await flushPromises();
    await w.find('[data-testid="open-mc"]').setValue('1');
    const opts = w.findAll('[data-testid="open-cert"] option').map((o) => o.text());
    // 测试目录里没有道具，名字显示为「道具178」
    expect(opts.some((x) => x.includes('道具178'))).toBe(true);
    expect(opts.some((x) => x.includes('道具177'))).toBe(false);
    await w.find('[data-testid="open-cert"]').setValue('178');
    await w.find('[data-testid="open-lesson"]').trigger('click');
    await flushPromises();
    expect(endpoints.lessonOpen).toHaveBeenCalledWith(1, 178);
  });
});
