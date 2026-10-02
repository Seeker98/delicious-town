<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import type { ExchangeMakerDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';

/** 后台"可疑数据 → 交易所"下面的"系统做市"（156-3 设计 §7），只读 */
const admin = useAdminStore();
const catalog = useCatalogStore();
const toast = useToastStore();
const data = ref<ExchangeMakerDto | null>(null);

async function load() {
  if (admin.shardId === null) return;
  try {
    data.value = await adminApi.exchangeMaker(admin.shardId);
  } catch (e) {
    toast.push(errorMessage(e, '读取失败'), 'danger');
  }
}
watch(
  () => admin.shardId,
  () => void load(),
);
onMounted(() => void load());
</script>

<template>
  <h6 class="dt-section mt-3">系统做市</h6>
  <template v-if="data">
    <div class="small mb-2" data-testid="exm-today">
      今天：收购花出 {{ formatNum(data.today.spent) }}，卖出收回 {{ formatNum(data.today.earned) }}，手续费
      {{ formatNum(data.today.fee) }}，净回收 {{ formatNum(data.today.net) }}
    </div>
    <div v-if="data.foods.length === 0" class="text-muted small">系统还没有库存，今天也没有收购</div>
    <table v-else class="table table-sm small">
      <thead>
        <tr>
          <th>食材</th>
          <th class="text-end">库存</th>
          <th class="text-end">今天已收</th>
          <th class="text-end">系统买价</th>
          <th class="text-end">系统卖价</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in data.foods" :key="r.foodsId" :data-testid="`exm-row-${r.foodsId}`">
          <td>{{ catalog.foodName(r.foodsId) }}</td>
          <td class="text-end">{{ formatNum(r.stock) }}</td>
          <td class="text-end">{{ formatNum(r.bought) }}</td>
          <td class="text-end">{{ r.bid === null ? '不收' : formatNum(r.bid) }}</td>
          <td class="text-end">{{ formatNum(r.ask) }}</td>
        </tr>
      </tbody>
    </table>
  </template>
</template>
