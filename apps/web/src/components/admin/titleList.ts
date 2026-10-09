import { ref } from 'vue';
import type { AdminTitleDto } from '@dt/shared';
import { adminApi } from '../../api/admin';

/** 后台各处选称号共用的列表（定制称号设计 三）：一页里几个选择框只读一次，新建后补进去 */
const list = ref<AdminTitleDto[]>([]);
let loading: Promise<void> | null = null;

export function useTitleList() {
  return {
    list,
    load(force = false): Promise<void> {
      if (!loading || force)
        loading = Promise.resolve()
          .then(() => adminApi.titles())
          .then((r) => {
            list.value = r;
          });
      return loading;
    },
    add(t: AdminTitleDto) {
      list.value = [t, ...list.value.filter((x) => x.key !== t.key)];
    },
  };
}

/** 测试用：清掉缓存 */
export function resetTitleList() {
  list.value = [];
  loading = null;
}
