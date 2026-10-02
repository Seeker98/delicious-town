import type { Kysely } from 'kysely';
import type { GameEvent } from '@dt/shared';
import type { DB } from '../db/schema';

export interface DomainEvent {
  name: string;
  shardId: number;
  restId: number;
  payload?: Record<string, unknown>;
  /** 发出事件的那次操作的得失提示；处理函数可以往里追加（问题记录 224） */
  events?: GameEvent[];
}

export type EventHandler = (tx: Kysely<DB>, event: DomainEvent) => Promise<void>;

/** 进程内事件总线：在业务所在的同一事务里同步执行处理函数，任何一个失败则整体回滚 */
export class EventBus {
  private readonly handlers = new Map<string, EventHandler[]>();

  on(name: string, handler: EventHandler): void {
    const list = this.handlers.get(name) ?? [];
    list.push(handler);
    this.handlers.set(name, list);
  }

  async emit(tx: Kysely<DB>, event: DomainEvent): Promise<void> {
    const list = [...(this.handlers.get(event.name) ?? []), ...(this.handlers.get('*') ?? [])];
    for (const handler of list) await handler(tx, event);
  }
}
