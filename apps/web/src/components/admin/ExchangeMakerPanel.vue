<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import type { ExchangeMakerDto } from '@dt/shared';
import { adminApi } from '../../api/admin';
import { errorMessage } from '../../i18n/zh-CN';
import { useAdminStore } from '../../stores/admin';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { formatNum } from '../../utils/format';
import AdmBox from './kit/AdmBox.vue';
import AdmEmpty from './kit/AdmEmpty.vue';
import AdmKpi from './kit/AdmKpi.vue';

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
  <AdmBox v-if="data" title="系统做市" :sub="data.enabled ? '系统按价收购、卖出' : '已关闭'" flush>
    <div class="dt-adm-bb">
      <div v-if="!data.enabled" class="dt-adm-alert is-p dt-adm-mb" data-testid="exm-off">
        <i class="bi bi-info-circle" aria-hidden="true"></i>
        <div>本区服的系统做市已关闭（区服数值 tuning.exchange.maker.enabled）, 系统不收购也不卖出</div>
      </div>
      <div class="dt-adm-g4" data-testid="exm-today">
        <AdmKpi small label="今天收购花出" :value="formatNum(data.today.spent)" />
        <AdmKpi small label="卖出收回" :value="formatNum(data.today.earned)" />
        <AdmKpi small label="手续费" :value="formatNum(data.today.fee)" />
        <AdmKpi small label="净回收" :value="formatNum(data.today.net)" />
      </div>
    </div>
    <AdmEmpty v-if="data.foods.length === 0" title="系统还没有库存" text="今天也没有收购" />
    <div v-else class="dt-adm-scroll">
      <table class="dt-adm-table">
        <thead>
          <tr>
            <th>食材</th>
            <th class="num">库存</th>
            <th class="num">今天已收</th>
            <template v-if="data.enabled">
              <th class="num">系统买价</th>
              <th class="num">系统卖价</th>
            </template>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in data.foods" :key="r.foodsId" :data-testid="`exm-row-${r.foodsId}`">
            <td>{{ catalog.foodName(r.foodsId) }}</td>
            <td class="num">{{ formatNum(r.stock) }}</td>
            <td class="num">{{ formatNum(r.bought) }}</td>
            <template v-if="data.enabled">
              <td class="num">{{ r.bid === null ? '不收' : formatNum(r.bid) }}</td>
              <td class="num">{{ formatNum(r.ask) }}</td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>
  </AdmBox>
</template>
