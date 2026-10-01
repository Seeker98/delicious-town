import { GOODS } from '@dt/config';
import { emitAction } from '../../core/action';
import { invalidState, requirement } from '../../core/errors';
import { opNews, type Op } from '../../core/op';
import { consumeGoods } from '../store/goods';
import { assertVerified, cooldownError, setTownRest, townRest } from './common';

/** 广播（设计文档 §3.2）：检查顺序 内容 → 星级 → 邮箱 → 冷却 → 喇叭 */
export async function broadcast(o: Op, raw: string): Promise<{ text: string }> {
  const t = o.tuning.town.broadcast;
  const text = raw.trim();
  if (text.length === 0 || [...text].length > t.maxLen)
    throw invalidState('broadcast_text', { max: t.maxLen });
  if (o.rest.star_level < t.minStar) throw requirement('star', { need: t.minStar });
  await assertVerified(o);
  const tr = await townRest(o);
  if (tr.broadcast_at) {
    const until = new Date(tr.broadcast_at.getTime() + t.cooldownSec * 1000);
    if (until > o.now) throw cooldownError('broadcast', until, o.now);
  }
  await consumeGoods(o, GOODS.horn, 1);
  await setTownRest(o, { broadcast_at: o.now });
  opNews(o, 'town.broadcast', { text });
  await emitAction(o, 'broadcast');
  return { text };
}
