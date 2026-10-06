<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { ExchangeFoodsDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';

const route = useRoute();
const toast = useToastStore();
const t = useT();
const catalog = useCatalogStore();
const restId = computed(() => Number(route.params.restId));
const level = ref(1);
const data = ref<ExchangeFoodsDto | null>(null);
const take = ref<number | null>(null);
const give = ref<number | null>(null);
const busy = ref(false);
const fee = computed(() => data.value?.theirs.find((x) => x.foodsId === take.value)?.fee ?? 0);
/** 按名字筛（backlog 370：蟹老板的橱柜一级有八九十种）；对方的里我学菜缺的排前面，缺得多的在前 */
const q = ref('');
const match = (id: number) => {
  const s = q.value.trim().toLowerCase();
  return s === '' || catalog.foodName(id).toLowerCase().includes(s);
};
const theirs = computed(() =>
  (data.value?.theirs ?? [])
    .filter((f) => match(f.foodsId))
    .sort((a, b) => b.need - a.need || a.foodsId - b.foodsId),
);
const mine = computed(() => (data.value?.mine ?? []).filter((f) => match(f.foodsId)));

async function load() {
  take.value = null;
  give.value = null;
  try {
    data.value = await endpoints.exchangeFoods(restId.value, level.value);
  } catch (e) {
    toast.push(errorMessage(e, t.value.friends.exchange.loadFailed), 'danger');
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
    if (r.result === 'caught') toast.push(t.value.friends.exchange.caught, 'danger');
    else
      toast.push(
        r.redPantsFoodsId !== null
          ? t.value.friends.exchange.redPants(catalog.foodName(r.redPantsFoodsId))
          : t.value.friends.exchange.done,
      );
    await load();
  } catch (e) {
    toast.push(errorMessage(e, t.value.friends.exchange.failed), 'danger');
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <h5>{{ t.friends.exchange.title }}</h5>
  <p class="small text-muted">{{ t.friends.exchange.rule }}</p>
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
      {{ t.friends.exchange.level(l) }}
    </button>
  </div>
  <template v-if="data">
    <input
      v-model="q"
      type="search"
      class="form-control form-control-sm mb-2"
      :placeholder="t.friends.exchange.search"
      data-testid="exchange-search"
    />
    <p class="small">
      {{ t.friends.exchange.left(data.left) }}<span v-if="data.storm">{{ t.friends.exchange.storm }}</span>
    </p>
    <h6>{{ t.friends.exchange.theirs }}</h6>
    <div class="d-flex flex-wrap gap-1 mb-2">
      <span v-if="data.theirs.length === 0" class="small text-muted">{{
        t.friends.exchange.theirsEmpty
      }}</span>
      <button
        v-for="f in theirs"
        :key="f.foodsId"
        :class="['btn btn-sm', take === f.foodsId ? 'btn-primary' : 'btn-outline-secondary']"
        :data-testid="`theirs-${f.foodsId}`"
        :disabled="f.locked && !data.storm"
        @click="take = f.foodsId"
      >
        {{ catalog.foodName(f.foodsId) }} ×{{ f.num
        }}<span v-if="f.need > 0" class="badge text-bg-warning ms-1">{{
          t.friends.exchange.need(f.need)
        }}</span
        ><i v-if="f.locked" class="bi bi-lock ms-1"></i>
      </button>
    </div>
    <h6>{{ t.friends.exchange.mine }}</h6>
    <div class="d-flex flex-wrap gap-1 mb-2">
      <span v-if="data.mine.length === 0" class="small text-muted">{{ t.friends.exchange.mineEmpty }}</span>
      <button
        v-for="f in mine"
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
      {{ t.friends.exchange.btn }}<span v-if="fee > 0">{{ t.friends.exchange.fee(fee) }}</span>
    </button>
  </template>
</template>
