<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import type { FriendRequestDto, FriendsDto, RestBriefDto, RestLogDto, ThumbTodayDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import GameImg from '../components/GameImg.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useFriendsStore } from '../stores/friends';
import { useToastStore } from '../stores/toast';
import { describeFeed } from '../utils/feed';

type Tab = 'friends' | 'requests' | 'find' | 'feed';
const toast = useToastStore();
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
async function show(t: Tab) {
  tab.value = t;
  const mine = ++seq;
  try {
    if (t === 'friends') {
      const v = await endpoints.friendList(sort.value);
      if (mine === seq) list.value = v;
    }
    if (t === 'requests') {
      const v = await endpoints.friendRequests();
      if (mine === seq) {
        requests.value = v;
        friendsStore.pending = v.length;
      }
    }
    if (t === 'find') {
      const v = await endpoints.friendStreet();
      if (mine === seq) street.value = v;
    }
    if (t === 'feed') {
      const [f, th] = await Promise.all([endpoints.friendFeed(), endpoints.thumbsToday()]);
      if (mine === seq) {
        feed.value = f.items;
        thumbs.value = th;
      }
    }
  } catch (e) {
    if (mine === seq) toast.push(errorMessage(e, '读取失败'), 'danger');
  }
}

function respond(r: FriendRequestDto, accept: boolean) {
  return run(async () => {
    await endpoints.friendRespond(r.id, accept);
    toast.push(accept ? `你和「${r.name}」成为了好友` : '已拒绝');
    await loadRequests();
  }, '处理申请失败');
}

function search() {
  if (!q.value.trim()) return;
  return run(async () => {
    found.value = await endpoints.friendSearch(q.value.trim());
    if (found.value.length === 0) toast.push('没有找到这家餐厅', 'info');
  }, '搜索失败');
}

function apply(r: RestBriefDto) {
  return run(async () => {
    const res = await endpoints.friendApply(r.id);
    if (res.status === 'friends') {
      r.isFriend = true;
      toast.push(`你和「${r.name}」成为了好友`);
    } else {
      r.requested = true;
      toast.push('申请已发出');
    }
  }, '申请失败');
}

function returnAll() {
  return run(async () => {
    const r = await endpoints.thumbsReturnAll();
    toast.push(`回赞了 ${r.ok.length} 人${r.failed.length > 0 ? `，${r.failed.length} 人没成功` : ''}`);
    thumbs.value = await endpoints.thumbsToday();
  }, '回赞失败');
}

onMounted(() => show('friends'));
</script>

<template>
  <ul class="nav nav-tabs mb-2">
    <li
      v-for="[k, label] in [
        ['friends', '好友'],
        ['requests', '申请'],
        ['find', '找好友'],
        ['feed', '动态'],
      ]"
      :key="k"
      class="nav-item"
    >
      <button
        :class="['nav-link', { active: tab === k }]"
        :data-testid="`tab-${k}`"
        @click="show(k as 'friends' | 'requests' | 'find' | 'feed')"
      >
        {{ label
        }}<span v-if="k === 'requests' && friendsStore.pending > 0" class="badge bg-danger ms-1">{{
          friendsStore.pending
        }}</span>
      </button>
    </li>
  </ul>

  <template v-if="tab === 'friends' && list">
    <div class="d-flex justify-content-between align-items-center mb-2 small">
      <span>好友 {{ list.count }}/{{ list.max }}</span>
      <select v-model="sort" class="form-select form-select-sm w-auto" @change="show('friends')">
        <option value="level">按等级</option>
        <option value="star">按星级</option>
        <option value="recent">最近加的</option>
      </select>
    </div>
    <p v-if="list.items.length === 0" class="text-muted small">还没有好友，去"找好友"看看吧。</p>
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
        <span class="text-muted ms-1">{{ f.level }} 级 · {{ f.star }} 星</span>
        <span v-if="f.roaches > 0" class="text-muted ms-2">蟑螂 {{ f.roaches }}</span>
        <span v-if="f.dineSeat" class="text-muted ms-2">可白食</span>
        <span v-if="f.flipReady > 0" class="text-muted ms-2">可翻橱 {{ f.flipReady }}</span>
      </div>
    </RouterLink>
  </template>

  <template v-if="tab === 'requests'">
    <p v-if="requests.length === 0" class="text-muted small">没有新的好友申请。</p>
    <div
      v-for="r in requests"
      :key="r.id"
      class="d-flex align-items-center border rounded p-2 mb-1"
      :data-testid="`request-${r.id}`"
    >
      <div class="flex-fill">
        {{ r.name }} <span class="text-muted small">{{ r.level }} 级</span>
      </div>
      <button
        class="btn btn-sm btn-primary me-1"
        :data-testid="`accept-${r.id}`"
        :disabled="busy"
        @click="respond(r, true)"
      >
        同意
      </button>
      <button class="btn btn-sm btn-outline-secondary" :disabled="busy" @click="respond(r, false)">
        拒绝
      </button>
    </div>
  </template>

  <template v-if="tab === 'find'">
    <form class="d-flex mb-2" data-testid="search-form" @submit.prevent="search">
      <input
        v-model="q"
        class="form-control me-1"
        placeholder="餐厅名称"
        maxlength="20"
        data-testid="search-input"
      />
      <button class="btn btn-primary text-nowrap" :disabled="busy">搜索</button>
    </form>
    <div v-for="(group, gi) in [found, street]" :key="gi">
      <h6 v-if="gi === 1 && street.length > 0" class="mt-3">同街道的餐厅</h6>
      <div v-for="r in group" :key="r.id" class="d-flex align-items-center border rounded p-2 mb-1">
        <RouterLink :to="`/friends/${r.id}`" class="flex-fill text-decoration-none">
          {{ r.name }} <span class="text-muted small">{{ r.level }} 级 · {{ r.star }} 星</span>
        </RouterLink>
        <span v-if="r.isFriend" class="small text-muted">已是好友</span>
        <button
          v-else
          class="btn btn-sm btn-outline-primary"
          :data-testid="`apply-${r.id}`"
          :disabled="busy || r.requested"
          @click="apply(r)"
        >
          {{ r.requested ? '已申请' : '加好友' }}
        </button>
      </div>
    </div>
  </template>

  <template v-if="tab === 'feed'">
    <div class="d-flex justify-content-between align-items-center mb-2">
      <span class="small">今天 {{ thumbs.length }} 人给你点赞</span>
      <button
        class="btn btn-sm btn-outline-primary"
        data-testid="return-all"
        :disabled="busy || thumbs.every((x) => x.returned)"
        @click="returnAll"
      >
        一键回赞
      </button>
    </div>
    <p v-if="feed.length === 0" class="text-muted small">最近 3 天没有动态。</p>
    <div v-for="(f, i) in feed" :key="i" class="border-bottom py-1 small">
      <span class="text-muted me-2">{{ new Date(f.at).toLocaleString('zh-CN', { hour12: false }) }}</span>
      {{ describeFeed(f, (id) => catalog.foodName(id)) }}
    </div>
  </template>
</template>
