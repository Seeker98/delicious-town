<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import type { FriendRestDto, TableDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import GameImg from '../components/GameImg.vue';
import TableGrid from '../components/TableGrid.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';
import { GRADE_NAMES, PART_NAMES } from '../utils/labels';

const route = useRoute();
const router = useRouter();
const toast = useToastStore();
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
    error.value = errorMessage(e, '读取餐厅失败');
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

function refuel(num: number) {
  return act(() => endpoints.friendRefuel(restId.value, num), '加油成功', '加油失败');
}
function remove() {
  if (!rest.value || !window.confirm(`确定删除好友「${rest.value.name}」吗？`)) return;
  return act(
    async () => {
      await endpoints.friendRemove(restId.value);
      await router.push('/friends');
    },
    '已删除好友',
    '删除失败',
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
        <div class="fw-bold">{{ rest.name }}</div>
        <div class="small text-muted">
          {{ rest.level }} 级 · {{ rest.star }} 星 · 声望 {{ rest.renown
          }}<span v-if="rest.state !== 1"> · 停业中</span>
        </div>
      </div>
      <GameImg :path="`door/${rest.door}`" alt="门" fallback-icon="bi-door-closed" />
    </div>
    <div v-if="rest.icons.length > 0" class="mb-2">
      <span v-for="i in rest.icons" :key="i.key" class="badge bg-warning text-dark me-1">{{ i.title }}</span>
    </div>
    <div v-if="rest.equips.length > 0" class="small mb-2" data-testid="friend-equips">
      厨具：
      <span v-for="e in rest.equips" :key="e.part" class="me-2">
        {{ PART_NAMES[e.part] }} {{ catalog.goodsName(e.goodsId) }}{{ e.stress > 0 ? ` +${e.stress}` : '' }}
      </span>
    </div>
    <div
      v-if="rest.special"
      class="border rounded p-2 mb-2 small d-flex align-items-center"
      data-testid="friend-special"
    >
      <div class="flex-fill">
        特色菜：<b>{{ catalog.mcName(rest.special.mcId) }}</b> {{ GRADE_NAMES[rest.special.grade] }} · 剩
        {{ rest.special.leftNum }} 份 · 每份 {{ rest.special.price }} 银币
      </div>
      <button
        v-if="rest.id !== mine"
        class="btn btn-sm btn-outline-success"
        data-testid="act-taste"
        :disabled="busy || rest.special.eaten || rest.state !== 1"
        @click="act(() => endpoints.mcTaste(restId), '品尝成功，体力增加了', '品尝失败')"
      >
        {{ rest.special.eaten ? '已品尝' : '品尝' }}
      </button>
    </div>
    <div v-if="rest.notice" class="border rounded p-2 mb-2 small" style="white-space: pre-wrap">
      {{ rest.notice }}
    </div>

    <div v-if="rest.isFriend" class="d-flex flex-wrap gap-1 mb-2" data-testid="act-bar">
      <button
        class="btn btn-sm btn-outline-primary"
        :disabled="busy || rest.thumbedToday"
        @click="act(() => endpoints.thumbUp(restId), '点赞成功', '点赞失败')"
      >
        {{ rest.thumbedToday ? '已点赞' : '点赞' }}
      </button>
      <button class="btn btn-sm btn-outline-primary" :disabled="busy" @click="refuel(-1)">帮它加满油</button>
      <RouterLink class="btn btn-sm btn-outline-primary" :to="`/friends/${restId}/flip`">翻橱柜</RouterLink>
      <RouterLink class="btn btn-sm btn-outline-primary" :to="`/friends/${restId}/exchange`"
        >换食材</RouterLink
      >
      <button v-if="!rest.npc" class="btn btn-sm btn-outline-danger ms-auto" :disabled="busy" @click="remove">
        删除好友
      </button>
    </div>
    <div v-else-if="rest.id !== mine" class="mb-2">
      <button
        class="btn btn-sm btn-primary"
        data-testid="add-friend"
        :disabled="busy || rest.requested"
        @click="act(() => endpoints.friendApply(restId), '申请已发出', '申请失败')"
      >
        {{ rest.requested ? '已申请' : '加好友' }}
      </button>
    </div>

    <TableGrid :tables="rest.tables" :selected="picked?.no ?? null" @pick="(t) => (picked = t)" />

    <div v-if="picked && rest.isFriend" class="border rounded p-2 mt-2 small">
      <div class="mb-1">第 {{ picked.no }} 桌</div>
      <template v-if="isEmpty(picked)">
        <button
          class="btn btn-sm btn-primary me-1"
          data-testid="act-dine"
          :disabled="busy"
          @click="act(() => endpoints.dineStart(restId, picked!.no), '开始白食', '白食失败')"
        >
          白食
        </button>
        <button
          class="btn btn-sm btn-outline-danger"
          data-testid="act-lay"
          :disabled="busy"
          @click="act(() => endpoints.roachLay(restId, picked!.no), '放了一只蟑螂', '放蟑螂失败')"
        >
          放蟑螂
        </button>
      </template>
      <button
        v-else-if="picked.customer === 3 && picked.roachBy !== mine"
        class="btn btn-sm btn-success"
        data-testid="act-kill"
        :disabled="busy"
        @click="act(() => endpoints.roachKill(restId, picked!.no), '消灭了蟑螂', '灭蟑螂失败')"
      >
        消灭蟑螂
      </button>
      <span v-else class="text-muted">这张桌现在不能操作</span>
    </div>
  </template>
</template>
