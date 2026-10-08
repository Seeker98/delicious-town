import type { QuestDto } from '@dt/shared';
import { formatNum } from './format';

/**
 * 任务名：目录里当前语言的名字（没有时用服务端给的），{n} 代入区服数值（515 支线扩充 B 遗留：
 * 好感 35、邀请 10 / 30 级、持有 200 份原来写死在名字里，区服调了数值就对不上）
 */
export function questTitle(name: string, q: Pick<QuestDto, 'vars'>): string {
  return q.vars ? name.replaceAll('{n}', formatNum(q.vars.n)) : name;
}
