<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import {
  FORUM_CATEGORY_NAMES,
  type ForumAdminAction,
  type ForumPostDetailDto,
  type ForumReadsDto,
} from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useToastStore } from '../stores/toast';
import { useCountdown } from '../utils/countdown';

/** 帖子详情（子项目 4E-3 设计文档 §5）：正文一律按纯文字显示（文本插值 + pre-wrap，不用 v-html） */
const route = useRoute();
const router = useRouter();
const toast = useToastStore();
const id = computed(() => Number(route.params.id));
const data = ref<ForumPostDetailDto | null>(null);
const reads = ref<ForumReadsDto | null>(null);
const busy = ref(false);
const content = ref('');
const anonymous = ref(false);
const replyTo = ref<number | null>(null);
/** 回复冷却还剩几秒（PR31 遗留） */
const replyWait = useCountdown(
  () => data.value?.replyReadyAt,
  () => data.value?.now,
);

const when = (iso: string) =>
  new Date(iso).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
const REACTION = { up: '赞', down: '踩' } as const;

async function load() {
  try {
    data.value = await endpoints.forumPost(id.value);
  } catch (e) {
    toast.push(errorMessage(e, '读取帖子失败'), 'danger');
  }
}
onMounted(load);

async function run<T>(fn: () => Promise<T>, fallback: string): Promise<T | null> {
  if (busy.value) return null;
  busy.value = true;
  try {
    return await fn();
  } catch (e) {
    toast.push(errorMessage(e, fallback), 'danger');
    return null;
  } finally {
    busy.value = false;
  }
}

async function react(kind: 'up' | 'down') {
  const r = await run(() => endpoints.forumReact(id.value, kind), '操作失败');
  if (r && data.value) {
    data.value.mine = r.mine;
    data.value.post.upNum = r.up;
    data.value.post.downNum = r.down;
  }
}
async function admin(action: ForumAdminAction) {
  const r = await run(() => endpoints.forumAdmin(id.value, action), '操作失败');
  if (r?.rewarded) toast.push('已加精，作者获得了加精奖励', 'success');
  if (r) await load();
}
async function removePost() {
  if (!window.confirm('确定删除这篇帖子吗？')) return;
  const r = await run(() => endpoints.forumDelete(id.value), '删除失败');
  if (r) await router.push('/forum');
}
async function removeReply(replyId: number) {
  if (!window.confirm('确定删除这条回复吗？')) return;
  const r = await run(() => endpoints.forumDeleteReply(replyId), '删除失败');
  if (r) await load();
}
async function toggleReads() {
  if (reads.value) {
    reads.value = null;
    return;
  }
  reads.value = await run(() => endpoints.forumReads(id.value), '读取阅读明细失败');
}
async function submit() {
  const text = content.value.trim();
  if (!text) return;
  const body = {
    content: text,
    ...(replyTo.value !== null ? { replyTo: replyTo.value } : {}),
    anonymous: anonymous.value,
  };
  const r = await run(() => endpoints.forumReply(id.value, body), '回复失败');
  if (r && data.value) {
    // 直接追加，不重新读详情：重新读会刷新阅读时间，作者能拿它和匿名回复的时间对上（终审 I1）
    data.value.replies.push(r);
    data.value.post.replyCount = r.floor;
    content.value = '';
    replyTo.value = null;
  }
}
</script>

<template>
  <template v-if="data">
    <div class="dt-page-title">
      <h5 class="mb-0">{{ data.post.title }}</h5>
      <RouterLink to="/forum" class="small">返回论坛</RouterLink>
    </div>
    <div class="dt-meta mb-2">
      <span class="badge bg-light text-dark border me-1">{{ FORUM_CATEGORY_NAMES[data.post.category] }}</span>
      <span v-if="data.post.pinned" class="badge bg-danger me-1">置顶</span>
      <span v-if="data.post.featured" class="badge bg-warning text-dark me-1">精</span>
      <RouterLink :to="`/friends/${data.post.restId}`">{{ data.post.restName }}</RouterLink>
      · {{ when(data.post.createdAt)
      }}<span v-if="data.post.editedAt"> · 编辑于 {{ when(data.post.editedAt) }}</span> · 阅读
      {{ data.post.readNum }}
    </div>
    <div class="dt-card dt-post-body mb-2" data-testid="post-body">{{ data.post.content }}</div>
    <div class="d-flex flex-wrap gap-2 mb-3">
      <button
        :class="['btn', 'btn-sm', 'btn-outline-primary', { active: data.mine === 'up' }]"
        :disabled="busy"
        data-testid="post-up"
        @click="react('up')"
      >
        <i class="bi bi-hand-thumbs-up"></i> {{ data.post.upNum }}
      </button>
      <button
        :class="['btn', 'btn-sm', 'btn-outline-secondary', { active: data.mine === 'down' }]"
        :disabled="busy"
        data-testid="post-down"
        @click="react('down')"
      >
        <i class="bi bi-hand-thumbs-down"></i> {{ data.post.downNum }}
      </button>
      <button
        v-if="data.can.edit"
        class="btn btn-sm btn-outline-secondary"
        data-testid="post-edit"
        @click="router.push(`/forum/${id}/edit`)"
      >
        编辑
      </button>
      <button
        v-if="data.can.delete"
        class="btn btn-sm btn-outline-danger"
        :disabled="busy"
        data-testid="post-delete"
        @click="removePost"
      >
        删除
      </button>
      <template v-if="data.can.admin">
        <button
          class="btn btn-sm btn-outline-secondary"
          :disabled="busy"
          data-testid="post-pin"
          @click="admin(data.post.pinned ? 'unpin' : 'pin')"
        >
          {{ data.post.pinned ? '取消置顶' : '置顶' }}
        </button>
        <button
          class="btn btn-sm btn-outline-secondary"
          :disabled="busy"
          data-testid="post-feature"
          @click="admin(data.post.featured ? 'unfeature' : 'feature')"
        >
          {{ data.post.featured ? '取消加精' : '加精' }}
        </button>
      </template>
      <button
        v-if="data.can.reads"
        class="btn btn-sm btn-outline-secondary"
        :disabled="busy"
        data-testid="post-reads"
        @click="toggleReads"
      >
        阅读明细
      </button>
    </div>
    <div v-if="reads" class="dt-card mb-3" data-testid="post-reads-list">
      <div v-if="reads.items.length === 0" class="dt-empty">还没有人读过</div>
      <div v-for="r in reads.items" :key="r.restId" class="dt-meta">
        {{ r.name }} · 读了 {{ r.times }} 次 · 最后 {{ r.lastDay
        }}<span v-if="r.reaction"> · {{ REACTION[r.reaction] }}</span>
      </div>
    </div>

    <h6 class="dt-section">回复（{{ data.replies.length }}）</h6>
    <div
      v-for="r in data.replies"
      :id="`floor-${r.floor}`"
      :key="r.id"
      class="dt-item"
      :data-testid="`reply-${r.floor}`"
    >
      <div class="dt-item-main">
        <div class="dt-meta">
          #{{ r.floor }}
          <RouterLink v-if="r.restId !== null" :to="`/friends/${r.restId}`">{{ r.restName }}</RouterLink>
          <span v-else>{{ r.restName }}</span>
          <span v-if="r.anonymous && r.restId !== null">（匿名）</span>
          · {{ when(r.createdAt) }}
          <a v-if="r.replyTo !== null" :href="`#floor-${r.replyTo}`">回复 #{{ r.replyTo }}</a>
        </div>
        <div v-if="r.deleted" class="dt-meta fst-italic">该回复已删除</div>
        <div v-else class="dt-post-body">{{ r.content }}</div>
      </div>
      <div class="dt-item-actions">
        <button
          v-if="data.can.reply && !r.deleted"
          class="btn btn-sm btn-link"
          :data-testid="`reply-to-${r.floor}`"
          @click="replyTo = r.floor"
        >
          回复
        </button>
        <button
          v-if="r.canDelete"
          class="btn btn-sm btn-link text-danger"
          :disabled="busy"
          :data-testid="`reply-delete-${r.floor}`"
          @click="removeReply(r.id)"
        >
          删除
        </button>
      </div>
    </div>

    <div v-if="data.can.reply" class="mt-3">
      <div v-if="replyTo !== null" class="dt-meta mb-1" data-testid="reply-target">
        回复 #{{ replyTo }}（<a href="#" @click.prevent="replyTo = null">取消</a>）
      </div>
      <textarea
        v-model="content"
        class="form-control form-control-sm mb-1"
        rows="3"
        maxlength="500"
        placeholder="说点什么（最多 500 字）"
        data-testid="reply-content"
      ></textarea>
      <div class="d-flex align-items-center gap-2">
        <label class="small"
          ><input v-model="anonymous" type="checkbox" data-testid="reply-anon" /> 匿名</label
        >
        <small v-if="replyWait > 0" class="dt-meta" data-testid="reply-wait"
          >{{ replyWait }} 秒后可以再回复</small
        >
        <button
          class="btn btn-sm btn-primary ms-auto"
          :disabled="busy || replyWait > 0"
          data-testid="reply-submit"
          @click="submit"
        >
          回复
        </button>
      </div>
    </div>
    <div v-else class="dt-meta mt-3">验证邮箱后才能回复</div>
  </template>
</template>
