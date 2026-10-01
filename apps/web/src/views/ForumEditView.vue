<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { FORUM_CATEGORIES, FORUM_CATEGORY_NAMES, type ForumCategory } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';

/** 发帖和编辑（子项目 4E-3 设计文档 §5） */
const route = useRoute();
const router = useRouter();
const toast = useToastStore();
const editId = computed(() => (route.params.id ? Number(route.params.id) : null));
const category = ref<ForumCategory>('chat');
const title = ref('');
const content = ref('');
const busy = ref(false);
const contentLen = computed(() => [...content.value].length);

onMounted(async () => {
  if (editId.value === null) return;
  try {
    const d = await endpoints.forumPost(editId.value);
    category.value = d.post.category;
    title.value = d.post.title;
    content.value = d.post.content;
  } catch (e) {
    toast.push(errorMessage(e, '读取帖子失败'), 'danger');
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
    toast.push(errorMessage(e, '发布失败'), 'danger');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="dt-page-title">
    <h5>{{ editId === null ? '发帖' : '编辑帖子' }}</h5>
  </div>
  <div class="mb-2">
    <label v-for="c in FORUM_CATEGORIES" :key="c" class="me-3 small">
      <input v-model="category" type="radio" :value="c" :data-testid="`edit-cat-${c}`" />
      {{ FORUM_CATEGORY_NAMES[c] }}
    </label>
  </div>
  <input
    v-model="title"
    class="form-control form-control-sm mb-2"
    maxlength="40"
    placeholder="标题（最多 40 字）"
    data-testid="edit-title"
  />
  <textarea
    v-model="content"
    class="form-control form-control-sm mb-1"
    rows="10"
    maxlength="5000"
    placeholder="正文（纯文字，最多 5000 字）"
    data-testid="edit-content"
  ></textarea>
  <div class="d-flex align-items-center">
    <span class="dt-meta">{{ contentLen }}/5000</span>
    <button class="btn btn-sm btn-primary ms-auto" :disabled="busy" data-testid="edit-submit" @click="submit">
      发布
    </button>
  </div>
</template>
