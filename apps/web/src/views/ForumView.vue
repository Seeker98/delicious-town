<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { gameDateTime } from '../utils/format';
import { RouterLink, useRouter } from 'vue-router';
import { FORUM_TABS, type ForumListDto, type ForumPostItemDto, type ForumTab } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';
import { useCountdown } from '../utils/countdown';

/** 论坛列表（子项目 4E-3 设计文档 §5） */
const TABS = FORUM_TABS;
const t = useT();
const toast = useToastStore();
const router = useRouter();
const tab = ref<ForumTab>('all');
const q = ref('');
const searched = ref('');
const pinned = ref<ForumPostItemDto[]>([]);
const items = ref<ForumPostItemDto[]>([]);
const cursor = ref<string | null>(null);
const me = ref<ForumListDto['me'] | null>(null);
const loading = ref(false);
/** 发帖冷却还剩几秒（PR31 遗留：服务端给了时间，前端要显示） */
const serverNow = ref<string | null>(null);
const postWait = useCountdown(
  () => me.value?.postReadyAt,
  () => serverNow.value,
);

const when = (iso: string) =>
  gameDateTime(iso, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** 读取序号：新请求覆盖旧请求，过期的响应直接丢弃（不拒绝新请求，切标签不会停在旧列表） */
let seq = 0;
async function load(more = false) {
  if (more && loading.value) return;
  const mine = ++seq;
  loading.value = true;
  try {
    const query = {
      tab: tab.value,
      ...(searched.value ? { q: searched.value } : {}),
      ...(more && cursor.value ? { cursor: cursor.value } : {}),
    };
    const r = await endpoints.forumList(query);
    if (mine !== seq) return;
    if (!more) pinned.value = r.pinned;
    items.value = more ? [...items.value, ...r.items] : r.items;
    cursor.value = r.nextCursor;
    me.value = r.me;
    serverNow.value = r.now;
  } catch (e) {
    if (mine === seq) toast.push(errorMessage(e, t.value.forum.loadFailed), 'danger');
  } finally {
    if (mine === seq) loading.value = false;
  }
}
function search() {
  searched.value = q.value.trim();
  void load();
}
watch(tab, () => void load());
onMounted(() => void load());
</script>

<template>
  <div class="dt-page-title">
    <h5>{{ t.forum.title }}</h5>
    <span class="d-flex align-items-center gap-2">
      <small v-if="me && !me.canPost" class="dt-meta">{{ t.forum.verifyToPost }}</small>
      <small v-else-if="postWait > 0" class="dt-meta" data-testid="forum-wait">{{
        t.forum.postWait(postWait)
      }}</small>
      <button
        class="btn btn-sm btn-primary"
        :disabled="!me?.canPost || postWait > 0"
        data-testid="forum-new"
        @click="router.push('/forum/new')"
      >
        {{ t.forum.newPost }}
      </button>
    </span>
  </div>
  <div class="dt-pills mb-2">
    <a
      v-for="x in TABS"
      :key="x"
      href="#"
      :class="{ active: tab === x }"
      :aria-current="tab === x ? 'true' : undefined"
      :data-testid="`forum-tab-${x}`"
      @click.prevent="tab = x"
      >{{ t.forum.tabs[x] }}</a
    >
  </div>
  <input
    v-model="q"
    type="search"
    class="form-control form-control-sm mb-2"
    :placeholder="t.forum.searchPlaceholder"
    maxlength="20"
    data-testid="forum-q"
    @keyup.enter="search"
  />
  <div v-if="!loading && pinned.length === 0 && items.length === 0" class="dt-empty">{{ t.forum.empty }}</div>
  <RouterLink
    v-for="p in [...pinned, ...items]"
    :key="p.id"
    :to="`/forum/${p.id}`"
    class="dt-item text-decoration-none"
    :data-testid="`forum-item-${p.id}`"
  >
    <div class="dt-item-main">
      <div class="dt-item-title">
        <span v-if="p.pinned" class="badge bg-danger me-1">{{ t.forum.pinned }}</span>
        <span v-if="p.featured" class="badge bg-warning text-dark me-1">{{ t.forum.featured }}</span>
        <span class="badge bg-light text-dark border me-1">{{ t.forum.categories[p.category] }}</span>
        {{ p.title }}
      </div>
      <div class="dt-meta dt-clamp1">{{ p.excerpt }}</div>
      <div class="dt-meta">
        {{ t.forum.itemMeta(p.restName, when(p.activeAt), p.readNum, p.upNum, p.replyCount) }}
      </div>
    </div>
  </RouterLink>
  <button
    v-if="cursor"
    class="btn btn-sm btn-outline-primary w-100 mt-2"
    :disabled="loading"
    data-testid="forum-more"
    @click="load(true)"
  >
    {{ t.common.loadMore }}
  </button>
</template>
