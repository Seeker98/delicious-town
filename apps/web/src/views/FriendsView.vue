<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import type { FriendRequestDto, FriendsDto, RestBriefDto, RestLogDto, ThumbTodayDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import DtTabs from '../components/DtTabs.vue';
import { useT } from '../composables/useT';
import { useTabQuery } from '../composables/useTabQuery';
import FeedRow from '../components/FeedRow.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useFriendsStore } from '../stores/friends';
import { useToastStore } from '../stores/toast';
import { markFeedSeen } from '../utils/feed';
import { useRestaurantStore } from '../stores/restaurant';
import { restName } from '../utils/npcName';

type Tab = 'friends' | 'requests' | 'find' | 'feed';
const toast = useToastStore();
const t = useT();
const TABS = ['friends', 'requests', 'find', 'feed'] as const;
const friendsStore = useFriendsStore();
const restStore = useRestaurantStore();
/** 当前标签写进网址（界面改版 P2b：统一标签页） */
const tab = useTabQuery({ tabs: TABS });
const tabItems = computed(() =>
  TABS.map((k) => ({
    key: k,
    label: t.value.friends.tabs[k],
    badge: k === 'requests' ? friendsStore.pending : null,
  })),
);
const sort = ref<'level' | 'star' | 'recent'>('level');
const list = ref<FriendsDto | null>(null);
const requests = ref<FriendRequestDto[]>([]);
const q = ref('');
const found = ref<RestBriefDto[]>([]);
const street = ref<RestBriefDto[]>([]);
const feed = ref<RestLogDto[]>([]);
const thumbs = ref<ThumbTodayDto[]>([]);
const busy = ref(false);

async function run(fn: () => Promise<void>, fallback: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
  } finally {
    busy.value = false;
  }
}

async function loadRequests() {
  requests.value = await endpoints.friendRequests();
  friendsStore.setPending(requests.value.length);
}
/**
 * 切标签读取：不走 run 的忙碌拦截（以前列表还在读时点别的标签，标签切过去了却不读，好友 e2e 偶发失败就是这个）；
 * 用读取序号丢弃过期的结果
 */
let seq = 0;
async function show(next: Tab) {
  const mine = ++seq;
  try {
    if (next === 'friends') {
      const v = await endpoints.friendList(sort.value);
      if (mine === seq) list.value = v;
    }
    if (next === 'requests') {
      const v = await endpoints.friendRequests();
      if (mine === seq) {
        requests.value = v;
        friendsStore.setPending(v.length);
      }
    }
    if (next === 'find') {
      const v = await endpoints.friendStreet();
      if (mine === seq) street.value = v;
    }
    if (next === 'feed') {
      const [f, th] = await Promise.all([endpoints.friendFeed(), endpoints.thumbsToday()]);
      if (mine === seq) {
        feed.value = f.items;
        thumbs.value = th;
        // 首页餐厅动态的小圆点按这个算（问题记录 553）；刷新页面直接进来时还没读过餐厅，先读（backlog 1010）
        const rest = restStore.rest ?? (await restStore.refresh().catch(() => null));
        if (rest && mine === seq) markFeedSeen(rest.id, f.items);
      }
    }
  } catch (e) {
    if (mine === seq) toast.push(errorMessage(e, t.value.common.loadFailed), 'danger');
  }
}

function respond(r: FriendRequestDto, accept: boolean) {
  return run(async () => {
    await endpoints.friendRespond(r.id, accept);
    toast.push(accept ? t.value.friends.becameFriends(restName(r.id, r.name)) : t.value.friends.rejected);
    await loadRequests();
  }, t.value.friends.respondFailed);
}

function search() {
  if (!q.value.trim()) return;
  return run(async () => {
    found.value = await endpoints.friendSearch(q.value.trim());
    if (found.value.length === 0) toast.push(t.value.friends.notFound, 'info');
  }, t.value.friends.searchFailed);
}

function apply(r: RestBriefDto) {
  return run(async () => {
    const res = await endpoints.friendApply(r.id);
    if (res.status === 'friends') {
      r.isFriend = true;
      toast.push(t.value.friends.becameFriends(restName(r.id, r.name)));
    } else {
      r.requested = true;
      toast.push(t.value.friends.applied);
    }
  }, t.value.friends.applyFailed);
}

function returnAll() {
  return run(async () => {
    const r = await endpoints.thumbsReturnAll();
    toast.push(t.value.friends.returned(r.ok.length, r.failed.length));
    thumbs.value = await endpoints.thumbsToday();
  }, t.value.friends.returnFailed);
}

// 读取跟着当前标签走：地址带 ?tab= 直接打开（首页餐厅动态的“全部”带 ?tab=feed，问题记录 553），
// 在这页点底部导航“好友”换了网址也会读（终审 I3：原来组件不重挂、列表是空白）
watch(tab, (k) => void show(k), { immediate: true });
</script>

<template>
  <DtTabs v-model="tab" :tabs="tabItems" />

  <template v-if="tab === 'friends' && list">
    <div class="d-flex justify-content-between align-items-center mb-2 small">
      <span>{{ t.friends.count(list.count, list.max) }}</span>
      <select v-model="sort" class="form-select form-select-sm w-auto" @change="show('friends')">
        <option value="level">{{ t.friends.sorts.level }}</option>
        <option value="star">{{ t.friends.sorts.star }}</option>
        <option value="recent">{{ t.friends.sorts.recent }}</option>
      </select>
    </div>
    <p v-if="list.items.length === 0" class="text-muted small">{{ t.friends.noFriends }}</p>
    <RouterLink
      v-for="f in list.items"
      :key="f.id"
      :to="`/friends/${f.id}`"
      class="d-flex align-items-center border-bottom px-1 py-1 text-decoration-none"
      :data-testid="`friend-row-${f.id}`"
    >
      <i class="bi bi-person-circle me-1 flex-shrink-0" aria-hidden="true"></i>
      <!-- 问题记录 168：店名、等级、状态压到一行 -->
      <div class="flex-fill dt-friend-line small">
        <b>{{ restName(f.id, f.name) }}</b>
        <span class="text-muted ms-1">{{ t.friends.levelStar(f.level, f.star) }}</span>
        <span v-if="f.roaches > 0" class="text-muted ms-2">{{ t.friends.roaches(f.roaches) }}</span>
        <span v-if="f.dineSeat" class="text-muted ms-2">{{ t.friends.canDine }}</span>
        <span v-if="f.flipReady > 0" class="text-muted ms-2">{{ t.friends.canFlip(f.flipReady) }}</span>
      </div>
    </RouterLink>
  </template>

  <template v-if="tab === 'requests'">
    <p v-if="requests.length === 0" class="text-muted small">{{ t.friends.noRequests }}</p>
    <div
      v-for="r in requests"
      :key="r.id"
      class="d-flex align-items-center border rounded p-2 mb-1"
      :data-testid="`request-${r.id}`"
    >
      <div class="flex-fill">
        {{ restName(r.id, r.name) }} <span class="text-muted small">{{ t.friends.level(r.level) }}</span>
      </div>
      <button
        class="btn btn-sm btn-primary me-1"
        :data-testid="`accept-${r.id}`"
        :disabled="busy"
        @click="respond(r, true)"
      >
        {{ t.friends.accept }}
      </button>
      <button class="btn btn-sm btn-outline-secondary" :disabled="busy" @click="respond(r, false)">
        {{ t.friends.reject }}
      </button>
    </div>
  </template>

  <template v-if="tab === 'find'">
    <form class="d-flex mb-2" data-testid="search-form" @submit.prevent="search">
      <input
        v-model="q"
        class="form-control me-1"
        :placeholder="t.friends.searchPlaceholder"
        maxlength="20"
        data-testid="search-input"
      />
      <button class="btn btn-primary text-nowrap" :disabled="busy">{{ t.friends.search }}</button>
    </form>
    <div v-for="(group, gi) in [found, street]" :key="gi">
      <h6 v-if="gi === 1 && street.length > 0" class="mt-3">{{ t.friends.sameStreet }}</h6>
      <div v-for="r in group" :key="r.id" class="d-flex align-items-center border rounded p-2 mb-1">
        <RouterLink :to="`/friends/${r.id}`" class="flex-fill text-decoration-none">
          {{ restName(r.id, r.name) }}
          <span class="text-muted small">{{ t.friends.levelStar(r.level, r.star) }}</span>
        </RouterLink>
        <span v-if="r.isFriend" class="small text-muted">{{ t.friends.alreadyFriend }}</span>
        <button
          v-else
          class="btn btn-sm btn-outline-primary"
          :data-testid="`apply-${r.id}`"
          :disabled="busy || r.requested"
          @click="apply(r)"
        >
          {{ r.requested ? t.friends.requested : t.friends.addFriend }}
        </button>
      </div>
    </div>
  </template>

  <template v-if="tab === 'feed'">
    <div class="d-flex justify-content-between align-items-center mb-2">
      <span class="small">{{ t.friends.thumbsToday(thumbs.length) }}</span>
      <button
        class="btn btn-sm btn-outline-primary"
        data-testid="return-all"
        :disabled="busy || thumbs.every((x) => x.returned)"
        @click="returnAll"
      >
        {{ t.friends.returnAll }}
      </button>
    </div>
    <p v-if="feed.length === 0" class="text-muted small">{{ t.friends.noFeed }}</p>
    <!-- 和首页动态同一种行（界面改版 P2b）；文案和个人日志同一套：也有收购、老鼠这些不是好友做的事（问题记录 553） -->
    <FeedRow v-for="(f, i) in feed" :key="i" :item="f" />
  </template>
</template>
