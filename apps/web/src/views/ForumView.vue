<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { gameDateTime } from '../utils/format';
import { RouterLink, useRouter } from 'vue-router';
import { FORUM_TABS, type ForumListDto, type ForumPostItemDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import DtTabs from '../components/DtTabs.vue';
import { useT } from '../composables/useT';
import { useTabQuery } from '../composables/useTabQuery';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';
import { useCountdown } from '../utils/countdown';

/** 论坛列表（子项目 4E-3 设计文档 §5） */
const TABS = FORUM_TABS;
const t = useT();
const toast = useToastStore();
const router = useRouter();
/** 当前标签写进网址（界面改版 P2b：统一标签页） */
const tab = useTabQuery({ tabs: TABS });
const tabItems = computed(() => TABS.map((k) => ({ key: k, label: t.value.forum.tabs[k] })));
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
  <!-- 分类是一级标签（界面改版 P2b，原来是胶囊） -->
  <DtTabs v-model="tab" :tabs="tabItems" testid-prefix="forum-tab-" />
  <!-- 搜索框和“发帖”一行（界面改版 P10）；不能发帖时下面一行灰字写原因 -->
  <div class="dt-forum-bar">
    <label class="dt-search-box">
      <i class="bi bi-search" aria-hidden="true"></i>
      <input
        v-model="q"
        type="search"
        :placeholder="t.forum.searchPlaceholder"
        :aria-label="t.forum.searchPlaceholder"
        maxlength="20"
        data-testid="forum-q"
        @keyup.enter="search"
      />
    </label>
    <button
      type="button"
      class="btn btn-primary dt-forum-new"
      :disabled="!me?.canPost || postWait > 0"
      data-testid="forum-new"
      @click="router.push('/forum/new')"
    >
      <i class="bi bi-pencil" aria-hidden="true"></i> {{ t.forum.newPost }}
    </button>
  </div>
  <p v-if="me && !me.canPost" class="dt-block-note mt-1">{{ t.forum.verifyToPost }}</p>
  <p v-else-if="postWait > 0" class="dt-block-note mt-1" data-testid="forum-wait">
    {{ t.forum.postWait(postWait) }}
  </p>
  <div v-if="!loading && pinned.length === 0 && items.length === 0" class="dt-card dt-up-max mt-2">
    {{ t.forum.empty }}
  </div>
  <div v-else class="dt-card dt-forum-list mt-2">
    <RouterLink
      v-for="p in [...pinned, ...items]"
      :key="p.id"
      :to="`/forum/${p.id}`"
      :class="['dt-forum-item', { 'is-pinned': p.pinned }]"
      :data-testid="`forum-item-${p.id}`"
    >
      <span class="dt-forum-title">
        <span v-if="p.pinned" class="dt-tag dt-tag-danger">{{ t.forum.pinned }}</span>
        <span v-if="p.featured" class="dt-tag dt-tag-warn">{{ t.forum.featured }}</span>
        <span class="dt-tag dt-tag-mute">{{ t.forum.categories[p.category] }}</span>
        {{ p.title }}
      </span>
      <span class="dt-forum-excerpt">{{ p.excerpt }}</span>
      <span class="dt-forum-foot">
        <span class="dt-forum-who">{{ t.forum.whoWhen(p.restName, when(p.activeAt)) }}</span>
        <span class="dt-forum-nums">
          <span :aria-label="t.forum.readN(p.readNum)"
            ><i class="bi bi-eye" aria-hidden="true"></i> {{ p.readNum }}</span
          >
          <span :aria-label="t.forum.upN(p.upNum)"
            ><i class="bi bi-hand-thumbs-up" aria-hidden="true"></i> {{ p.upNum }}</span
          >
          <span :aria-label="t.forum.replyN(p.replyCount)"
            ><i class="bi bi-chat-square" aria-hidden="true"></i> {{ p.replyCount }}</span
          >
        </span>
      </span>
    </RouterLink>
  </div>
  <button
    v-if="cursor"
    type="button"
    class="btn btn-light dt-btn-block mt-2"
    :disabled="loading"
    data-testid="forum-more"
    @click="load(true)"
  >
    {{ t.common.loadMore }}
  </button>
</template>
