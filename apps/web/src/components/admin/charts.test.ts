import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import BarChart from './BarChart.vue';
import LineChart from './LineChart.vue';

describe('图表', () => {
  it('折线图：每个系列一条线，带图例', () => {
    const w = mount(LineChart, {
      props: {
        labels: ['09-01', '09-02', '09-03'],
        series: [
          { name: '签到', values: [1, 2, 3] },
          { name: '结算', values: [5, -1, 0] },
        ],
      },
    });
    expect(w.findAll('[data-testid="series"]')).toHaveLength(2);
    expect(w.text()).toContain('签到');
  });

  it('柱状图：每项一根柱子', () => {
    const w = mount(BarChart, {
      props: {
        bars: [
          { label: '1-9', value: 3 },
          { label: '10-19', value: 0 },
          { label: '20-29', value: 1 },
        ],
      },
    });
    expect(w.findAll('[data-testid="bar"]')).toHaveLength(3);
  });
});
