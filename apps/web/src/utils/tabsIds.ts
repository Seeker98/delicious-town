/**
 * DtTabs 和 DtTabPanel 共用的 id（backlog：读屏的 tab ↔ tabpanel 对应）。
 * 两个在页面里是兄弟节点，provide 不通，所以都按同一个前缀拼 id；每页只有一个标签栏，用默认前缀就行，
 * 同一屏要放两个标签栏时两边传同一个 idPrefix。
 * 标签栏只有一个标签时不显示，这时面板不该再标 tabpanel（aria-labelledby 会指向不存在的元素），
 * 所以 DtTabs 显示时在这里登记，DtTabPanel 按登记决定要不要加 role 和 aria 属性
 */
import { reactive } from 'vue';

export const DT_TABS_ID_PREFIX = 'dt-tabs';

export const dtTabId = (prefix: string, key: string) => `${prefix}-tab-${key}`;
export const dtPanelId = (prefix: string, key: string) => `${prefix}-panel-${key}`;

/** 计数而不是布尔：换页时新页面的标签栏先挂载、旧的后卸载，同一前缀会短暂有两个 */
const shown = reactive<Record<string, number>>({});

export function holdTabs(prefix: string) {
  shown[prefix] = (shown[prefix] ?? 0) + 1;
}

export function releaseTabs(prefix: string) {
  const n = (shown[prefix] ?? 0) - 1;
  if (n > 0) shown[prefix] = n;
  else delete shown[prefix];
}

export const tabsShown = (prefix: string) => (shown[prefix] ?? 0) > 0;
