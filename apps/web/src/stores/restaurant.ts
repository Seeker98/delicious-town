import { defineStore } from 'pinia';
import type { RestaurantDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';

export const useRestaurantStore = defineStore('restaurant', {
  state: () => ({
    rest: null as RestaurantDto | null,
    /**
     * 食谱页搬街提示用的下一星要求（backlog 384 审查）：按“店 id:当前星级”记住，离开食谱页再回来不重读；
     * 升星后星级变了才重读。value 为 null 表示下一星不用学菜或已满星
     */
    starNeed: null as { key: string; value: { star: number; need: number } | null } | null,
  }),
  getters: {
    /** 本区服这个功能是否开着；还没读到餐厅时当作开着（问题记录 248） */
    featureOn: (s) => (name: string) => !(s.rest?.disabledFeatures ?? []).includes(name),
  },
  actions: {
    /**
     * 进页面时读：已经有一个请求在读就用它的结果，不再发一个（直接打开首页时顶栏和首页各读一次，backlog P2a）。
     * 操作完要最新数据的用 refresh：在读的请求可能是操作之前发出的
     */
    load(): Promise<RestaurantDto> {
      return inflight.get(this) ?? this.refresh();
    },
    refresh(): Promise<RestaurantDto> {
      const p = (async () => (this.rest = await endpoints.overview()))().finally(() => inflight.delete(this));
      inflight.set(this, p);
      return p;
    },
  },
});

/** 正在读的请求按 store 实例记（不放模块级变量：测试里每条用例新建 pinia，上一条没读完的请求不能挂到下一条上） */
const inflight = new WeakMap<object, Promise<RestaurantDto>>();
