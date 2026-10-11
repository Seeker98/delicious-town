import { defineStore } from 'pinia';

export interface ConfirmRequest {
  title: string;
  body?: string;
  /** 确认按钮的字，不写用“确定” */
  ok?: string;
  /** 危险操作（分解、出售、删除）：确认按钮红色描边 */
  danger?: boolean;
}

let seq = 0;
/** 当前确认的回答：放在 store 外面，不进响应式状态 */
let pending: ((yes: boolean) => void) | null = null;

/**
 * 确认（界面改版设计 §5 第 7 条）：底部确认面板取代浏览器确认框，页面里写 `if (!(await ask({...}))) return`。
 * 面板 `DtConfirmHost` 在 App 里挂一次；单独挂页面的测试里没有它，就退回浏览器确认框（原来模拟 window.confirm 的测试照常用）
 */
export const useConfirmStore = defineStore('confirm', {
  state: () => ({
    /** 挂着的确认面板个数 */
    hosts: 0,
    current: null as (ConfirmRequest & { id: number }) | null,
  }),
  actions: {
    ask(req: ConfirmRequest): Promise<boolean> {
      if (this.hosts === 0)
        return Promise.resolve(window.confirm(req.body ? `${req.title}\n${req.body}` : req.title));
      // 前一个还开着又要确认另一个：前一个按取消结束（Review Focus 1）
      pending?.(false);
      this.current = { ...req, id: ++seq };
      return new Promise((resolve) => {
        pending = resolve;
      });
    },
    answer(yes: boolean) {
      const r = pending;
      pending = null;
      this.current = null;
      r?.(yes);
    },
  },
});
