import type { NeedCheckDto } from '@dt/shared';
import type { Messages } from '../i18n';
import { formatNum } from './format';

/** 条件清单里一项的名字：道具按目录取名，其余按键 */
export function needLabel(c: NeedCheckDto, t: Messages, goodsName: (id: number) => string): string {
  return c.key === 'goods' ? goodsName(c.id ?? 0) : (t.society.needs[c.key] ?? c.key);
}

/** 升星、扩油按钮下面的红字（界面改版 P10）：第一项不够的差多少（“已学食谱还差 2”）；都够了为空 */
export function needReason(checks: NeedCheckDto[], t: Messages, goodsName: (id: number) => string): string {
  const c = checks.find((x) => !x.ok);
  return c ? t.society.up.short(needLabel(c, t, goodsName), formatNum(c.need - c.have)) : '';
}
