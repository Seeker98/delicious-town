<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { EXCHANGE_FLAGS, type ExchangeFrozenRow, type ExchangeSuspiciousRow } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';

/** 后台"可疑数据 → 交易所"（156-2 设计 §7）：可疑成交、冻结名单、冻结/解冻/没收 */
const admin = useAdminStore();
const catalog = useCatalogStore();
const toast = useToastStore();
const rows = ref<ExchangeSuspiciousRow[]>([]);
const frozen = ref<ExchangeFrozenRow[]>([]);
const flag = ref('');
const busy = ref(false);
const isAdmin = computed(() => admin.me?.role === 'admin');
const HOLD = { held: '冻结中', released: '已解冻', confiscated: '已没收' } as const;

async function load() {
  if (admin.shardId === null) return;
  try {
    [rows.value, frozen.value] = await Promise.all([
      adminApi.suspiciousExchange(admin.shardId, flag.value || undefined),
      adminApi.exchangeFrozen(admin.shardId),
    ]);
  } catch (e) {
    toast.push(errorMessage(e, '读取失败'), 'danger');
  }
}
async function run(fn: () => Promise<unknown>, ok: string) {
  busy.value = true;
  try {
    await fn();
    toast.push(ok);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '操作失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
function freeze(restId: number) {
  const reason = window.prompt('冻结原因（玩家能看到）')?.trim();
  if (!reason) return;
  void run(() => adminApi.exchangeFreeze({ restId, reason }), '已冻结');
}
const unfreeze = (restId: number) => run(() => adminApi.exchangeUnfreeze({ restId }), '已解冻');
function confiscate(b: { tradeId: number } | { restId: number }) {
  if (!window.confirm('没收后不能恢复，确定吗？')) return;
  void run(() => adminApi.exchangeConfiscate(b), '已没收');
}
watch([flag, () => admin.shardId], () => void load());
onMounted(() => void load());
</script>

<template>
  <div class="d-flex align-items-center gap-2 mb-2 small">
    标记
    <select v-model="flag" class="form-select form-select-sm w-auto" data-testid="exg-flag">
      <option value="">全部</option>
      <option v-for="(label, k) in EXCHANGE_FLAGS" :key="k" :value="k">{{ label }}</option>
    </select>
    <span class="text-muted">近 7 天，最多 200 条</span>
  </div>
  <table class="table table-sm small">
    <thead>
      <tr>
        <th>时间</th>
        <th>食材</th>
        <th>价格（参考价）</th>
        <th>数量 / 金额</th>
        <th>标记</th>
        <th>买方</th>
        <th>卖方</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="r in rows" :key="r.tradeId" :data-testid="`exg-row-${r.tradeId}`">
        <td>{{ new Date(r.at).toLocaleString('zh-CN') }}</td>
        <td>{{ catalog.foodName(r.foodsId) }}</td>
        <td>
          {{ formatNum(r.price)
          }}<span v-if="r.ref !== null" class="text-muted">（{{ formatNum(r.ref) }}）</span>
        </td>
        <td>{{ r.qty }} / {{ formatNum(r.amount) }}</td>
        <td>
          <span v-for="f in r.flags" :key="f" class="badge text-bg-warning me-1">{{
            EXCHANGE_FLAGS[f]
          }}</span>
        </td>
        <td>
          {{ r.buyer.restName ?? `店 ${r.buyer.restId}`
          }}<span class="text-muted">（{{ r.buyer.username ?? '?' }}）</span>
          <div v-if="r.buyer.hold" class="text-muted">{{ HOLD[r.buyer.hold] }}</div>
        </td>
        <td>
          {{ r.seller.restName ?? `店 ${r.seller.restId}`
          }}<span class="text-muted">（{{ r.seller.username ?? '?' }}）</span>
          <div v-if="r.seller.hold" class="text-muted">{{ HOLD[r.seller.hold] }}</div>
        </td>
        <td class="text-nowrap">
          <button
            type="button"
            class="btn btn-sm btn-link p-0 me-2"
            :disabled="busy"
            :data-testid="`exg-freeze-buyer-${r.tradeId}`"
            @click="freeze(r.buyer.restId)"
          >
            冻结买方
          </button>
          <button
            type="button"
            class="btn btn-sm btn-link p-0 me-2"
            :disabled="busy"
            :data-testid="`exg-freeze-seller-${r.tradeId}`"
            @click="freeze(r.seller.restId)"
          >
            冻结卖方
          </button>
          <button
            v-if="isAdmin"
            type="button"
            class="btn btn-sm btn-link text-danger p-0"
            :disabled="busy"
            :data-testid="`exg-confiscate-${r.tradeId}`"
            @click="confiscate({ tradeId: r.tradeId })"
          >
            没收这笔
          </button>
        </td>
      </tr>
    </tbody>
  </table>
  <div v-if="rows.length === 0" class="text-muted small mb-3">没有可疑成交</div>

  <h6 class="dt-section">冻结名单</h6>
  <div v-if="frozen.length === 0" class="text-muted small">没有被冻结的店</div>
  <div
    v-for="f in frozen"
    :key="f.restId"
    class="d-flex flex-wrap align-items-center gap-2 small border-bottom py-1"
  >
    <span class="flex-fill"
      >{{ f.restName }}（{{ f.username }}）：{{ f.reason
      }}<span class="text-muted">
        · {{ f.actor ?? '?' }} · 冻结中所得 银币 {{ formatNum(f.heldCoin) }}、食材 {{ f.heldFoods }} 个</span
      ></span
    >
    <button
      type="button"
      class="btn btn-sm btn-outline-secondary"
      :disabled="busy"
      :data-testid="`exg-unfreeze-${f.restId}`"
      @click="unfreeze(f.restId)"
    >
      解冻
    </button>
    <button
      v-if="isAdmin"
      type="button"
      class="btn btn-sm btn-outline-danger"
      :disabled="busy"
      :data-testid="`exg-confiscate-rest-${f.restId}`"
      @click="confiscate({ restId: f.restId })"
    >
      没收全部冻结中所得
    </button>
  </div>
</template>
