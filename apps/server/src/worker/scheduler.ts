export interface Job {
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
}

export interface JobLogger {
  error(obj: object, msg: string): void;
}

/**
 * 启动时每个任务先跑一次，然后按间隔运行；同一任务不会重叠执行。
 * stop 不再开始新的一次，等正在跑的跑完（最多 waitMs）；等完返回 true，到点还没完返回 false
 * （backlog：原来不等，部署时 10 秒后被强杀，周期任务那一期抢占了却没跑完，之后不会再跑）
 */
export function startScheduler(
  jobs: Job[],
  log: JobLogger,
): { stop: (waitMs: number) => Promise<boolean> } {
  const timers: ReturnType<typeof setInterval>[] = [];
  const inflight = new Set<Promise<void>>();
  let stopped = false;
  for (const job of jobs) {
    let running = false;
    const tick = async () => {
      if (running || stopped) return;
      running = true;
      try {
        await job.run();
      } catch (err) {
        log.error({ err, job: job.name }, 'job failed');
      } finally {
        running = false;
      }
    };
    const start = () => {
      const p = tick();
      inflight.add(p);
      void p.finally(() => inflight.delete(p));
    };
    start();
    timers.push(setInterval(start, job.intervalMs));
  }
  return {
    stop: async (waitMs) => {
      stopped = true;
      timers.forEach((t) => clearInterval(t));
      if (inflight.size === 0) return true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<false>((r) => (timer = setTimeout(() => r(false), waitMs)));
      const done = Promise.allSettled([...inflight]).then(() => true as const);
      const r = await Promise.race([done, timeout]);
      clearTimeout(timer);
      return r;
    },
  };
}
