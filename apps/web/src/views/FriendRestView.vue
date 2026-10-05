<script setup lang="ts">
import HiphopCard from '../components/hiphop/HiphopCard.vue';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import type { FriendRestDto, TableDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import GameImg from '../components/GameImg.vue';
import ReportButton from '../components/ReportButton.vue';
import TableGrid from '../components/TableGrid.vue';
import FriendDuel from '../components/tower/FriendDuel.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';
import { GRADE_NAMES, PART_NAMES } from '../utils/labels';
import { equipName } from '../utils/equipName';

const route = useRoute();
const router = useRouter();
const toast = useToastStore();
const t = useT();
const catalog = useCatalogStore();
const session = useSessionStore();
const restId = computed(() => Number(route.params.restId));
const rest = ref<FriendRestDto | null>(null);
const picked = ref<TableDto | null>(null);
const busy = ref(false);
const error = ref('');

async function load() {
  try {
    rest.value = await endpoints.friendDetail(restId.value);
    if (picked.value) picked.value = rest.value.tables.find((t) => t.no === picked.value!.no) ?? null;
    error.value = '';
  } catch (e) {
    error.value = errorMessage(e, t.value.friends.rest.loadFailed);
  }
}

async function act(fn: () => Promise<unknown>, ok: string, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    toast.push(ok);
    picked.value = null;
    await load();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}

const isEmpty = (t: TableDto) => (t.customer === 0 || t.customer === -3) && !t.roach && !t.freeloaderRestId;
const mine = computed(() => session.me?.restaurantId ?? null);
const equips = computed(() => [...(rest.value?.equips ?? [])].sort((a, b) => a.part - b.part));

function refuel(num: number) {
  return act(
    () => endpoints.friendRefuel(restId.value, num),
    t.value.friends.rest.refueled,
    t.value.friends.rest.refuelFailed,
  );
}
function remove() {
  if (!rest.value || !window.confirm(t.value.friends.rest.removeConfirm(rest.value.name))) return;
  return act(
    async () => {
      await endpoints.friendRemove(restId.value);
      await router.push('/friends');
    },
    t.value.friends.rest.removed,
    t.value.friends.rest.removeFailed,
  );
}

const onFocus = () => void load();
onMounted(() => {
  void load();
  window.addEventListener('focus', onFocus);
});
onBeforeUnmount(() => window.removeEventListener('focus', onFocus));
</script>

<template>
  <div v-if="error" class="alert alert-danger">{{ error }}</div>
  <template v-if="rest">
    <div class="d-flex align-items-center mb-2">
      <GameImg
        :path="`avatar/${rest.avatar ?? 0}`"
        :alt="rest.name"
        fallback-icon="bi-person-circle"
        class="me-2"
      />
      <div class="flex-fill">
        <div class="fw-bold">
          {{ rest.name }}
          <!-- 蟹老板（NPC 店）不能举报，点了会被拒（backlog 6B-1） -->
          <ReportButton
            v-if="rest.id !== mine && !rest.npc"
            target-type="rest_name"
            :target-id="rest.id"
            testid="rest-name-report"
          />
        </div>
        <div class="small text-muted">
          {{ t.friends.rest.info(rest.level, rest.star, rest.renown)
          }}<span v-if="rest.state !== 1">{{ t.friends.rest.closed }}</span>
        </div>
      </div>
      <GameImg :path="`door/${rest.door}`" :alt="t.friends.rest.door" fallback-icon="bi-door-closed" />
    </div>
    <HiphopCard :rest-id="restId" />
    <div v-if="rest.icons.length > 0" class="mb-2">
      <span v-for="i in rest.icons" :key="i.key" class="badge bg-warning text-dark me-1">{{
        catalog.icon(i.key)?.title ?? i.title
      }}</span>
    </div>
    <!-- 每个部位一行，强化等级单独标出；名字长时自己折行，不和别的部位挤在一段里（问题记录 323） -->
    <div v-if="equips.length > 0" class="border rounded p-2 mb-2 small" data-testid="friend-equips">
      <div class="text-muted mb-1">{{ t.friends.rest.equips }}</div>
      <div class="dt-equip-grid">
        <div
          v-for="(e, i) in equips"
          :key="`${e.part}-${i}`"
          class="dt-equip-row"
          :data-testid="`friend-equip-${e.part}`"
        >
          <span class="text-muted">{{ PART_NAMES[e.part] }}</span>
          <span class="dt-equip-name">{{ equipName(catalog, e) }}</span>
          <span v-if="e.stress > 0" class="badge text-bg-light border">+{{ e.stress }}</span>
          <span v-else></span>
        </div>
      </div>
    </div>
    <div
      v-if="rest.special"
      class="border rounded p-2 mb-2 small d-flex align-items-center"
      data-testid="friend-special"
    >
      <div class="flex-fill">
        {{ t.friends.rest.special }}<b>{{ catalog.mcName(rest.special.mcId) }}</b>
        {{
          t.friends.rest.specialLine(
            GRADE_NAMES[rest.special.grade] ?? '',
            rest.special.leftNum,
            rest.special.price,
          )
        }}
      </div>
      <button
        v-if="rest.id !== mine"
        class="btn btn-sm btn-outline-success"
        data-testid="act-taste"
        :disabled="busy || rest.special.eaten || rest.state !== 1"
        @click="act(() => endpoints.mcTaste(restId), t.friends.rest.tasted, t.friends.rest.tasteFailed)"
      >
        {{ rest.special.eaten ? t.friends.rest.tastedAlready : t.friends.rest.taste }}
      </button>
    </div>
    <div v-if="rest.notice" class="border rounded p-2 mb-2 small">
      <div style="white-space: pre-wrap">{{ rest.notice }}</div>
      <div v-if="rest.id !== mine && !rest.npc" class="text-end">
        <ReportButton target-type="notice" :target-id="rest.id" testid="notice-report" />
      </div>
    </div>

    <div v-if="rest.isFriend" class="d-flex flex-wrap gap-1 mb-2" data-testid="act-bar">
      <button
        class="btn btn-sm btn-outline-primary"
        :disabled="busy || rest.thumbedToday"
        @click="act(() => endpoints.thumbUp(restId), t.friends.rest.thumbed, t.friends.rest.thumbFailed)"
      >
        {{ rest.thumbedToday ? t.friends.rest.thumbedAlready : t.friends.rest.thumb }}
      </button>
      <button class="btn btn-sm btn-outline-primary" :disabled="busy" @click="refuel(-1)">
        {{ t.friends.rest.refuel }}
      </button>
      <RouterLink class="btn btn-sm btn-outline-primary" :to="`/friends/${restId}/flip`">{{
        t.friends.rest.flip
      }}</RouterLink>
      <RouterLink class="btn btn-sm btn-outline-primary" :to="`/friends/${restId}/exchange`">{{
        t.friends.rest.exchange
      }}</RouterLink>
      <RouterLink
        v-if="!rest.npc"
        class="btn btn-sm btn-outline-primary"
        :to="`/yard?friend=${restId}`"
        data-testid="to-yard"
        >{{ t.friends.rest.yard }}</RouterLink
      >
      <button v-if="!rest.npc" class="btn btn-sm btn-outline-danger ms-auto" :disabled="busy" @click="remove">
        {{ t.friends.rest.remove }}
      </button>
    </div>
    <div v-else-if="rest.id !== mine" class="mb-2">
      <button
        class="btn btn-sm btn-primary"
        data-testid="add-friend"
        :disabled="busy || rest.requested"
        @click="act(() => endpoints.friendApply(restId), t.friends.applied, t.friends.applyFailed)"
      >
        {{ rest.requested ? t.friends.requested : t.friends.addFriend }}
      </button>
    </div>
    <FriendDuel v-if="rest.isFriend && !rest.npc" :key="restId" :rest-id="restId" class="mb-2" />

    <TableGrid :tables="rest.tables" :selected="picked?.no ?? null" @pick="(t) => (picked = t)" />

    <div v-if="picked && rest.isFriend" class="border rounded p-2 mt-2 small">
      <div class="mb-1">{{ t.friends.rest.table(picked.no) }}</div>
      <template v-if="isEmpty(picked)">
        <button
          class="btn btn-sm btn-primary me-1"
          data-testid="act-dine"
          :disabled="busy"
          @click="
            act(
              () => endpoints.dineStart(restId, picked!.no),
              t.friends.rest.dineStarted,
              t.friends.rest.dineFailed,
            )
          "
        >
          {{ t.friends.rest.dine }}
        </button>
        <button
          class="btn btn-sm btn-outline-danger"
          data-testid="act-lay"
          :disabled="busy"
          @click="
            act(
              () => endpoints.roachLay(restId, picked!.no),
              t.friends.rest.roachLaid,
              t.friends.rest.layFailed,
            )
          "
        >
          {{ t.friends.rest.lay }}
        </button>
      </template>
      <!-- 同一家好友店每人每天灭的只数有上限（问题记录 374）：灭够了不放按钮，写明原因 -->
      <span
        v-else-if="picked.customer === 3 && picked.roachBy !== mine && rest.killLeft === 0"
        class="text-muted"
        data-testid="kill-done"
        >{{ t.friends.rest.killDone }}</span
      >
      <template v-else-if="picked.customer === 3 && picked.roachBy !== mine">
        <button
          class="btn btn-sm btn-success"
          data-testid="act-kill"
          :disabled="busy"
          @click="
            act(
              () => endpoints.roachKill(restId, picked!.no),
              t.friends.rest.roachKilled,
              t.friends.rest.killFailed,
            )
          "
        >
          {{ t.friends.rest.kill }}
        </button>
        <span v-if="rest.killLeft !== null" class="text-muted ms-2" data-testid="kill-left">{{
          t.friends.rest.killLeft(rest.killLeft)
        }}</span>
      </template>
      <!-- 自己放的蟑螂要写明原因，不写笼统的“不能操作”（问题记录 374） -->
      <span v-else-if="picked.customer === 3" class="text-muted" data-testid="own-roach">{{
        t.friends.rest.ownRoach
      }}</span>
      <span v-else class="text-muted">{{ t.friends.rest.tableLocked }}</span>
    </div>
  </template>
</template>
