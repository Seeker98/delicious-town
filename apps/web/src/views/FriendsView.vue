<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { FriendRequestDto, FriendsDto, RestBriefDto, RestLogDto, ThumbTodayDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { activeLocale } from '../i18n';
import GameImg from '../components/GameImg.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useFriendsStore } from '../stores/friends';
import { useToastStore } from '../stores/toast';
import { describeFeed } from '../utils/feed';

type Tab = 'friends' | 'requests' | 'find' | 'feed';
const toast = useToastStore();
const t = useT();
const TABS = ['friends', 'requests', 'find', 'feed'] as const;
const feedTime = (iso: string) => new Date(iso).toLocaleString(activeLocale(), { hour12: false });
const catalog = useCatalogStore();
const friendsStore = useFriendsStore();
const tab = ref<Tab>('friends');
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
  friendsStore.pending = requests.value.length;
}
/**
 * 切标签读取：不走 run 的忙碌拦截（以前列表还在读时点别的标签，标签切过去了却不读，好友 e2e 偶发失败就是这个）；
 * 用读取序号丢弃过期的结果
 */
let seq = 0;
async function show(next: Tab) {
  tab.value = next;
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
        friendsStore.pending = v.length;
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
      }
    }
  } catch (e) {
    if (mine === seq) toast.push(errorMessage(e, t.value.common.loadFailed), 'danger');
  }
}

function respond(r: FriendRequestDto, accept: boolean) {
  return run(async () => {
    await endpoints.friendRespond(r.id, accept);
    toast.push(accept ? t.value.friends.becameFriends(r.name) : t.value.friends.rejected);
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
      toast.push(t.value.friends.becameFriends(r.name));
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

onMounted(() => show('friends'));
</script>

<template>
  <ul class="nav nav-tabs mb-2">
    <li v-for="k in TABS" :key="k" class="nav-item">
      <button :class="['nav-link', { active: tab === k }]" :data-testid="`tab-${k}`" @click="show(k)">
        {{ t.friends.tabs[k]
        }}<span v-if="k === 'requests' && friendsStore.pending > 0" class="badge bg-danger ms-1">{{
          friendsStore.pending
        }}</span>
      </button>
    </li>
  </ul>

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
      <GameImg
        :path="`avatar/${f.avatar ?? 0}`"
        :alt="f.name"
        fallback-icon="bi-person-circle"
        class="me-1 flex-shrink-0"
      />
      <!-- 问题记录 168：店名、等级、状态压到一行 -->
      <div class="flex-fill dt-friend-line small">
        <b>{{ f.name }}</b>
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
        {{ r.name }} <span class="text-muted small">{{ t.friends.level(r.level) }}</span>
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
          {{ r.name }} <span class="text-muted small">{{ t.friends.levelStar(r.level, r.star) }}</span>
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
    <div v-for="(f, i) in feed" :key="i" class="border-bottom py-1 small">
      <span class="text-muted me-2">{{ feedTime(f.at) }}</span>
      {{ describeFeed(f, (id) => catalog.foodName(id)) }}
    </div>
  </template>
</template>
