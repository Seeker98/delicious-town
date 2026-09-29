import type { Kysely } from 'kysely';
import type { DB } from '../../db/schema';

export interface NewsInput {
  shardId: number;
  type: string;
  restId?: number;
  params?: Record<string, unknown>;
}

/** 新闻只存事件类型和参数，文案由前端生成 */
export async function postNews(db: Kysely<DB>, news: NewsInput): Promise<void> {
  await db
    .insertInto('news')
    .values({
      shard_id: news.shardId,
      type: news.type,
      rest_id: news.restId ?? null,
      params: JSON.stringify(news.params ?? {}),
    })
    .execute();
}
