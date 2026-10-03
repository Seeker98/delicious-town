<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { WorldDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { describeEffects } from '../utils/effects';
import { timeHM } from '../utils/format';

const t = useT();
/** 天气名、说明、街道名按目录取，跟着语言走（问题记录 272） */
const catalog = useCatalogStore();
const world = ref<WorldDto | null>(null);
const error = ref('');
onMounted(async () => {
  try {
    world.value = await endpoints.weather();
  } catch (e) {
    error.value = errorMessage(e, t.value.misc.weather.loadFailed);
  }
});
</script>

<template>
  <div v-if="error" class="alert alert-danger">{{ error }}</div>
  <div v-if="world">
    <h5><i class="bi bi-cloud-sun"></i> {{ catalog.weatherName(world.weather.id, world.weather.name) }}</h5>
    <p class="small dt-weather-note">{{ catalog.weatherNote(world.weather.id) ?? world.weather.note }}</p>
    <p class="small text-muted">
      {{ describeEffects(world.weather.effects) || t.misc.weather.noEffect }}{{ t.misc.weather.zeroStar
      }}<br />
      {{ t.misc.weather.until(timeHM(world.weather.until)) }}
    </p>
    <p class="small">
      {{ t.misc.weather.krabPre }}<b>{{ catalog.streetName(world.krabStreet, world.krabStreetName) }}</b
      >{{ t.misc.weather.krabPost }}
    </p>
    <p v-if="world.holidayMultiplier > 1" class="small text-success">
      {{ t.misc.weather.holiday(world.holidayMultiplier) }}
    </p>
    <p class="small">
      {{ t.misc.weather.hammer
      }}<RouterLink to="/town?tab=town" data-testid="weather-hammer">{{
        t.misc.weather.toSquare
      }}</RouterLink>
    </p>
  </div>
</template>

<style scoped>
/* 天气说明每条效果一行 */
.dt-weather-note {
  white-space: pre-line;
}
</style>
