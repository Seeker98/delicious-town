<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { ExchangeFoodsDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { matchText } from '../utils/match';

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
/** 和这家还能换几次：我自己的剩余和对方还能被换的取小（问题记录 479） */
const canSwap = computed(() => Math.min(data.value?.left ?? 0, data.value?.takenLeft ?? Infinity) > 0);
/**
 * 对方的食材按名字筛（backlog 370：蟹老板的橱柜一级有八九十种；不区分大小写、忽略重音）；
 * 我学菜缺的排前面、缺得多的在前，锁着换不了的排最后。我的那一栏不筛，选好要的再挑给出的
 */
const q = ref('');
const takeable = (f: { locked: boolean }) => !f.locked || (data.value?.storm ?? false);
const theirs = computed(() =>
  (data.value?.theirs ?? [])
    .filter((f) => matchText(catalog.foodName(f.foodsId), q.value.trim()))
    .sort((a, b) => Number(takeable(b)) - Number(takeable(a)) || b.need - a.need || a.foodsId - b.foodsId),
);
// 选中的被搜索筛掉时取消选择，免得确认时换的是看不见的那个
watch(theirs, (list) => {
  if (take.value !== null && !list.some((f) => f.foodsId === take.value)) take.value = null;
});

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
    <!-- 和好友换只看每天总数，对方被换满时写明（问题记录 479） -->
    <p class="small" data-testid="exchange-left">
      {{ t.friends.exchange.left(data.left)
      }}<template v-if="!data.npc">{{ t.common.paren(t.friends.exchange.allFriends) }}</template
      ><template v-if="data.takenLeft === 0">{{ t.friends.exchange.takenFull }}</template
      ><template v-else-if="data.takenLeft !== null && data.takenLeft < data.left">{{
        t.friends.exchange.takenLeft(data.takenLeft)
      }}</template
      ><span v-if="data.storm">{{ t.friends.exchange.storm }}</span>
    </p>
    <h6>{{ t.friends.exchange.theirs }}</h6>
    <div class="d-flex flex-wrap gap-1 mb-2">
      <span v-if="theirs.length === 0" class="small text-muted">{{
        q.trim() === '' ? t.friends.exchange.theirsEmpty : t.friends.exchange.noMatch
      }}</span>
      <button
        v-for="f in theirs"
        :key="f.foodsId"
        :class="['btn btn-sm', take === f.foodsId ? 'btn-primary' : 'btn-outline-secondary']"
        :data-testid="`theirs-${f.foodsId}`"
        :disabled="f.locked && !data.storm"
        @click="take = f.foodsId"
      >
        {{ t.common.qty(catalog.foodName(f.foodsId), f.num)
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
        v-for="f in data.mine"
        :key="f.foodsId"
        :class="['btn btn-sm', give === f.foodsId ? 'btn-primary' : 'btn-outline-secondary']"
        :data-testid="`mine-${f.foodsId}`"
        :disabled="f.num < 2"
        @click="give = f.foodsId"
      >
        {{ t.common.qty(catalog.foodName(f.foodsId), f.num) }}
      </button>
    </div>
    <button
      class="btn btn-primary w-100"
      data-testid="confirm"
      :disabled="busy || take === null || give === null || !canSwap"
      @click="confirm"
    >
      {{ t.friends.exchange.btn }}<span v-if="fee > 0">{{ t.friends.exchange.fee(fee) }}</span>
    </button>
  </template>
</template>
