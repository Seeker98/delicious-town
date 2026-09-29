import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app';

/** 注册所有业务模块的路由（后续任务逐个加入） */
export function registerModules(_app: FastifyInstance, _deps: AppDeps): void {}
