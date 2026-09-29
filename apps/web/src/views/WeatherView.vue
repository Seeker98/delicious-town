<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { WorldDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { describeEffects } from '../utils/effects';

const world = ref<WorldDto | null>(null);
const error = ref('');
onMounted(async () => {
  try {
    world.value = await endpoints.weather();
  } catch (e) {
    error.value = errorMessage(e, '读取天气失败');
  }
});
</script>

<template>
  <div v-if="error" class="alert alert-danger">{{ error }}</div>
  <div v-if="world">
    <h5><i class="bi bi-cloud-sun"></i> {{ world.weather.name }}</h5>
    <p class="small">{{ world.weather.note }}</p>
    <p class="small text-muted">
      {{ describeEffects(world.weather.effects) || '对经营没有影响' }}（0 星餐厅不受天气影响）<br />
      持续到
      {{ new Date(world.weather.until).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}
    </p>
    <p class="small">
      蟹老板今天在 <b>{{ world.krabStreetName }}</b
      >：在这条街营业，遇到神秘顾客的机会更大。
    </p>
    <p v-if="world.holidayMultiplier > 1" class="small text-success">
      今天是节日，美味券掉落概率 ×{{ world.holidayMultiplier }}
    </p>
  </div>
</template>
