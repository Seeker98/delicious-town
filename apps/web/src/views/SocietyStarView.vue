<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { StarNeedDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import NeedChecks from '../components/NeedChecks.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';

const catalog = useCatalogStore();
const toast = useToastStore();
const need = ref<StarNeedDto | null>(null);
const busy = ref(false);

async function load() {
  need.value = await endpoints.starNeed();
}
async function starUp() {
  busy.value = true;
  try {
    const r = await endpoints.starUp();
    toast.push(`恭喜升到 ${r.star} 星！`);
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '升星失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
onMounted(() => load().catch((e) => toast.push(errorMessage(e, '读取失败'), 'danger')));
</script>

<template>
  <div v-if="need">
    <h5>升星（当前 {{ need.star }} 星）</h5>
    <template v-if="need.nextStar">
      <p v-if="!need.available" class="small text-muted">{{ need.nextStar }} 星暂未开放</p>
      <NeedChecks :checks="need.checks" />
      <div v-if="need.award" class="small mb-2">
        奖励：
        <span v-for="g in need.award.goods ?? []" :key="g.id" class="dt-tag me-1"
          >{{ catalog.goodsName(g.id) }}×{{ g.num }}</span
        >
      </div>
    </template>
    <p v-else class="small text-muted">已经是最高星级</p>
    <button class="btn btn-primary w-100" data-testid="star-up" :disabled="busy || !need.ok" @click="starUp">
      升到 {{ need.nextStar ?? need.star }} 星
    </button>
  </div>
</template>
