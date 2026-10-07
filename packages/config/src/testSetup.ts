import { afterEach } from 'vitest';

/**
 * 每条测试后让出一次事件循环（CI 偶发 Timeout calling "onTaskUpdate"）：配置测试几乎都是同步构建，
 * 一个文件连着跑时测试进程一直腾不出空处理和主进程的通信，build.test.ts 整个文件超过 60 秒就报超时
 */
afterEach(() => new Promise<void>((resolve) => setImmediate(resolve)));
