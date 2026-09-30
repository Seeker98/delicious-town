<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { FriendYardDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import PlantCard from './PlantCard.vue';
import type { PlantAction } from './plant';

const props = defineProps<{ restId: number }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const data = ref<FriendYardDto | null>(null);
const busy = ref(false);

async function load() {
  try {
    data.value = await endpoints.yardFriend(props.restId);
  } catch (e) {
    toast.push(errorMessage(e, '读取好友菜园失败'), 'danger');
  }
}
onMounted(load);

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
      return '帮它浇了水';
    }, '浇水失败');
  else if (a === 'deworm')
    void run(async () => {
      await endpoints.yardDeworm(plantId);
      return '帮它除了一只虫';
    }, '除虫失败');
  else if (a === 'weed')
    void run(async () => {
      await endpoints.yardWeed(plantId);
      return '帮它除了草';
    }, '除草失败');
  else if (a === 'reap')
    void run(async () => {
      const r = await endpoints.yardReap(plantId);
      const caught = r.punished ? `，被边牧逮住，留下了 ${catalog.foodName(r.punished)}` : '';
      return `偷到 ${catalog.foodName(r.foodsId)}×${r.num}，放进了菜篮${caught}`;
    }, '偷菜失败');
}
</script>

<template>
  <div v-if="data" class="small">
    <div class="d-flex align-items-center mb-1">
      <h5 class="mb-0 me-auto">{{ data.name }}的菜园</h5>
      <RouterLink :to="`/friends/${restId}`">回到它的餐厅</RouterLink>
    </div>
    <div class="text-muted mb-1">
      我的体力 {{ data.strength }}，声望 {{ data.renown }}（每次偷菜扣 1 点声望）
    </div>
    <div v-if="data.lands.length === 0" class="text-muted" data-testid="friend-empty">它还没有开垦菜园</div>
    <div class="row g-1">
      <div v-for="l in data.lands" :key="l.no" class="col-4">
        <div class="border rounded p-1 h-100" :data-testid="`fland-${l.no}`">
          <div class="text-muted">{{ l.no }} 号地 · {{ l.level }} 级</div>
          <PlantCard
            v-if="l.plant"
            :plant="l.plant"
            :strength="data.strength"
            :busy="busy"
            friend
            :steal-block="l.plant.stealBlock"
            @act="onAct"
          />
          <div v-else class="text-muted">空地</div>
        </div>
      </div>
    </div>
  </div>
</template>
