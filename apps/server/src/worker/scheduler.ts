export interface Job {
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
}

export interface JobLogger {
  error(obj: object, msg: string): void;
}

/** 启动时每个任务先跑一次，然后按间隔运行；同一任务不会重叠执行 */
export function startScheduler(jobs: Job[], log: JobLogger): { stop: () => void } {
  const timers: ReturnType<typeof setInterval>[] = [];
  for (const job of jobs) {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        await job.run();
      } catch (err) {
        log.error({ err, job: job.name }, 'job failed');
      } finally {
        running = false;
      }
    };
    void tick();
    timers.push(setInterval(() => void tick(), job.intervalMs));
  }
  return { stop: () => timers.forEach((t) => clearInterval(t)) };
}
