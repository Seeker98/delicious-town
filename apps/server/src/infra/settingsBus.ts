import type { Redis } from 'ioredis';
import { createRedis } from './redis';

export const SETTINGS_CHANNEL = 'shard-settings';

export async function publishSettingsChanged(redis: Redis, shardId: number): Promise<void> {
  await redis.publish(SETTINGS_CHANNEL, String(shardId));
}

export interface WarnLog {
  warn(obj: object, msg: string): void;
}

/**
 * 后台保存后通知其他进程（backlog 148-4）：数据库已经写好，广播失败只记日志、不报错。
 * 以前直接抛出返回 500，管理员以为没存上去重试，会多建一条加成或多存一版。
 * 其他进程的区服设置缓存最多 30 秒过期，广播丢了也只是晚一点生效
 */
export async function notifySettingsChanged(redis: Redis, shardId: number, log?: WarnLog): Promise<void> {
  try {
    await publishSettingsChanged(redis, shardId);
  } catch (err) {
    log?.warn(
      { err, shardId },
      'settings broadcast failed; other processes pick it up when their cache expires',
    );
  }
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
