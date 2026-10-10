<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { AdminFuturesFoodDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import { matchText } from '../../utils/match';

/**
 * 后台“期货食材”页（期货设计 §5.3）：全服一份列表，勾选上架、下架，单独设额度；
 * 价格、今天已订份数按顶部选的区服。改动马上生效，写审计
 */
const admin = useAdminStore();
const catalog = useCatalogStore();
const toast = useToastStore();
void catalog.load();
const rows = ref<AdminFuturesFoodDto[]>([]);
const err = ref('');
const busy = ref(false);
const level = ref('');
const kind = ref<'' | 'rare' | 'normal'>('');
const state = ref<'' | 'on' | 'off' | 'out'>('');
const street = ref('');
const q = ref('');
const checked = ref(new Set<number>());
/** 单行改额度的输入框（空 = 恢复默认） */
const quotaInput = ref(new Map<number, string>());

async function load() {
  if (!admin.shardId) return;
  try {
    rows.value = await adminApi.futuresFoods(admin.shardId);
    quotaInput.value = new Map(
      rows.value.map((r) => [r.foodsId, r.dailyQuota === null ? '' : String(r.dailyQuota)]),
    );
    err.value = '';
  } catch (e) {
    err.value = errorMessage(e, '读取期货食材失败');
  }
}
watch(() => admin.shardId, load, { immediate: true });

const streets = computed(() => [...new Set(rows.value.flatMap((r) => r.streets))].sort((a, b) => a - b));
const shown = computed(() =>
  rows.value.filter((r) => {
    if (level.value && r.level !== Number(level.value)) return false;
    if (kind.value === 'rare' && !r.rare) return false;
    if (kind.value === 'normal' && r.rare) return false;
    if (state.value === 'on' && !(r.inList && r.enabled)) return false;
    if (state.value === 'off' && !(r.inList && !r.enabled)) return false;
    if (state.value === 'out' && r.inList) return false;
    if (street.value !== '' && !r.streets.includes(Number(street.value))) return false;
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

async function save(items: Parameters<typeof adminApi.updateFuturesFoods>[0], done: string) {
  busy.value = true;
  try {
    await adminApi.updateFuturesFoods(items);
    toast.push(done);
    checked.value = new Set();
    await load();
  } catch (e) {
    err.value = errorMessage(e, '保存失败');
  } finally {
    busy.value = false;
  }
}
const setEnabled = (enabled: boolean) =>
  save(
    rows.value.filter((r) => checked.value.has(r.foodsId)).map((r) => ({ foodsId: r.foodsId, enabled })),
    enabled ? '已上架' : '已下架',
  );
function saveQuota(r: AdminFuturesFoodDto) {
  const v = (quotaInput.value.get(r.foodsId) ?? '').trim();
  const n = v === '' ? null : Math.max(0, Math.floor(Number(v) || 0));
  return save([{ foodsId: r.foodsId, dailyQuota: n }], n === null ? '已恢复默认额度' : '已改额度');
}
const status = (r: AdminFuturesFoodDto) => (!r.inList ? '不在表里' : r.enabled ? '上架' : '下架');
</script>

<template>
  <h5>期货食材</h5>
  <p class="small text-muted">
    玩家在交易所“期货”标签能订的食材（全服一份）。勾选后一键上架、下架；额度是这种食材全区服每天一共能订几份，
    不填按等级默认。价格和今天已订份数按顶部选的区服显示。已经下的单不受影响。
  </p>
  <div v-if="err" class="text-danger small mb-2">{{ err }}</div>
  <div class="d-flex flex-wrap gap-1 mb-2 small">
    <select v-model="level" class="form-select form-select-sm w-auto" data-testid="fut-level">
      <option value="">全部等级</option>
      <option v-for="n in 5" :key="n" :value="String(n)">{{ n }} 级</option>
    </select>
    <select v-model="kind" class="form-select form-select-sm w-auto" data-testid="fut-kind">
      <option value="">稀有和普通</option>
      <option value="rare">稀有</option>
      <option value="normal">普通</option>
    </select>
    <select v-model="state" class="form-select form-select-sm w-auto" data-testid="fut-state">
      <option value="">全部状态</option>
      <option value="on">上架</option>
      <option value="off">下架</option>
      <option value="out">不在表里</option>
    </select>
    <select v-model="street" class="form-select form-select-sm w-auto" data-testid="fut-street">
      <option value="">全部街道</option>
      <option v-for="s in streets" :key="s" :value="String(s)">
        {{ catalog.streetName(s, `街道 ${s}`) }}
      </option>
    </select>
    <input
      v-model="q"
      class="form-control form-control-sm w-auto"
      placeholder="名字或编号"
      data-testid="fut-q"
    />
  </div>
  <div v-if="admin.isAdmin" class="d-flex flex-wrap gap-1 align-items-center mb-2 small">
    <button type="button" class="btn btn-sm btn-outline-secondary" data-testid="fut-all" @click="checkAll">
      全选当前筛选结果 ({{ shown.length }})
    </button>
    <span class="dt-meta">已选 {{ checked.size }}</span>
    <button
      type="button"
      class="btn btn-sm btn-primary"
      :disabled="busy || checked.size === 0"
      data-testid="fut-on"
      @click="setEnabled(true)"
    >
      上架
    </button>
    <button
      type="button"
      class="btn btn-sm btn-outline-danger"
      :disabled="busy || checked.size === 0"
      data-testid="fut-off"
      @click="setEnabled(false)"
    >
      下架
    </button>
  </div>
  <div class="table-responsive">
    <table class="table table-sm small align-middle">
      <thead>
        <tr>
          <th v-if="admin.isAdmin"></th>
          <th>编号</th>
          <th>名字</th>
          <th>等级</th>
          <th>稀有</th>
          <th>状态</th>
          <th>街道数</th>
          <th>参考价</th>
          <th>等级价</th>
          <th>期货价</th>
          <th>额度</th>
          <th>今天已订</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in shown" :key="r.foodsId" :data-testid="`fut-row-${r.foodsId}`">
          <td v-if="admin.isAdmin">
            <input
              type="checkbox"
              :checked="checked.has(r.foodsId)"
              :data-testid="`fut-check-${r.foodsId}`"
              @change="check(r.foodsId, ($event.target as HTMLInputElement).checked)"
            />
          </td>
          <td>{{ r.foodsId }}</td>
          <td>{{ catalog.foodName(r.foodsId) }}</td>
          <td>{{ r.level }}</td>
          <td>{{ r.rare ? '稀有' : '普通' }}</td>
          <td :class="{ 'text-muted': !r.enabled }">{{ status(r) }}</td>
          <td
            :data-testid="`fut-streets-${r.foodsId}`"
            :title="r.streets.map((s) => catalog.streetName(s, String(s))).join('、')"
          >
            {{ r.streets.length }}
          </td>
          <td>{{ formatNum(r.ref) }}</td>
          <td>{{ formatNum(r.levelPrice) }}</td>
          <td>{{ formatNum(r.unitPrice) }}</td>
          <td>
            <span :class="{ 'text-muted': r.dailyQuota === null }" :data-testid="`fut-quota-${r.foodsId}`">{{
              r.dailyQuota ?? r.defaultQuota
            }}</span>
            <span v-if="admin.isAdmin" class="d-inline-flex gap-1 ms-1">
              <input
                :value="quotaInput.get(r.foodsId) ?? ''"
                type="number"
                min="0"
                class="form-control form-control-sm"
                style="width: 5rem"
                placeholder="默认"
                :data-testid="`fut-quota-input-${r.foodsId}`"
                @input="quotaInput.set(r.foodsId, ($event.target as HTMLInputElement).value)"
              />
              <button
                type="button"
                class="btn btn-sm btn-outline-secondary"
                :disabled="busy"
                :data-testid="`fut-quota-save-${r.foodsId}`"
                @click="saveQuota(r)"
              >
                改
              </button>
            </span>
          </td>
          <td>{{ r.ordered }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
