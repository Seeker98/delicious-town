<script setup lang="ts">
import { adminShort } from '../../utils/gameInput';
import { computed, onMounted, ref, watch } from 'vue';
import { EXCHANGE_FLAGS, type ExchangeFrozenRow, type ExchangeSuspiciousRow } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import DtSheet from '../DtSheet.vue';
import AdmBox from './kit/AdmBox.vue';
import AdmEmpty from './kit/AdmEmpty.vue';
import { useConfirmStore } from '../../stores/confirm';

/** 后台"可疑数据 → 交易所"（156-2 设计 §7）：可疑成交、冻结名单、冻结/解冻/没收 */
const admin = useAdminStore();
const catalog = useCatalogStore();
const toast = useToastStore();
const confirm = useConfirmStore();
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
/** 冻结（界面改版 P12）：面板里写原因，不再用浏览器输入框 */
const freezeId = ref<number | null>(null);
const freezeReason = ref('');
function freeze(restId: number) {
  freezeId.value = restId;
  freezeReason.value = '';
}
async function doFreeze() {
  const restId = freezeId.value;
  const reason = freezeReason.value.trim();
  if (restId === null || !reason) return;
  freezeId.value = null;
  await run(() => adminApi.exchangeFreeze({ restId, reason }), '已冻结');
}
const unfreeze = (restId: number) => run(() => adminApi.exchangeUnfreeze({ restId }), '已解冻');
async function confiscate(b: { tradeId: number } | { restId: number }) {
  const ok = await confirm.ask({
    title: 'tradeId' in b ? '没收这笔成交的所得？' : '没收这家店全部冻结中所得？',
    body: '没收后不能恢复。',
    ok: '没收',
    danger: true,
  });
  if (!ok) return;
  void run(() => adminApi.exchangeConfiscate(b), '已没收');
}
watch([flag, () => admin.shardId], () => void load());
onMounted(() => void load());
</script>

<template>
  <AdmBox title="交易所可疑成交" sub="近 7 天, 最多 200 条" flush>
    <template #right>
      <select v-model="flag" class="dt-adm-in" aria-label="标记" data-testid="exg-flag">
        <option value="">全部标记</option>
        <option v-for="(label, k) in EXCHANGE_FLAGS" :key="k" :value="k">{{ label }}</option>
      </select>
    </template>
    <div v-if="rows.length > 0" class="dt-adm-scroll">
      <table class="dt-adm-table">
        <thead>
          <tr>
            <th>时间</th>
            <th>食材</th>
            <th class="num">价格（参考价）</th>
            <th class="num">数量 / 金额</th>
            <th>标记</th>
            <th>买方</th>
            <th>卖方</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.tradeId" :data-testid="`exg-row-${r.tradeId}`">
            <td class="dt-adm-mu nowrap">{{ adminShort(r.at) }}</td>
            <td>{{ catalog.foodName(r.foodsId) }}</td>
            <td class="num nowrap">
              {{ formatNum(r.price)
              }}<span v-if="r.ref !== null" class="dt-adm-mu"> ({{ formatNum(r.ref) }})</span>
            </td>
            <td class="num nowrap">{{ r.qty }} / {{ formatNum(r.amount) }}</td>
            <td>
              <span v-for="f in r.flags" :key="f" class="dt-adm-tag is-w me-1">{{ EXCHANGE_FLAGS[f] }}</span>
            </td>
            <td>
              {{ r.buyer.restName ?? `店 ${r.buyer.restId}`
              }}<span class="dt-adm-mu"> ({{ r.buyer.username ?? '?' }})</span>
              <div v-if="r.buyer.hold" class="dt-adm-mu dt-adm-small">{{ HOLD[r.buyer.hold] }}</div>
            </td>
            <td>
              {{ r.seller.restName ?? `店 ${r.seller.restId}`
              }}<span class="dt-adm-mu"> ({{ r.seller.username ?? '?' }})</span>
              <div v-if="r.seller.hold" class="dt-adm-mu dt-adm-small">{{ HOLD[r.seller.hold] }}</div>
            </td>
            <td class="acts">
              <button
                type="button"
                class="dt-adm-btn is-t is-sm"
                :disabled="busy"
                :data-testid="`exg-freeze-buyer-${r.tradeId}`"
                @click="freeze(r.buyer.restId)"
              >
                冻结买方
              </button>
              <button
                type="button"
                class="dt-adm-btn is-t is-sm"
                :disabled="busy"
                :data-testid="`exg-freeze-seller-${r.tradeId}`"
                @click="freeze(r.seller.restId)"
              >
                冻结卖方
              </button>
              <button
                v-if="isAdmin"
                type="button"
                class="dt-adm-btn is-d is-sm"
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
    </div>
    <AdmEmpty v-else title="没有可疑成交" />
  </AdmBox>

  <AdmBox title="冻结名单" :sub="`${frozen.length} 家`" flush>
    <AdmEmpty v-if="frozen.length === 0" title="没有被冻结的店" />
    <table v-else class="dt-adm-table">
      <tbody>
        <tr v-for="f in frozen" :key="f.restId" :data-testid="`exg-frozen-${f.restId}`">
          <td>
            <b>{{ f.restName }}</b> <span class="dt-adm-mu">({{ f.username }})</span>: {{ f.reason }}
            <div class="dt-adm-mu dt-adm-small">
              {{ f.actor ?? '?' }} · {{ adminShort(f.at) }} · 冻结中所得 银币
              {{ formatNum(f.heldCoin) }}、食材 {{ f.heldFoods }} 个
            </div>
          </td>
          <td class="acts">
            <button
              type="button"
              class="dt-adm-btn is-s is-sm"
              :disabled="busy"
              :data-testid="`exg-unfreeze-${f.restId}`"
              @click="unfreeze(f.restId)"
            >
              解冻
            </button>
            <button
              v-if="isAdmin"
              type="button"
              class="dt-adm-btn is-d is-sm"
              :disabled="busy"
              :data-testid="`exg-confiscate-rest-${f.restId}`"
              @click="confiscate({ restId: f.restId })"
            >
              没收全部冻结中所得
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </AdmBox>

  <DtSheet :open="freezeId !== null" :title="`冻结店 ${freezeId} 的交易所`" @close="freezeId = null">
    <p class="dt-sheet-text">冻结后这家店在交易所的所得先扣着, 解冻时还给它, 没收就不还。原因玩家能看到。</p>
    <input
      v-model="freezeReason"
      class="dt-adm-in dt-adm-full"
      placeholder="冻结原因 (玩家能看到)"
      data-testid="exg-freeze-reason"
    />
    <template #actions>
      <button type="button" class="btn btn-outline-secondary" @click="freezeId = null">取消</button>
      <button
        type="button"
        class="btn btn-outline-danger"
        :disabled="busy || !freezeReason.trim()"
        data-testid="exg-freeze-ok"
        @click="doFreeze"
      >
        冻结
      </button>
    </template>
  </DtSheet>
</template>
