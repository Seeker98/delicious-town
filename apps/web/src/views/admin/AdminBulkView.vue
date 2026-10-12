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
import AdmBox from '../../components/admin/kit/AdmBox.vue';
import AdmEmpty from '../../components/admin/kit/AdmEmpty.vue';
import AdmHead from '../../components/admin/kit/AdmHead.vue';
import { useConfirmStore } from '../../stores/confirm';

/**
 * 后台“大宗认购”页（大宗认购设计 §3.3）：认购食材清单（全服一份，可从期货同步再微调）、
 * 本区服的批次（带真正的收盘时刻，进行中的可以取消）。起拍价参考按顶部选的区服
 */
const admin = useAdminStore();
const catalog = useCatalogStore();
const toast = useToastStore();
const confirm = useConfirmStore();
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
async function sync() {
  const ok = await confirm.ask({
    title: '按期货清单同步？',
    body: '期货启用的在这里启用 (不在清单里的加进来), 期货停用的在这里停用。',
    ok: '同步',
  });
  if (!ok) return;
  return act(() => adminApi.syncBulkFoods(), '已从期货同步');
}
async function cancel(l: AdminBulkLotDto) {
  const ok = await confirm.ask({
    title: `取消这一批 (${catalog.foodName(l.foodsId)})？`,
    body: '所有出价全额退回。',
    ok: '取消这一批',
    danger: true,
  });
  if (!ok) return;
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
const LOT_TONE: Record<AdminBulkLotDto['status'], string> = {
  open: 'is-p',
  settled: 'is-ok',
  failed: 'is-w',
  cancelled: '',
};
</script>

<template>
  <div class="dt-adm-page">
    <AdmHead
      title="大宗认购"
      desc="认购食材清单（全服一份）: 每天开批时从启用的里抽。可以先“从期货同步”, 再单独启用、停用。起拍价参考按左上选的区服今天的参考价算。"
    >
      <button
        v-if="admin.isAdmin"
        type="button"
        class="dt-adm-btn is-sp"
        :disabled="busy"
        data-testid="ab-sync"
        @click="sync"
      >
        从期货同步…
      </button>
    </AdmHead>
    <div v-if="err" class="dt-adm-alert is-d">
      <i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
      <div>{{ err }}</div>
    </div>
    <div class="dt-adm-fbar">
      <select v-model="level" class="dt-adm-in" data-testid="ab-level">
        <option value="">全部等级</option>
        <option v-for="n in 5" :key="n" :value="String(n)">{{ n }} 级</option>
      </select>
      <select v-model="kind" class="dt-adm-in" data-testid="ab-kind">
        <option value="">稀有和普通</option>
        <option value="rare">稀有</option>
        <option value="normal">普通</option>
      </select>
      <select v-model="state" class="dt-adm-in" data-testid="ab-state">
        <option value="">全部状态</option>
        <option value="on">启用</option>
        <option value="off">停用</option>
        <option value="out">不在清单</option>
      </select>
      <input
        v-model="q"
        class="dt-adm-in dt-adm-w-md"
        type="search"
        placeholder="名字或编号"
        data-testid="ab-q"
      />
      <span class="dt-adm-fbar-r">{{ shown.length }} 种</span>
    </div>
    <AdmBox flush>
      <template #head>
        <b>认购食材</b>
        <template v-if="admin.isAdmin">
          <button type="button" class="dt-adm-btn is-s is-sm" data-testid="ab-all" @click="checkAll">
            全选当前筛选结果 ({{ shown.length }})
          </button>
          <span>已选 {{ checked.size }}</span>
        </template>
      </template>
      <template v-if="admin.isAdmin" #right>
        <button
          type="button"
          class="dt-adm-btn is-p is-sm"
          :disabled="busy || checked.size === 0"
          data-testid="ab-batch-enable"
          @click="setEnabled(true)"
        >
          启用
        </button>
        <button
          type="button"
          class="dt-adm-btn is-d is-sm"
          :disabled="busy || checked.size === 0"
          data-testid="ab-batch-disable"
          @click="setEnabled(false)"
        >
          停用
        </button>
      </template>
      <div class="dt-adm-scroll dt-adm-tall">
        <table class="dt-adm-table">
          <thead>
            <tr>
              <th v-if="admin.isAdmin"></th>
              <th>#</th>
              <th>名字</th>
              <th class="num">等级</th>
              <th>稀有</th>
              <th>状态</th>
              <th>期货</th>
              <th class="num">起拍价参考</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in shown"
              :key="r.foodsId"
              :class="{ 'is-hl': checked.has(r.foodsId) }"
              :data-testid="`ab-food-${r.foodsId}`"
            >
              <td v-if="admin.isAdmin">
                <input
                  type="checkbox"
                  :checked="checked.has(r.foodsId)"
                  :aria-label="catalog.foodName(r.foodsId)"
                  :data-testid="`ab-check-${r.foodsId}`"
                  @change="check(r.foodsId, ($event.target as HTMLInputElement).checked)"
                />
              </td>
              <td class="dt-adm-mono dt-adm-mu">{{ r.foodsId }}</td>
              <td>{{ catalog.foodName(r.foodsId) }}</td>
              <td class="num">{{ r.level }}</td>
              <td>
                <span v-if="r.rare" class="dt-adm-tag is-w">稀有</span
                ><span v-else class="dt-adm-mu">普通</span>
              </td>
              <td>
                <span :class="['dt-adm-tag', r.enabled ? 'is-ok' : '']">{{ status(r) }}</span>
              </td>
              <td class="dt-adm-mu">{{ futures(r) }}</td>
              <td class="num">{{ formatNum(r.reserve) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <AdmEmpty v-if="shown.length === 0" title="没有符合的食材" />
    </AdmBox>

    <AdmBox title="本区服的批次" :sub="`${lots.length} 批`" flush>
      <AdmEmpty v-if="lots.length === 0" title="还没有批次" />
      <div v-else class="dt-adm-scroll">
        <table class="dt-adm-table">
          <thead>
            <tr>
              <th>开批日</th>
              <th>食材</th>
              <th class="num">份数</th>
              <th class="num">起拍价</th>
              <th>真正收盘</th>
              <th class="num">出价人数</th>
              <th class="num">认购份数</th>
              <th>状态</th>
              <th class="num">成交</th>
              <th v-if="admin.isAdmin"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in lots" :key="l.id" :data-testid="`ab-lot-${l.id}`">
              <td class="dt-adm-mu nowrap">{{ l.day }}</td>
              <td>
                {{ catalog.foodName(l.foodsId) }} <span class="dt-adm-mu">({{ l.level }} 级)</span>
              </td>
              <td class="num">{{ l.qty }}</td>
              <td class="num">{{ formatNum(l.reserve) }}</td>
              <td class="dt-adm-mu nowrap">{{ newsTime(l.closeAt) }}</td>
              <td class="num">{{ l.bidders }}</td>
              <td class="num">{{ l.demand }}</td>
              <td>
                <span :class="['dt-adm-tag', LOT_TONE[l.status]]">{{ LOT_STATUS[l.status] }}</span>
              </td>
              <td class="num nowrap">
                {{ l.price === null ? '—' : `${formatNum(l.price)} × ${l.sold ?? 0}` }}
              </td>
              <td v-if="admin.isAdmin" class="acts">
                <button
                  v-if="l.status === 'open'"
                  type="button"
                  class="dt-adm-btn is-d is-sm"
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
    </AdmBox>
  </div>
</template>
