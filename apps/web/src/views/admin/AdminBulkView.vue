<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { AdminBulkFoodDto, AdminBulkLotDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import { matchText } from '../../utils/match';
import { newsTime } from '../../utils/news';

/**
 * 后台“大宗认购”页（大宗认购设计 §3.3）：认购食材清单（全服一份，可从期货同步再微调）、
 * 本区服的批次（带真正的收盘时刻，进行中的可以取消）。起拍价参考按顶部选的区服
 */
const admin = useAdminStore();
const catalog = useCatalogStore();
const toast = useToastStore();
void catalog.load();
const rows = ref<AdminBulkFoodDto[]>([]);
const lots = ref<AdminBulkLotDto[]>([]);
const err = ref('');
const busy = ref(false);
const level = ref('');
const kind = ref<'' | 'rare' | 'normal'>('');
const state = ref<'' | 'on' | 'off' | 'out'>('');
const q = ref('');
const checked = ref(new Set<number>());

async function load() {
  if (!admin.shardId) return;
  try {
    [rows.value, lots.value] = await Promise.all([
      adminApi.bulkFoods(admin.shardId),
      adminApi.bulkLots(admin.shardId),
    ]);
    err.value = '';
  } catch (e) {
    err.value = errorMessage(e, '读取大宗认购失败');
  }
}
watch(() => admin.shardId, load, { immediate: true });

const shown = computed(() =>
  rows.value.filter((r) => {
    if (level.value && r.level !== Number(level.value)) return false;
    if (kind.value === 'rare' && !r.rare) return false;
    if (kind.value === 'normal' && r.rare) return false;
    if (state.value === 'on' && !(r.inList && r.enabled)) return false;
    if (state.value === 'off' && !(r.inList && !r.enabled)) return false;
    if (state.value === 'out' && r.inList) return false;
    return matchText(catalog.foodName(r.foodsId), q.value.trim()) || String(r.foodsId) === q.value.trim();
  }),
);

function check(id: number, on: boolean) {
  const s = new Set(checked.value);
  if (on) s.add(id);
  else s.delete(id);
  checked.value = s;
}
const checkAll = () => (checked.value = new Set(shown.value.map((r) => r.foodsId)));

async function act(fn: () => Promise<unknown>, done: string) {
  busy.value = true;
  try {
    await fn();
    toast.push(done);
    checked.value = new Set();
    await load();
  } catch (e) {
    err.value = errorMessage(e, '操作失败');
  } finally {
    busy.value = false;
  }
}
const setEnabled = (enabled: boolean) =>
  act(
    () =>
      adminApi.updateBulkFoods(
        rows.value.filter((r) => checked.value.has(r.foodsId)).map((r) => ({ foodsId: r.foodsId, enabled })),
      ),
    enabled ? '已启用' : '已停用',
  );
function sync() {
  if (
    !window.confirm(
      '按期货清单同步: 期货启用的在这里启用 (不在清单里的加进来), 期货停用的在这里停用。确定吗？',
    )
  )
    return;
  return act(() => adminApi.syncBulkFoods(), '已从期货同步');
}
function cancel(l: AdminBulkLotDto) {
  if (!window.confirm(`取消这一批 (${catalog.foodName(l.foodsId)})？所有出价全额退回。`)) return;
  return act(() => adminApi.cancelBulkLot(l.id), '已取消，冻结的银币会退回');
}
const status = (r: AdminBulkFoodDto) => (!r.inList ? '不在清单' : r.enabled ? '启用' : '停用');
const futures = (r: AdminBulkFoodDto) =>
  r.futuresEnabled === null ? '—' : r.futuresEnabled ? '启用' : '停用';
const LOT_STATUS: Record<AdminBulkLotDto['status'], string> = {
  open: '进行中',
  settled: '已成交',
  failed: '流拍',
  cancelled: '已取消',
};
</script>

<template>
  <h5>大宗认购</h5>
  <p class="small text-muted">
    认购食材清单（全服一份）：每天开批时从启用的里抽。可以先“从期货同步”，再单独启用、停用。起拍价参考按顶部选的区服今天的参考价算。
  </p>
  <div v-if="err" class="text-danger small mb-2">{{ err }}</div>
  <div class="d-flex flex-wrap gap-1 mb-2 small">
    <select v-model="level" class="form-select form-select-sm w-auto" data-testid="ab-level">
      <option value="">全部等级</option>
      <option v-for="n in 5" :key="n" :value="String(n)">{{ n }} 级</option>
    </select>
    <select v-model="kind" class="form-select form-select-sm w-auto" data-testid="ab-kind">
      <option value="">稀有和普通</option>
      <option value="rare">稀有</option>
      <option value="normal">普通</option>
    </select>
    <select v-model="state" class="form-select form-select-sm w-auto" data-testid="ab-state">
      <option value="">全部状态</option>
      <option value="on">启用</option>
      <option value="off">停用</option>
      <option value="out">不在清单</option>
    </select>
    <input
      v-model="q"
      class="form-control form-control-sm w-auto"
      placeholder="名字或编号"
      data-testid="ab-q"
    />
  </div>
  <div v-if="admin.isAdmin" class="d-flex flex-wrap gap-1 align-items-center mb-2 small">
    <button
      type="button"
      class="btn btn-sm btn-outline-primary"
      :disabled="busy"
      data-testid="ab-sync"
      @click="sync"
    >
      从期货同步
    </button>
    <button type="button" class="btn btn-sm btn-outline-secondary" data-testid="ab-all" @click="checkAll">
      全选当前筛选结果 ({{ shown.length }})
    </button>
    <span class="dt-meta">已选 {{ checked.size }}</span>
    <button
      type="button"
      class="btn btn-sm btn-primary"
      :disabled="busy || checked.size === 0"
      data-testid="ab-batch-enable"
      @click="setEnabled(true)"
    >
      启用
    </button>
    <button
      type="button"
      class="btn btn-sm btn-outline-danger"
      :disabled="busy || checked.size === 0"
      data-testid="ab-batch-disable"
      @click="setEnabled(false)"
    >
      停用
    </button>
  </div>
  <div class="table-responsive" style="max-height: 24rem; overflow-y: auto">
    <table class="table table-sm small align-middle">
      <thead>
        <tr>
          <th v-if="admin.isAdmin"></th>
          <th>编号</th>
          <th>名字</th>
          <th>等级</th>
          <th>稀有</th>
          <th>状态</th>
          <th>期货</th>
          <th>起拍价参考</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in shown" :key="r.foodsId" :data-testid="`ab-food-${r.foodsId}`">
          <td v-if="admin.isAdmin">
            <input
              type="checkbox"
              :checked="checked.has(r.foodsId)"
              :data-testid="`ab-check-${r.foodsId}`"
              @change="check(r.foodsId, ($event.target as HTMLInputElement).checked)"
            />
          </td>
          <td>{{ r.foodsId }}</td>
          <td>{{ catalog.foodName(r.foodsId) }}</td>
          <td>{{ r.level }}</td>
          <td>{{ r.rare ? '稀有' : '普通' }}</td>
          <td :class="{ 'text-muted': !r.enabled }">{{ status(r) }}</td>
          <td class="text-muted">{{ futures(r) }}</td>
          <td>{{ formatNum(r.reserve) }}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <h6 class="dt-section">本区服的批次</h6>
  <div v-if="lots.length === 0" class="small text-muted">还没有批次</div>
  <div class="table-responsive">
    <table v-if="lots.length > 0" class="table table-sm small align-middle">
      <thead>
        <tr>
          <th>开批日</th>
          <th>食材</th>
          <th>份数</th>
          <th>起拍价</th>
          <th>真正收盘</th>
          <th>出价人数</th>
          <th>认购份数</th>
          <th>状态</th>
          <th>成交</th>
          <th v-if="admin.isAdmin"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="l in lots" :key="l.id" :data-testid="`ab-lot-${l.id}`">
          <td>{{ l.day }}</td>
          <td>{{ catalog.foodName(l.foodsId) }} ({{ l.level }} 级)</td>
          <td>{{ l.qty }}</td>
          <td>{{ formatNum(l.reserve) }}</td>
          <td>{{ newsTime(l.closeAt) }}</td>
          <td>{{ l.bidders }}</td>
          <td>{{ l.demand }}</td>
          <td>{{ LOT_STATUS[l.status] }}</td>
          <td>{{ l.price === null ? '—' : `${formatNum(l.price)} × ${l.sold ?? 0}` }}</td>
          <td v-if="admin.isAdmin">
            <button
              v-if="l.status === 'open'"
              type="button"
              class="btn btn-sm btn-outline-danger"
              :disabled="busy"
              :data-testid="`ab-cancel-${l.id}`"
              @click="cancel(l)"
            >
              取消
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
