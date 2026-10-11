import { describe, expect, it } from 'vitest';
import { headBody } from './headBody';

describe('一句话拆成标题和说明（界面改版 P11：更新记录、游玩指引）', () => {
  it('在第一个“: ”处拆开，后面再有冒号算说明的一部分', () => {
    expect(headBody('广场新增小镇发展基金: 存银币 7 天, 到期领回: 九成')).toEqual({
      head: '广场新增小镇发展基金',
      body: '存银币 7 天, 到期领回: 九成',
    });
  });

  it('法文冒号前面的窄空格（\\u202f）和普通空格都去掉', () => {
    expect(headBody('Place\u202f: nouveau fonds')).toEqual({ head: 'Place', body: 'nouveau fonds' });
    expect(headBody('Place : nouveau fonds')).toEqual({ head: 'Place', body: 'nouveau fonds' });
  });

  it('没有冒号：整条当说明，标题为空', () => {
    expect(headBody('修了一些小问题')).toEqual({ head: '', body: '修了一些小问题' });
  });

  it('冒号后面不带空格的不算（比如时间 12:30）', () => {
    expect(headBody('每天 12:30 刷新')).toEqual({ head: '', body: '每天 12:30 刷新' });
  });

  it('冒号在开头（没有标题）或标题太长（超过 60 字）：整条当说明', () => {
    expect(headBody(': 只有说明')).toEqual({ head: '', body: ': 只有说明' });
    const long = `${'长'.repeat(61)}: 说明`;
    expect(headBody(long)).toEqual({ head: '', body: long });
    const ok = `${'长'.repeat(60)}: 说明`;
    expect(headBody(ok).head).toBe('长'.repeat(60));
  });
});
