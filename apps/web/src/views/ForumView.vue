<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { FORUM_CATEGORY_NAMES, type ForumListDto, type ForumPostItemDto, type ForumTab } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';

/** 论坛列表（子项目 4E-3 设计文档 §5） */
const TABS: Array<{ key: ForumTab; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'chat', label: '闲聊' },
  { key: 'guide', label: '攻略' },
  { key: 'feedback', label: '建议反馈' },
  { key: 'featured', label: '精华' },
];
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

const when = (iso: string) =>
  new Date(iso).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

async function load(more = false) {
  if (loading.value) return;
  loading.value = true;
  try {
    const query = {
      tab: tab.value,
      ...(searched.value ? { q: searched.value } : {}),
      ...(more && cursor.value ? { cursor: cursor.value } : {}),
    };
    const r = await endpoints.forumList(query);
    if (!more) pinned.value = r.pinned;
    items.value = more ? [...items.value, ...r.items] : r.items;
    cursor.value = r.nextCursor;
    me.value = r.me;
  } catch (e) {
    toast.push(errorMessage(e, '读取论坛失败'), 'danger');
  } finally {
    loading.value = false;
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
    <h5>论坛</h5>
    <span class="d-flex align-items-center gap-2">
      <small v-if="me && !me.canPost" class="dt-meta">验证邮箱后才能发帖</small>
      <button
        class="btn btn-sm btn-primary"
        :disabled="!me?.canPost"
        data-testid="forum-new"
        @click="router.push('/forum/new')"
      >
        发帖
      </button>
    </span>
  </div>
  <div class="dt-pills mb-2">
    <a
      v-for="x in TABS"
      :key="x.key"
      href="#"
      :class="{ active: tab === x.key }"
      :aria-current="tab === x.key ? 'true' : undefined"
      :data-testid="`forum-tab-${x.key}`"
      @click.prevent="tab = x.key"
      >{{ x.label }}</a
    >
  </div>
  <input
    v-model="q"
    type="search"
    class="form-control form-control-sm mb-2"
    placeholder="搜索标题和正文，回车搜索"
    maxlength="20"
    data-testid="forum-q"
    @keyup.enter="search"
  />
  <div v-if="!loading && pinned.length === 0 && items.length === 0" class="dt-empty">还没有帖子</div>
  <RouterLink
    v-for="p in [...pinned, ...items]"
    :key="p.id"
    :to="`/forum/${p.id}`"
    class="dt-item text-decoration-none"
    :data-testid="`forum-item-${p.id}`"
  >
    <div class="dt-item-main">
      <div class="dt-item-title">
        <span v-if="p.pinned" class="badge bg-danger me-1">置顶</span>
        <span v-if="p.featured" class="badge bg-warning text-dark me-1">精</span>
        <span class="badge bg-light text-dark border me-1">{{ FORUM_CATEGORY_NAMES[p.category] }}</span>
        {{ p.title }}
      </div>
      <div class="dt-meta dt-clamp1">{{ p.excerpt }}</div>
      <div class="dt-meta">
        {{ p.restName }} · {{ when(p.activeAt) }} · 阅读 {{ p.readNum }} · 赞 {{ p.upNum }} · 回复
        {{ p.replyCount }}
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
    加载更多
  </button>
</template>
