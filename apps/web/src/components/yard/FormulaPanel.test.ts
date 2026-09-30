import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { endpoints } from '../../api/endpoints';
import FormulaPanel from './FormulaPanel.vue';
import { formulaData, formulasData } from './testData';

vi.mock('../../api/endpoints', () => ({
  endpoints: {
    formulas: vi.fn(),
    formulaAppraise: vi.fn(),
    formulaLearn: vi.fn(),
    formulaDecompose: vi.fn(),
    formulaCompose: vi.fn(),
  },
}));

describe('FormulaPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(endpoints.formulas).mockResolvedValue(formulasData());
    vi.mocked(endpoints.formulaAppraise).mockResolvedValue({
      results: [{ ok: true, formulaId: 1, part: 'sub', upgraded: false }, { ok: false }],
    });
    vi.mocked(endpoints.formulaLearn).mockResolvedValue({ formulaId: 1 });
    vi.mocked(endpoints.formulaDecompose).mockResolvedValue({ essence: 3 });
    vi.mocked(endpoints.formulaCompose).mockResolvedValue({ foodsId: 447, num: 3, extra: 1 });
  });

  it('鉴定：次数不超过 道具、玄奥配方、99 取小；显示每次结果', async () => {
    const w = mount(FormulaPanel);
    await flushPromises();
    await w.find('[data-testid="appraise-times"]').setValue('9');
    await w.find('[data-testid="appraise-go"]').trigger('click');
    await flushPromises();
    expect(endpoints.formulaAppraise).toHaveBeenCalledWith(164, 3);
    const text = w.find('[data-testid="appraise-results"]').text();
    expect(text).toContain('牡丹籽油配方 辅碎片');
    expect(text).toContain('失败');
  });

  it('没有玄奥配方时灰掉并写明原因', async () => {
    vi.mocked(endpoints.formulas).mockResolvedValue(formulasData({ scrolls: 0 }));
    const w = mount(FormulaPanel);
    await flushPromises();
    expect(w.find('[data-testid="appraise-go"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="appraise-block"]').text()).toContain('玄奥配方');
  });

  it('只列有碎片或已学的配方；主辅各 1 可以学习；分解主碎片', async () => {
    const w = mount(FormulaPanel);
    await flushPromises();
    expect(w.find('[data-testid="formula-1"]').exists()).toBe(true);
    expect(w.find('[data-testid="formula-2"]').exists()).toBe(false);
    await w.find('[data-testid="learn-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.formulaLearn).toHaveBeenCalledWith(1);
    await w.find('[data-testid="decompose-main-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.formulaDecompose).toHaveBeenCalledWith(1, 'main', 1);
  });

  it('已学：合成份数不超过最多能合成的份数；原料不够时写明缺什么', async () => {
    vi.mocked(endpoints.formulas).mockResolvedValue(
      formulasData({
        formulas: [
          formulaData({
            learned: true,
            mainNum: 0,
            subNum: 0,
            have: { main: 5, sub: 2, add: 4 },
            maxCompose: 2,
          }),
          formulaData({ id: 2, name: '三文鱼配方', learned: true, have: { main: 0, sub: 3, add: 3 } }),
        ],
      }),
    );
    const w = mount(FormulaPanel);
    await flushPromises();
    await w.find('[data-testid="compose-num-1"]').setValue('9');
    await w.find('[data-testid="compose-1"]').trigger('click');
    await flushPromises();
    expect(endpoints.formulaCompose).toHaveBeenCalledWith(1, 2);
    expect(w.find('[data-testid="compose-2"]').attributes('disabled')).toBeDefined();
    expect(w.find('[data-testid="compose-block-2"]').text()).toContain('菜篮里没有');
  });
});
