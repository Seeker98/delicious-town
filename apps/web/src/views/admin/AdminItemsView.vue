<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { AdminItemRow, AdminItemsDto, AdminItemTag } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useToastStore } from '../../stores/toast';

/**
 * 道具整理（问题记录 429，只读）：每个道具、食材从哪来、拿来干什么、是否已下架。
 * 和本地道具整理工具同一份分析；下架、恢复仍在本机用工具改名单再发版（用户 2026-10-06 定）
 */
type Filter = 'all' | 'noSource' | 'noUse' | 'retired' | 'code' | 'notes';
const FILTERS: Array<[Filter, string]> = [
  ['all', '全部'],
  ['noSource', '没有来源'],
  ['noUse', '没有用途'],
  ['retired', '已下架'],
  ['code', '代码里用到'],
  ['notes', '有条件说明'],
];
/** 一次最多列多少项：全部道具上千条，多了手机上卡 */
const SHOW_MAX = 200;

const toast = useToastStore();
const data = ref<AdminItemsDto | null>(null);
const kind = ref<'goods' | 'foods'>('goods');
const filter = ref<Filter>('all');
const q = ref('');

onMounted(async () => {
  try {
    data.value = await adminApi.items();
  } catch (e) {
    toast.push(errorMessage(e, '读取道具整理失败'), 'danger');
  }
});

const pass = (x: AdminItemRow): boolean => {
  switch (filter.value) {
    case 'noSource':
      return x.noSource;
    case 'noUse':
      return x.noUse;
    case 'retired':
      return x.retired;
    case 'code':
      return x.code;
    case 'notes':
      return x.notes.length > 0;
    default:
      return true;
  }
};
const matched = computed(() => {
  const s = q.value.trim();
  return (data.value?.rows ?? []).filter(
    (x) => x.kind === kind.value && pass(x) && (s === '' || x.name.includes(s) || String(x.id) === s),
  );
});
const shown = computed(() => matched.value.slice(0, SHOW_MAX));
const tagText = (t: AdminItemTag) =>
  `${t.where}${t.n > 1 ? `×${t.n}` : ''}${t.retired ? '（已下架）' : ''}${t.dead ? '（拿不到）' : ''}`;
const tags = (list: AdminItemTag[]) => (list.length === 0 ? '—' : list.map(tagText).join('、'));
</script>

<template>
  <h5>道具整理</h5>
  <p class="small text-muted">
    只读，按线上正在用的配置算。要下架或恢复：在本机运行 <code>pnpm -F @dt/server items</code>，勾选后保存，再
    <code>pnpm -F @dt/config build</code>、提交 <code>retired.json</code>、发版（见
    docs/data-maintenance.md）。
    已下架的道具在配置里去掉了奖励档位、不在商店卖，所以这里看到的是下架以后的来源。
  </p>
  <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
    <div class="btn-group btn-group-sm">
      <button
        v-for="k in ['goods', 'foods'] as const"
        :key="k"
        type="button"
        :class="['btn', kind === k ? 'btn-primary' : 'btn-outline-primary']"
        :data-testid="`items-kind-${k}`"
        @click="kind = k"
      >
        {{ k === 'goods' ? '道具' : '食材' }}
      </button>
    </div>
    <select v-model="filter" class="form-select form-select-sm w-auto" data-testid="items-filter">
      <option v-for="[f, label] in FILTERS" :key="f" :value="f">{{ label }}</option>
    </select>
    <input
      v-model="q"
      class="form-control form-control-sm w-auto"
      placeholder="名字或编号"
      data-testid="items-search"
    />
    <span v-if="data" class="small text-muted">共 {{ matched.length }} 项</span>
  </div>
  <div v-if="!data" class="dt-empty">加载中…</div>
  <template v-else>
    <div v-if="matched.length === 0" class="dt-empty">没有符合的</div>
    <div
      v-for="x in shown"
      :key="`${x.kind}-${x.id}`"
      class="border-bottom py-1 small"
      :data-testid="`item-${x.kind}-${x.id}`"
    >
      <div class="d-flex flex-wrap gap-1 align-items-center">
        <b>{{ x.name }}</b>
        <span class="text-muted">#{{ x.id }} · {{ x.category }}</span>
        <span v-if="x.retired" class="badge text-bg-secondary">已下架</span>
        <span v-if="x.noSource" class="badge text-bg-danger">没有来源</span>
        <span v-if="x.noUse" class="badge text-bg-warning">没有用途</span>
        <span v-if="x.code" class="badge text-bg-info">代码里用到</span>
      </div>
      <div><span class="text-muted">来源：</span>{{ tags(x.gives) }}</div>
      <div><span class="text-muted">用途：</span>{{ tags(x.uses) }}</div>
      <div v-for="n in x.notes" :key="n" class="text-muted">· {{ n }}</div>
    </div>
    <div v-if="matched.length > shown.length" class="small text-muted mt-2">
      只列了前 {{ SHOW_MAX }} 项，还有 {{ matched.length - shown.length }} 项，用搜索或筛选缩小范围
    </div>
    <details class="mt-3 small">
      <summary>食谱各品级要的食材（默认数值的品级上限 {{ data.maxGrade }}）</summary>
      <table class="table table-sm mt-1">
        <thead>
          <tr>
            <th>品级</th>
            <th>食材等级 → 种次</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="g in data.grades" :key="g.grade" :class="{ 'text-muted': !g.open }">
            <td>{{ g.name }}</td>
            <td>
              {{
                Object.entries(g.foodLevels)
                  .map(([lv, n]) => `${lv} 级 ${n}`)
                  .join('、')
              }}
            </td>
          </tr>
        </tbody>
      </table>
    </details>
  </template>
</template>
