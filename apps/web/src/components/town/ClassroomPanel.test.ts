import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LessonsDto, McOverviewDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useCatalogStore } from '../../stores/catalog';
import { useConfirmStore } from '../../stores/confirm';
import { useToastStore } from '../../stores/toast';
import ClassroomPanel from './ClassroomPanel.vue';

vi.mock('../../api/endpoints', () => ({
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
  forgetPerLevel: 2,
  forgetGrades: 2,
};
const mc = {
  learned: [
    { mcId: 1, curlevel: 1, levelName: '初学', curexp: 0, expNext: 200, trialWorth: 0, trialExp: 0, way: 1 },
  ],
  // 开课面板写每道菜持有几张残卷，没有的灰掉（界面改版 P10）
  remnants: [{ mcId: 1, num: 1 }],
} as McOverviewDto;
/** 开课、说明面板 Teleport 到 body：测试里把 teleport 桩掉（界面改版 P10） */
const mountIt = () => mount(ClassroomPanel, { global: { stubs: { teleport: true } } });

describe('ClassroomPanel', () => {
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

  it('偷学先确认（写明几道食谱各降几品）；失败时提示降了多少（问题记录 424）', async () => {
    vi.mocked(endpoints.lessonLearn).mockResolvedValue({
      success: false,
      forgot: { cookbooks: [1, 2, 3, 4, 5, 6, 7], mcId: null, grades: 2, lost: 3 },
    });
    // 界面改版 P10：确认走底部确认面板（confirm store），不再用浏览器确认框
    const spy = vi.spyOn(window, 'confirm');
    const confirm = useConfirmStore();
    confirm.hosts = 1;
    const w = mountIt();
    await flushPromises();
    await w.find('[data-testid="steal-7"]').trigger('click');
    await flushPromises();
    expect(spy).not.toHaveBeenCalled();
    expect(confirm.current?.title).toBe('偷学秘·凤凰展翅？');
    expect(confirm.current?.body).toContain('7 道食谱各降 2 品');
    expect(confirm.current?.danger).toBe(true);
    confirm.answer(false);
    await flushPromises();
    expect(endpoints.lessonLearn).not.toHaveBeenCalled();
    await w.find('[data-testid="steal-7"]').trigger('click');
    await flushPromises();
    confirm.answer(true);
    await flushPromises();
    expect(endpoints.lessonLearn).toHaveBeenCalledWith(7, 2);
    expect(useToastStore().items.some((x) => x.text.includes('7 道食谱降了 2 品, 其中 3 道忘了'))).toBe(true);
    spy.mockRestore();
  });

  it('开课：教师证只列持有的，教不了选中那道菜等级的灰掉并写明（界面改版 P10：原来直接不列）', async () => {
    vi.mocked(endpoints.lessonOpen).mockResolvedValue({ id: 9 });
    vi.mocked(endpoints.lessons).mockResolvedValue({
      ...structuredClone(lessons),
      certs: [...structuredClone(lessons.certs), { ...lessons.certs[0]!, goodsId: 179, num: 0 }],
    });
    const w = mountIt();
    await flushPromises();
    expect(w.get('[data-testid="open-panel"]').text()).toContain('我没开课');
    await w.get('[data-testid="open-lesson-sheet"]').trigger('click');
    expect(w.get('[data-testid="open-lesson"]').attributes('disabled')).toBeDefined();
    // 没有持有的教师证不列
    expect(w.find('[data-testid="open-cert-179"]').exists()).toBe(false);
    // 测试目录里没有道具，名字显示为「道具178」
    expect(w.get('[data-testid="open-cert-178"]').text()).toContain('道具178');
    await w.get('[data-testid="open-mc-1"]').trigger('click');
    expect(w.get('[data-testid="open-mc-1"]').attributes('aria-checked')).toBe('true');
    // 选了 4 级的菜：只能教 1、2 级的教师证灰掉
    expect(w.get('[data-testid="open-cert-177"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="open-cert-177"]').text()).toContain('教不了 4 级');
    expect(w.get('[data-testid="open-cert-178"]').attributes('disabled')).toBeUndefined();
    expect(w.get('[data-testid="open-cert-178"]').text()).toContain('持有 1');
    await w.get('[data-testid="open-cert-178"]').trigger('click');
    expect(w.get('[data-testid="open-lesson"]').attributes('disabled')).toBeUndefined();
    await w.find('[data-testid="open-lesson"]').trigger('click');
    await flushPromises();
    expect(endpoints.lessonOpen).toHaveBeenCalledWith(1, 178);
    // 开完面板关掉
    expect(w.find('[data-testid="open-lesson"]').exists()).toBe(false);
  });

  it('开课选特色菜：没有残卷的灰掉（界面改版 P10）', async () => {
    vi.mocked(endpoints.mc).mockResolvedValue({ ...structuredClone(mc), remnants: [] });
    const w = mountIt();
    await flushPromises();
    await w.get('[data-testid="open-lesson-sheet"]').trigger('click');
    expect(w.get('[data-testid="open-mc-1"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="open-mc-1"]').text()).toContain('持有残卷 0 张');
  });

  it('别人的课一行一门：学、偷学；试过了、满了写小标签（界面改版 P10）', async () => {
    const base = lessons.items[0]!;
    vi.mocked(endpoints.lessons).mockResolvedValue({
      ...structuredClone(lessons),
      items: [base, { ...base, id: 8, tried: true }, { ...base, id: 9, learned: 3, stolen: 2 }],
    });
    const w = mountIt();
    await flushPromises();
    expect(w.get('[data-testid="lesson-7"]').text()).toContain('老师 乙店');
    expect(w.find('[data-testid="learn-7"]').exists()).toBe(true);
    expect(w.find('[data-testid="steal-7"]').exists()).toBe(true);
    expect(w.get('[data-testid="tried-8"]').text()).toBe('试过了');
    expect(w.find('[data-testid="learn-8"]').exists()).toBe(false);
    expect(w.get('[data-testid="full-9"]').text()).toBe('满了');
    expect(w.find('[data-testid="learn-9"]').exists()).toBe(false);
  });

  it('开课选特色菜：按等级从高到低、同级按道排；上面一排按等级筛，换等级时清掉不在这一级的选择（问题记录 475）', async () => {
    useCatalogStore().apply({
      version: 'x',
      goods: [],
      foods: [],
      streets: [],
      weather: [],
      devices: [],
      mysterious: [
        { id: 1, name: '秘·仿膳饽饽', level: 4, road: 2, nutritive: 31, coin: 1, foods: [] },
        { id: 2, name: '秘·开水白菜', level: 2, road: 1, nutritive: 9, coin: 1, foods: [] },
        { id: 3, name: '秘·凤凰展翅', level: 3, road: 1, nutritive: 22, coin: 1, foods: [] },
        { id: 4, name: '秘·佛跳墙', level: 4, road: 1, nutritive: 33, coin: 1, foods: [] },
      ],
    } as never);
    const row = mc.learned[0]!;
    vi.mocked(endpoints.mc).mockResolvedValue({
      learned: [2, 1, 3, 4].map((mcId) => ({ ...row, mcId })),
      remnants: [2, 1, 3, 4].map((mcId) => ({ mcId, num: 1 })),
    } as McOverviewDto);
    const w = mountIt();
    await flushPromises();
    await w.get('[data-testid="open-lesson-sheet"]').trigger('click');
    // 界面改版 P10：原来是下拉框，现在一行一道（名字 + 等级小标签）
    const names = () =>
      w.findAll('[data-testid^="open-mc-"]').map((o) => o.get('.dt-pick-title').text().replace(/\s+/g, ' '));
    expect(names()).toEqual(['秘·佛跳墙 4 级', '秘·仿膳饽饽 4 级', '秘·凤凰展翅 3 级', '秘·开水白菜 2 级']);
    // 只列学过的等级
    expect(w.findAll('[data-testid^="open-lv-"]').map((b) => b.text())).toEqual([
      '全部',
      '4 级',
      '3 级',
      '2 级',
    ]);
    await w.find('[data-testid="open-mc-3"]').trigger('click');
    expect(w.get('[data-testid="open-mc-3"]').attributes('aria-checked')).toBe('true');
    await w.find('[data-testid="open-lv-4"]').trigger('click');
    expect(names()).toEqual(['秘·佛跳墙 4 级', '秘·仿膳饽饽 4 级']);
    // 选的那道不在这一级：选择清掉
    expect(w.findAll('[data-testid^="open-mc-"][aria-checked="true"]')).toHaveLength(0);
    await w.find('[data-testid="open-lv-all"]').trigger('click');
    expect(names()).toHaveLength(4);
    expect(w.get('[data-testid="open-mc-3"]').attributes('aria-checked')).toBe('false');
    expect(w.get('[data-testid="open-lesson"]').attributes('disabled')).toBeDefined();
  });

  it('剩余时间显示到分钟（backlog 6B-2：以前只到小时）', async () => {
    const soon = new Date(Date.now() + 90 * 60_000 + 30_000).toISOString();
    vi.mocked(endpoints.lessons).mockResolvedValue({
      ...structuredClone(lessons),
      items: [{ ...lessons.items[0]!, endsAt: soon }],
    });
    const w = mountIt();
    await flushPromises();
    expect(w.text()).toContain('剩余 1 小时 31 分');
  });
});
