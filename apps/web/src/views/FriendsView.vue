<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import type { FriendRequestDto, FriendsDto, RestBriefDto, RestLogDto, ThumbTodayDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import DtArt from '../components/DtArt.vue';
import DtAvatar from '../components/DtAvatar.vue';
import DtEmpty from '../components/DtEmpty.vue';
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
import { restAva } from '../utils/restAva';
import { useCatalogStore } from '../stores/catalog';
import { gameDateTime } from '../utils/format';

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
const catalog = useCatalogStore();
// 头像图要目录里的外观表
void catalog.load();
/** 头像（界面改版 P10）：蟹老板画蟹老板，别的店画它选的头像 */
const ava = (id: number, avatar: number | null) => restAva(id, avatar, (x) => catalog.avatarArt(x));
const when = (iso: string) =>
  gameDateTime(iso, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
/** 找好友页“同街道的餐厅”右边写我在哪条街 */
const streetLabel = computed(() => {
  const r = restStore.rest;
  return r ? catalog.streetName(r.streetId, r.streetName) : '';
});

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
    const f = t.value.friends;
    // 声望为负时一家也回不了；别的失败多半是不是好友了、同一网络今天已有人赞过（代码审查 2026-10-19）
    const why = r.failed.some((x) => x.reason === 'renown')
      ? f.returnWhy.renown
      : r.failed.length > 0
        ? f.returnWhy.other
        : '';
    toast.push(
      f.returned(r.ok.length, r.failed.length) + why,
      r.failed.length > 0 && r.ok.length === 0 ? 'info' : undefined,
    );
    thumbs.value = await endpoints.thumbsToday();
  }, t.value.friends.returnFailed);
}

// 读取跟着当前标签走：地址带 ?tab= 直接打开（首页餐厅动态的“全部”带 ?tab=feed，问题记录 553），
// 在这页点底部导航“好友”换了网址也会读（终审 I3：原来组件不重挂、列表是空白）
watch(tab, (k) => void show(k), { immediate: true });
</script>

<template>
  <DtTabs v-model="tab" :tabs="tabItems" />

  <!-- 我的好友（界面改版 P10）：头像、加粗店名和等级星级，能做的事写成小标签；整行点进好友餐厅 -->
  <template v-if="tab === 'friends' && list">
    <div class="dt-friends-head">
      <b>{{ t.friends.count(list.count, list.max) }}</b>
      <span class="dt-select-pill">
        <select
          v-model="sort"
          :aria-label="t.friends.sortLabel"
          data-testid="friend-sort"
          @change="show('friends')"
        >
          <option value="level">{{ t.friends.sorts.level }}</option>
          <option value="star">{{ t.friends.sorts.star }}</option>
          <option value="recent">{{ t.friends.sorts.recent }}</option>
        </select>
      </span>
    </div>
    <DtEmpty
      v-if="list.items.length === 0"
      art="empty-friends"
      :title="t.friends.emptyTitle"
      :body="t.friends.emptyBody"
      data-testid="friends-empty"
      ><button type="button" class="btn btn-sm btn-outline-primary" @click="tab = 'find'">
        {{ t.friends.tabs.find }}
      </button></DtEmpty
    >
    <div v-else class="dt-card dt-rows-card">
      <RouterLink
        v-for="f in list.items"
        :key="f.id"
        :to="`/friends/${f.id}`"
        class="dt-row is-link dt-friend-row"
        :data-testid="`friend-row-${f.id}`"
      >
        <span class="dt-friend-ava"><DtAvatar :art="ava(f.id, f.avatar)" :frame="f.frame" :size="40" /></span>
        <span class="dt-row-main">
          <span class="dt-row-title is-strong"
            >{{ restName(f.id, f.name)
            }}<span class="dt-row-meta">{{ t.friends.levelStar(f.level, f.star) }}</span></span
          >
          <span v-if="f.roaches > 0 || f.dineSeat || f.flipReady > 0" class="dt-friend-tags">
            <span v-if="f.roaches > 0" class="dt-tag dt-tag-danger">{{ t.friends.roaches(f.roaches) }}</span>
            <span v-if="f.dineSeat" class="dt-tag dt-tag-ok">{{ t.friends.canDine }}</span>
            <span v-if="f.flipReady > 0" class="dt-tag dt-tag-primary">{{
              t.friends.canFlip(f.flipReady)
            }}</span>
          </span>
          <span v-else class="dt-row-sub">{{ t.friends.nothing }}</span>
        </span>
      </RouterLink>
    </div>
  </template>

  <template v-if="tab === 'requests'">
    <div v-if="requests.length === 0" class="dt-card dt-up-max">{{ t.friends.noRequests }}</div>
    <div v-else class="dt-card dt-rows-card">
      <div v-for="r in requests" :key="r.id" class="dt-row dt-friend-row" :data-testid="`request-${r.id}`">
        <span class="dt-friend-ava"><DtAvatar :art="ava(r.id, r.avatar)" :frame="r.frame" :size="40" /></span>
        <span class="dt-row-main">
          <span class="dt-row-title is-strong"
            >{{ restName(r.id, r.name)
            }}<span class="dt-row-meta">{{ t.friends.levelStar(r.level, r.star) }}</span></span
          >
          <span class="dt-row-sub">{{ t.friends.appliedAt(when(r.at)) }}</span>
        </span>
        <span class="dt-row-end dt-friend-acts">
          <button
            type="button"
            class="btn btn-sm btn-light"
            :disabled="busy"
            :data-testid="`reject-${r.id}`"
            @click="respond(r, false)"
          >
            {{ t.friends.reject }}
          </button>
          <button
            type="button"
            class="btn btn-sm btn-primary"
            :data-testid="`accept-${r.id}`"
            :disabled="busy"
            @click="respond(r, true)"
          >
            {{ t.friends.accept }}
          </button>
        </span>
      </div>
    </div>
  </template>

  <template v-if="tab === 'find'">
    <form class="dt-forum-bar" data-testid="search-form" @submit.prevent="search">
      <label class="dt-search-box">
        <i class="bi bi-search" aria-hidden="true"></i>
        <input
          v-model="q"
          type="search"
          :placeholder="t.friends.searchPlaceholder"
          :aria-label="t.friends.searchPlaceholder"
          maxlength="20"
          data-testid="search-input"
        />
      </label>
      <button type="submit" class="btn btn-primary dt-forum-new" :disabled="busy">
        {{ t.friends.search }}
      </button>
    </form>
    <template v-for="(group, gi) in [found, street]" :key="gi">
      <div v-if="gi === 1 && street.length > 0" class="dt-block-head mt-3">
        <h2 class="dt-block-title">{{ t.friends.sameStreet }}</h2>
        <span class="dt-block-more">{{ streetLabel }}</span>
      </div>
      <div v-if="group.length > 0" :class="['dt-card dt-rows-card', { 'mt-2': gi === 0 }]">
        <div v-for="r in group" :key="r.id" class="dt-row dt-friend-row" :data-testid="`found-${r.id}`">
          <span class="dt-friend-ava"
            ><DtAvatar :art="ava(r.id, r.avatar)" :frame="r.frame" :size="40"
          /></span>
          <span class="dt-row-main">
            <RouterLink :to="`/friends/${r.id}`" class="dt-row-title is-strong dt-friend-link"
              >{{ restName(r.id, r.name)
              }}<span class="dt-row-meta">{{ t.friends.levelStar(r.level, r.star) }}</span></RouterLink
            >
          </span>
          <span class="dt-row-end">
            <span v-if="r.isFriend" class="dt-tag dt-tag-ok">{{ t.friends.alreadyFriend }}</span>
            <span v-else-if="r.requested" class="dt-tag dt-tag-mute">{{ t.friends.requested }}</span>
            <button
              v-else
              type="button"
              class="btn btn-sm btn-outline-primary"
              :data-testid="`apply-${r.id}`"
              :disabled="busy"
              @click="apply(r)"
            >
              {{ t.friends.addFriend }}
            </button>
          </span>
        </div>
      </div>
    </template>
  </template>

  <template v-if="tab === 'feed'">
    <div class="dt-card dt-thumbs" data-testid="thumbs-card">
      <span v-if="thumbs.length > 0" class="dt-thumbs-avas" aria-hidden="true">
        <span v-for="x in thumbs.slice(0, 3)" :key="x.restId" class="dt-thumbs-ava"
          ><DtArt :name="ava(x.restId, x.avatar)" :size="32"
        /></span>
      </span>
      <span class="dt-thumbs-main">
        <b>{{ t.friends.thumbsToday(thumbs.length) }}</b>
        <span v-if="thumbs.length > 0">{{
          t.friends.returnedN(thumbs.filter((x) => x.returned).length)
        }}</span>
      </span>
      <span v-if="thumbs.length > 0 && thumbs.every((x) => x.returned)" class="dt-tag dt-tag-ok">{{
        t.friends.allReturned
      }}</span>
      <button
        v-else-if="thumbs.length > 0"
        type="button"
        class="btn btn-sm btn-outline-primary"
        data-testid="return-all"
        :disabled="busy"
        @click="returnAll"
      >
        {{ t.friends.returnAll }}
      </button>
    </div>
    <div class="dt-block-head mt-3">
      <h2 class="dt-block-title">{{ t.friends.feedTitle }}</h2>
    </div>
    <div v-if="feed.length === 0" class="dt-card dt-up-max">{{ t.friends.noFeed }}</div>
    <!-- 和首页动态同一种行（界面改版 P2b）；文案和个人日志同一套：也有收购、老鼠这些不是好友做的事（问题记录 553） -->
    <div v-else class="dt-card dt-list-card">
      <FeedRow v-for="(f, i) in feed" :key="i" :item="f" />
    </div>
  </template>
</template>
