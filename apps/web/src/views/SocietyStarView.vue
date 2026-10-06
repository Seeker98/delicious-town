<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { StarNeedDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import NeedChecks from '../components/NeedChecks.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useRestaurantStore } from '../stores/restaurant';
import { useToastStore } from '../stores/toast';

const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const need = ref<StarNeedDto | null>(null);
const busy = ref(false);

async function load() {
  need.value = await endpoints.starNeed();
}
async function starUp() {
  busy.value = true;
  try {
    const r = await endpoints.starUp();
    // 食谱页记住的下一星要求作废，餐厅的星级也重读（backlog 384 审查）
    const restaurant = useRestaurantStore();
    restaurant.starNeed = null;
    void restaurant.refresh().catch(() => null);
    toast.push(t.value.society.star.done(r.star));
    await load();
  } catch (e) {
    toast.push(errorMessage(e, t.value.society.star.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
onMounted(() => load().catch((e) => toast.push(errorMessage(e, t.value.common.loadFailed), 'danger')));
</script>

<template>
  <div v-if="need">
    <h5>{{ t.society.star.title(need.star) }}</h5>
    <template v-if="need.nextStar">
      <p v-if="!need.available" class="small text-muted">{{ t.society.star.notOpen(need.nextStar) }}</p>
      <NeedChecks :checks="need.checks" />
      <div v-if="need.award" class="small mb-2">
        {{ t.society.star.award }}
        <span v-for="g in need.award.goods ?? []" :key="g.id" class="dt-tag me-1">{{
          t.common.qty(catalog.goodsName(g.id), g.num)
        }}</span>
      </div>
    </template>
    <p v-else class="small text-muted">{{ t.society.star.maxed }}</p>
    <button class="btn btn-primary w-100" data-testid="star-up" :disabled="busy || !need.ok" @click="starUp">
      {{ t.society.star.btn(need.nextStar ?? need.star) }}
    </button>
  </div>
</template>
