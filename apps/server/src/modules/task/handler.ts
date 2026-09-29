import { sql } from 'kysely';
import type { GameConfig } from '@dt/config';
import { gameDay } from '@dt/shared';
import type { EventBus } from '../../events/bus';
import { incrementDaily } from '../counter/dailyCounter';

interface ActionPayload {
  key: string;
  n: number;
  star: number;
  at: string;
}

/** 玩家行为 → 全历史计数（任务）+ 当日活跃（设计文档 §5.1） */
/** 已经注册过任务处理器的事件总线：同一个总线上多次 createGame 也只注册一次，避免计数翻倍 */
const registered = new WeakSet<EventBus>();

export function registerTaskHandlers(bus: EventBus, config: GameConfig): void {
  if (registered.has(bus)) return;
  registered.add(bus);
  bus.on('action', async (tx, e) => {
    const p = e.payload as unknown as ActionPayload;
    await tx
      .insertInto('event_counter')
      .values({ rest_id: e.restId, key: p.key, count: p.n })
      .onConflict((oc) =>
        oc.columns(['rest_id', 'key']).doUpdateSet({ count: sql<number>`event_counter.count + ${p.n}` }),
      )
      .execute();
    const name = config.bundle.actionMap.activation[p.key];
    if (!name) return;
    const act = config.activationByName.get(name);
    if (!act || p.star < act.needStar) return;
    await incrementDaily(tx, e.restId, `act:${act.id}`, p.n, gameDay(new Date(p.at)));
  });
}
