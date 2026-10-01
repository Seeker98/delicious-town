import { parentPort, workerData } from 'node:worker_threads';
import { loadGameConfig } from '@dt/config';
import { runFast } from './run';
import type { WorkerInput, WorkerMessage } from './variants';

/** 一套数值一个线程（设计 §6）：自己加载配置、跑完把结果发回主线程 */
const input = workerData as WorkerInput;
const config = loadGameConfig(input.bundlePath);
const post = (m: WorkerMessage) => parentPort!.postMessage(m);
const result = runFast(
  input.name,
  { ...input.options, start: new Date(input.options.start) },
  config,
  (day) => post({ kind: 'progress', name: input.name, day }),
);
post({ kind: 'done', result });
