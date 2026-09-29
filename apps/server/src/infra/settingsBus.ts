import type { Redis } from 'ioredis';
import { createRedis } from './redis';

export const SETTINGS_CHANNEL = 'shard-settings';

export async function publishSettingsChanged(redis: Redis, shardId: number): Promise<void> {
  await redis.publish(SETTINGS_CHANNEL, String(shardId));
}

/** 订阅区服配置变更：每个进程一个订阅连接，收到后清掉本进程的区服配置缓存（设计文档 裁定 11） */
export function subscribeSettings(url: string, onChange: (shardId: number) => void): { close(): void } {
  const sub = createRedis(url);
  sub.on('message', (_channel: string, msg: string) => {
    const id = Number(msg);
    if (Number.isInteger(id)) onChange(id);
  });
  // 进程很快退出（测试里建完就关）时订阅可能还没建立，这时的失败直接忽略
  sub.subscribe(SETTINGS_CHANNEL).catch(() => undefined);
  return { close: () => sub.disconnect() };
}
