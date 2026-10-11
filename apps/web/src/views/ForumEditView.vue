<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { FORUM_CATEGORIES, type ForumCategory } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { usePageTitle } from '../stores/pageTitle';
import { useToastStore } from '../stores/toast';

/** 发帖和编辑（子项目 4E-3 设计文档 §5） */
const route = useRoute();
const router = useRouter();
const toast = useToastStore();
const t = useT();
const editId = computed(() => (route.params.id ? Number(route.params.id) : null));
/** 顶栏标题：发新帖 / 编辑（界面改版 P2a） */
usePageTitle(() => (editId.value === null ? t.value.forum.edit.newTitle : t.value.forum.edit.editTitle));
const category = ref<ForumCategory>('chat');
const title = ref('');
const content = ref('');
const busy = ref(false);
/** 按字符计（emoji 算 1，和服务端一致）；不用 maxlength，它按 UTF-16 计会把 emoji 提前截断（PR31 遗留） */
const TITLE_MAX = 40;
const CONTENT_MAX = 5000;
const titleLen = computed(() => [...title.value.trim()].length);
const contentLen = computed(() => [...content.value.trim()].length);
const ok = computed(
  () =>
    titleLen.value > 0 &&
    titleLen.value <= TITLE_MAX &&
    contentLen.value > 0 &&
    contentLen.value <= CONTENT_MAX,
);

onMounted(async () => {
  if (editId.value === null) return;
  try {
    // 只取正文：不记阅读、不带回复（PR31 遗留）
    const d = await endpoints.forumSource(editId.value);
    category.value = d.category;
    title.value = d.title;
    content.value = d.content;
  } catch (e) {
    toast.push(errorMessage(e, t.value.forum.post.loadFailed), 'danger');
  }
});

async function submit() {
  if (busy.value) return;
  busy.value = true;
  try {
    const body = { category: category.value, title: title.value, content: content.value };
    const r =
      editId.value === null
        ? await endpoints.forumCreate(body)
        : await endpoints.forumEdit(editId.value, body);
    await router.push(`/forum/${r.id}`);
  } catch (e) {
    toast.push(errorMessage(e, t.value.forum.edit.failed), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <!-- 发帖、编辑（界面改版 P10）：分类分段、标题框、正文框各带字数，整宽“发布” -->
  <div class="dt-field-label-top mt-0" id="dt-forum-cat">{{ t.forum.edit.category }}</div>
  <div class="dt-seg" role="radiogroup" aria-labelledby="dt-forum-cat">
    <button
      v-for="c in FORUM_CATEGORIES"
      :key="c"
      type="button"
      role="radio"
      :aria-checked="category === c"
      :aria-pressed="category === c"
      :data-testid="`edit-cat-${c}`"
      @click="category = c"
    >
      {{ t.forum.categories[c] }}
    </button>
  </div>
  <label class="dt-field-label-top" for="dt-forum-title">{{ t.forum.edit.titleLabel }}</label>
  <div :class="['dt-field', { 'is-over': titleLen > TITLE_MAX }]">
    <input
      id="dt-forum-title"
      v-model="title"
      class="dt-field-input"
      :placeholder="t.forum.edit.titlePlaceholder"
      data-testid="edit-title"
    />
  </div>
  <div :class="['dt-area-count', { 'is-over': titleLen > TITLE_MAX }]" data-testid="edit-title-count">
    {{ titleLen }} / {{ TITLE_MAX }}
  </div>
  <label class="dt-field-label-top mt-2" for="dt-forum-content">{{ t.forum.edit.contentLabel }}</label>
  <div class="dt-area">
    <textarea
      id="dt-forum-content"
      v-model="content"
      rows="12"
      :placeholder="t.forum.edit.contentPlaceholder"
      data-testid="edit-content"
    ></textarea>
  </div>
  <div :class="['dt-area-count', { 'is-over': contentLen > CONTENT_MAX }]">
    {{ contentLen }} / {{ CONTENT_MAX }}
  </div>
  <button
    type="button"
    class="btn btn-primary dt-btn-block mt-3"
    :disabled="busy || !ok"
    data-testid="edit-submit"
    @click="submit"
  >
    {{ t.forum.edit.publish }}
  </button>
  <p class="dt-block-note mt-2">{{ t.forum.edit.note }}</p>
</template>
