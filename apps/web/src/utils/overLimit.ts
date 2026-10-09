import {
  computed,
  inject,
  onUnmounted,
  provide,
  reactive,
  watch,
  type ComputedRef,
  type InjectionKey,
  type Ref,
} from 'vue';

/**
 * 奖励编辑器超过上限的登记处（backlog：活动的奖励编辑器嵌在好几层里，超量时只显示红字、照样能保存）。
 * 外层页面 provide，里面每个奖励编辑器登记自己超没超，页面据此禁止保存
 */
const KEY: InjectionKey<Map<symbol, boolean>> = Symbol('overLimit');

/** 页面用：返回“有没有哪份奖励超量” */
export function provideOverLimit(): ComputedRef<boolean> {
  const reg = reactive(new Map<symbol, boolean>());
  provide(KEY, reg);
  return computed(() => [...reg.values()].some(Boolean));
}

/** 奖励编辑器用：外面没有登记处时什么也不做 */
export function reportOverLimit(over: Ref<readonly string[]>): void {
  const reg = inject(KEY, null);
  if (!reg) return;
  const id = Symbol('editor');
  watch(over, (v) => reg.set(id, v.length > 0), { immediate: true });
  onUnmounted(() => reg.delete(id));
}
