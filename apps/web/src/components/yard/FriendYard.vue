<script setup lang="ts">
import { formatNum } from '../../utils/format';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { FriendYardDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import PlantCard from './PlantCard.vue';
import type { PlantAction } from './plant';

const props = defineProps<{ restId: number }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const data = ref<FriendYardDto | null>(null);
const busy = ref(false);

async function load() {
  try {
    data.value = await endpoints.yardFriend(props.restId);
  } catch (e) {
    toast.push(errorMessage(e, t.value.yard.friend.loadFailed), 'danger');
  }
}
/** 倒计时、虫草干涸会随时间变化：获得焦点时和每分钟重新读取 */
let timer: ReturnType<typeof setInterval> | undefined;
const onFocus = () => void load();
onMounted(() => {
  void load();
  window.addEventListener('focus', onFocus);
  timer = setInterval(() => void load(), 60_000);
});
onBeforeUnmount(() => {
  window.removeEventListener('focus', onFocus);
  if (timer) clearInterval(timer);
});

async function run(fn: () => Promise<string>, fail: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    toast.push(await fn());
    await load();
  } catch (e) {
    toast.push(errorMessage(e, fail), 'danger');
  } finally {
    busy.value = false;
  }
}

function onAct(a: PlantAction, plantId: number) {
  if (a === 'water')
    void run(async () => {
      await endpoints.yardWater(plantId);
      return t.value.yard.friend.watered;
    }, t.value.yard.land.waterFailed);
  else if (a === 'deworm')
    void run(async () => {
      await endpoints.yardDeworm(plantId);
      return t.value.yard.friend.dewormed;
    }, t.value.yard.land.dewormFailed);
  else if (a === 'weed')
    void run(async () => {
      await endpoints.yardWeed(plantId);
      return t.value.yard.friend.weeded;
    }, t.value.yard.land.weedFailed);
  else if (a === 'reap')
    void run(async () => {
      const r = await endpoints.yardReap(plantId);
      const f = t.value.yard.friend;
      const caught = r.punished ? f.caught(catalog.foodName(r.punished)) : '';
      return f.stole(catalog.foodName(r.foodsId), r.num, caught);
    }, t.value.yard.friend.stealFailed);
}
</script>

<template>
  <div v-if="data" class="small">
    <div class="d-flex align-items-center mb-1">
      <h5 class="mb-0 me-auto">{{ t.yard.friend.title(data.name) }}</h5>
      <RouterLink :to="`/friends/${restId}`">{{ t.yard.friend.back }}</RouterLink>
    </div>
    <div class="text-muted mb-1">
      {{ t.yard.friend.meta(formatNum(data.strength), formatNum(data.renown)) }}
    </div>
    <div v-if="data.lands.length === 0" class="text-muted" data-testid="friend-empty">
      {{ t.yard.friend.empty }}
    </div>
    <div class="row g-1">
      <div v-for="l in data.lands" :key="l.no" class="col-4">
        <div class="border rounded p-1 h-100" :data-testid="`fland-${l.no}`">
          <div class="text-muted">{{ t.yard.land.landHead(l.no, l.level) }}</div>
          <PlantCard
            v-if="l.plant"
            :plant="l.plant"
            :strength="data.strength"
            :busy="busy"
            friend
            :steal-block="l.plant.stealBlock"
            @act="onAct"
          />
          <div v-else class="text-muted">{{ t.yard.friend.emptyLand }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
