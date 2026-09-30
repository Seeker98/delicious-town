<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { ExchangeFoodsDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';

const route = useRoute();
const toast = useToastStore();
const catalog = useCatalogStore();
const restId = computed(() => Number(route.params.restId));
const level = ref(1);
const data = ref<ExchangeFoodsDto | null>(null);
const take = ref<number | null>(null);
const give = ref<number | null>(null);
const busy = ref(false);
const fee = computed(() => data.value?.theirs.find((x) => x.foodsId === take.value)?.fee ?? 0);

async function load() {
  take.value = null;
  give.value = null;
  try {
    data.value = await endpoints.exchangeFoods(restId.value, level.value);
  } catch (e) {
    toast.push(errorMessage(e, '读取食材失败'), 'danger');
  }
}

async function confirm() {
  if (busy.value || take.value === null || give.value === null) return;
  busy.value = true;
  try {
    const r = await endpoints.exchange({
      restId: restId.value,
      giveFoodsId: give.value,
      takeFoodsId: take.value,
    });
    if (r.result === 'caught') toast.push('太不走运了！偷换食材被抓住了', 'danger');
    else
      toast.push(
        r.redPantsFoodsId !== null
          ? `交换成功，但对方有红内裤，你额外损失了 1 个${catalog.foodName(r.redPantsFoodsId)}`
          : '交换成功',
      );
    await load();
  } catch (e) {
    toast.push(errorMessage(e, '交换失败'), 'danger');
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <h5>交换食材</h5>
  <p class="small text-muted">用 2 个同等级的食材换对方 1 个；只能换 5 级以内的食材。</p>
  <div class="btn-group btn-group-sm mb-2">
    <button
      v-for="l in 5"
      :key="l"
      :class="['btn', l === level ? 'btn-primary' : 'btn-outline-primary']"
      @click="
        level = l;
        load();
      "
    >
      {{ l }} 级
    </button>
  </div>
  <template v-if="data">
    <p class="small">
      今天还能换 {{ data.left }} 次<span v-if="data.storm"
        >；飓风天可以换对方锁定的食材（有一半概率被抓）</span
      >
    </p>
    <h6>对方的</h6>
    <div class="d-flex flex-wrap gap-1 mb-2">
      <span v-if="data.theirs.length === 0" class="small text-muted">没有这个等级的食材</span>
      <button
        v-for="f in data.theirs"
        :key="f.foodsId"
        :class="['btn btn-sm', take === f.foodsId ? 'btn-primary' : 'btn-outline-secondary']"
        :data-testid="`theirs-${f.foodsId}`"
        :disabled="f.locked && !data.storm"
        @click="take = f.foodsId"
      >
        {{ catalog.foodName(f.foodsId) }} ×{{ f.num }}<i v-if="f.locked" class="bi bi-lock ms-1"></i>
      </button>
    </div>
    <h6>我给出（每次 2 个）</h6>
    <div class="d-flex flex-wrap gap-1 mb-2">
      <span v-if="data.mine.length === 0" class="small text-muted">你没有这个等级的食材</span>
      <button
        v-for="f in data.mine"
        :key="f.foodsId"
        :class="['btn btn-sm', give === f.foodsId ? 'btn-primary' : 'btn-outline-secondary']"
        :data-testid="`mine-${f.foodsId}`"
        :disabled="f.num < 2"
        @click="give = f.foodsId"
      >
        {{ catalog.foodName(f.foodsId) }} ×{{ f.num }}
      </button>
    </div>
    <button
      class="btn btn-primary w-100"
      data-testid="confirm"
      :disabled="busy || take === null || give === null || data.left <= 0"
      @click="confirm"
    >
      交换<span v-if="fee > 0">（手续费 {{ fee }} 银币）</span>
    </button>
  </template>
</template>
