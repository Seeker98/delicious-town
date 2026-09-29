<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { EffectDto, RestaurantDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import GameImg from '../components/GameImg.vue';
import { errorMessage } from '../i18n/zh-CN';
import { describeEffects } from '../utils/effects';
import { formatNum } from '../utils/format';

const rest = ref<RestaurantDto | null>(null);
const error = ref('');

onMounted(async () => {
  try {
    rest.value = await endpoints.overview();
  } catch (e) {
    error.value = errorMessage(e, '获取餐厅信息失败');
  }
});

const expPercent = computed(() =>
  rest.value ? Math.min(100, Math.floor((rest.value.exp / rest.value.expToNext) * 100)) : 0,
);

function expiresText(e: EffectDto): string {
  if (!e.expiresAt) return '永久';
  const hours = Math.max(0, Math.ceil((new Date(e.expiresAt).getTime() - Date.now()) / 3_600_000));
  return `剩余 ${hours} 小时`;
}
</script>

<template>
  <div v-if="error" class="alert alert-danger">{{ error }}</div>
  <div v-else-if="!rest" class="text-muted">加载中……</div>
  <div v-else>
    <div class="d-flex justify-content-between align-items-center">
      <h5 class="mb-0" data-testid="rest-name">{{ rest.name }}</h5>
      <RouterLink to="/shards" class="small">切换区服</RouterLink>
    </div>
    <div class="small text-muted mb-2">{{ rest.streetName }} · {{ rest.starLevel }} 星</div>

    <div class="row g-1 small">
      <div class="col-6">
        等级 <b data-testid="rest-level">{{ rest.level }}</b>
      </div>
      <div class="col-6">
        声望 <b>{{ rest.renown }}</b>
      </div>
      <div class="col-6">
        <i class="bi bi-coin"></i> <b data-testid="rest-coin">{{ formatNum(rest.coin) }}</b>
      </div>
      <div class="col-6">
        <i class="bi bi-gem"></i> <b>{{ formatNum(rest.diamond) }}</b>
      </div>
      <div class="col-6"><i class="bi bi-lightning"></i> {{ rest.strength }}/{{ rest.strengthMax }}</div>
      <div class="col-6"><i class="bi bi-droplet"></i> {{ rest.oil }}/{{ rest.oilMax }}</div>
    </div>
    <div
      class="progress my-2"
      role="progressbar"
      :aria-valuenow="expPercent"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <div class="progress-bar bg-warning text-dark" :style="{ width: `${expPercent}%` }">
        {{ formatNum(rest.exp) }}/{{ formatNum(rest.expToNext) }}
      </div>
    </div>

    <h6 class="mt-3">
      属性 <small class="text-muted">（剩余点数 {{ rest.attrLeft }}）</small>
    </h6>
    <div class="row g-1 small">
      <div class="col-4">厨艺 {{ rest.attrs.cook }}</div>
      <div class="col-4">刀工 {{ rest.attrs.cutting }}</div>
      <div class="col-4">火候 {{ rest.attrs.fire }}</div>
      <div class="col-4">调味 {{ rest.attrs.season }}</div>
      <div class="col-4">创意 {{ rest.attrs.creatives }}</div>
      <div class="col-4">幸运 {{ rest.luck }}</div>
    </div>

    <h6 class="mt-3">餐桌（{{ rest.tables.length }}/{{ rest.tableNum }}）</h6>
    <div class="d-flex flex-wrap gap-1">
      <div
        v-for="t in rest.tables"
        :key="t.no"
        class="border rounded px-2 py-1 small"
        :data-testid="`table-${t.no}`"
      >
        <i class="bi bi-square"></i> {{ t.no }}
      </div>
    </div>

    <h6 class="mt-3">生效的加成</h6>
    <ul class="list-unstyled small">
      <li v-for="e in rest.effects" :key="`${e.sourceType}-${e.sourceId}`" class="mb-1">
        <GameImg :path="`goods/${e.name}`" :alt="e.name" fallback-icon="bi-award" />
        <b>{{ e.name }}</b> {{ describeEffects(e.effects) }}
        <span class="text-muted">（{{ expiresText(e) }}）</span>
      </li>
    </ul>
  </div>
</template>
