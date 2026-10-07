<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import type { ForumAdminAction, ForumPostDetailDto, ForumReadsDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { activeLocale } from '../i18n';
import ReportButton from '../components/ReportButton.vue';
import { errorMessage } from '../i18n/zh-CN';
import { useSessionStore } from '../stores/session';
import { useToastStore } from '../stores/toast';
import { useCountdown } from '../utils/countdown';

/** 帖子详情（子项目 4E-3 设计文档 §5）：正文一律按纯文字显示（文本插值 + pre-wrap，不用 v-html） */
const route = useRoute();
const router = useRouter();
const toast = useToastStore();
const t = useT();
/** 自己的店：别人的帖子、回复才显示举报（子项目 6B-1） */
const myRest = computed(() => useSessionStore().me?.restaurantId ?? null);
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
  new Date(iso).toLocaleString(activeLocale(), {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

async function load() {
  try {
    data.value = await endpoints.forumPost(id.value);
  } catch (e) {
    toast.push(errorMessage(e, t.value.forum.post.loadFailed), 'danger');
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
  const r = await run(() => endpoints.forumReact(id.value, kind), t.value.forum.post.opFailed);
  if (r && data.value) {
    data.value.mine = r.mine;
    data.value.post.upNum = r.up;
    data.value.post.downNum = r.down;
  }
}
async function admin(action: ForumAdminAction) {
  const r = await run(() => endpoints.forumAdmin(id.value, action), t.value.forum.post.opFailed);
  if (r?.rewarded) toast.push(t.value.forum.post.featuredReward, 'success');
  if (r) await load();
}
async function removePost() {
  if (!window.confirm(t.value.forum.post.deleteConfirm)) return;
  const r = await run(() => endpoints.forumDelete(id.value), t.value.forum.post.deleteFailed);
  if (r) await router.push('/forum');
}
async function removeReply(replyId: number) {
  if (!window.confirm(t.value.forum.post.replyDeleteConfirm)) return;
  const r = await run(() => endpoints.forumDeleteReply(replyId), t.value.forum.post.deleteFailed);
  if (r) await load();
}
async function toggleReads() {
  if (reads.value) {
    reads.value = null;
    return;
  }
  reads.value = await run(() => endpoints.forumReads(id.value), t.value.forum.post.readsFailed);
}
async function submit() {
  const text = content.value.trim();
  if (!text) return;
  const body = {
    content: text,
    ...(replyTo.value !== null ? { replyTo: replyTo.value } : {}),
    anonymous: anonymous.value,
  };
  const r = await run(() => endpoints.forumReply(id.value, body), t.value.forum.post.replyFailed);
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
      <RouterLink to="/forum" class="small dt-back">{{ t.forum.post.back }}</RouterLink>
    </div>
    <div class="dt-meta mb-2">
      <span class="badge bg-light text-dark border me-1">{{ t.forum.categories[data.post.category] }}</span>
      <span v-if="data.post.pinned" class="badge bg-danger me-1">{{ t.forum.pinned }}</span>
      <span v-if="data.post.featured" class="badge bg-warning text-dark me-1">{{ t.forum.featured }}</span>
      <RouterLink :to="`/friends/${data.post.restId}`">{{ data.post.restName }}</RouterLink>
      · {{ when(data.post.createdAt)
      }}<span v-if="data.post.editedAt">{{ t.forum.post.edited(when(data.post.editedAt)) }}</span
      >{{ t.forum.post.read(data.post.readNum) }}
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
        {{ t.forum.post.edit }}
      </button>
      <button
        v-if="data.can.delete"
        class="btn btn-sm btn-outline-danger"
        :disabled="busy"
        data-testid="post-delete"
        @click="removePost"
      >
        {{ t.forum.post.delete }}
      </button>
      <template v-if="data.can.admin">
        <button
          class="btn btn-sm btn-outline-secondary"
          :disabled="busy"
          data-testid="post-pin"
          @click="admin(data.post.pinned ? 'unpin' : 'pin')"
        >
          {{ data.post.pinned ? t.forum.post.unpin : t.forum.post.pin }}
        </button>
        <button
          class="btn btn-sm btn-outline-secondary"
          :disabled="busy"
          data-testid="post-feature"
          @click="admin(data.post.featured ? 'unfeature' : 'feature')"
        >
          {{ data.post.featured ? t.forum.post.unfeature : t.forum.post.feature }}
        </button>
      </template>
      <button
        v-if="data.can.reads"
        class="btn btn-sm btn-outline-secondary"
        :disabled="busy"
        data-testid="post-reads"
        @click="toggleReads"
      >
        {{ t.forum.post.reads }}
      </button>
      <ReportButton
        v-if="data.post.restId !== myRest"
        target-type="post"
        :target-id="data.post.id"
        testid="post-report"
      />
    </div>
    <div v-if="reads" class="dt-card mb-3" data-testid="post-reads-list">
      <div v-if="reads.items.length === 0" class="dt-empty">{{ t.forum.post.noReads }}</div>
      <div v-for="r in reads.items" :key="r.restId" class="dt-meta">
        {{ t.forum.post.readLine(r.name, r.times, r.lastDay)
        }}<span v-if="r.reaction"> · {{ t.forum.post.reaction[r.reaction] }}</span>
      </div>
    </div>

    <h6 class="dt-section">{{ t.forum.post.replies(data.replies.length) }}</h6>
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
          <span v-else>{{ r.anonymous ? t.forum.post.anonymous : r.restName }}</span>
          <span v-if="r.anonymous && r.restId !== null">{{ t.forum.post.anonymousTag }}</span>
          · {{ when(r.createdAt) }}
          <a v-if="r.replyTo !== null" :href="`#floor-${r.replyTo}`">{{ t.forum.post.replyTo(r.replyTo) }}</a>
        </div>
        <div v-if="r.deleted" class="dt-meta fst-italic">{{ t.forum.post.replyDeleted }}</div>
        <div v-else class="dt-post-body">{{ r.content }}</div>
      </div>
      <div class="dt-item-actions">
        <button
          v-if="data.can.reply && !r.deleted"
          class="dt-link-btn"
          :data-testid="`reply-to-${r.floor}`"
          @click="replyTo = r.floor"
        >
          {{ t.forum.post.reply }}
        </button>
        <button
          v-if="r.canDelete"
          class="dt-link-btn text-danger"
          :disabled="busy"
          :data-testid="`reply-delete-${r.floor}`"
          @click="removeReply(r.id)"
        >
          {{ t.forum.post.delete }}
        </button>
        <ReportButton
          v-if="!r.deleted && !r.canDelete"
          target-type="reply"
          :target-id="r.id"
          :testid="`reply-report-${r.floor}`"
        />
      </div>
    </div>

    <div v-if="data.can.reply" class="mt-3">
      <div v-if="replyTo !== null" class="dt-meta mb-1" data-testid="reply-target">
        {{ t.forum.post.replyTo(replyTo) }}{{ t.common.parenOpen
        }}<button type="button" class="dt-link-btn" @click="replyTo = null">{{ t.common.cancel }}</button
        >{{ t.common.parenClose }}
      </div>
      <textarea
        v-model="content"
        class="form-control form-control-sm mb-1"
        rows="3"
        maxlength="500"
        :placeholder="t.forum.post.replyPlaceholder"
        data-testid="reply-content"
      ></textarea>
      <div class="d-flex align-items-center gap-2">
        <label class="small"
          ><input v-model="anonymous" type="checkbox" data-testid="reply-anon" />
          {{ t.forum.post.anonymous }}</label
        >
        <small v-if="replyWait > 0" class="dt-meta" data-testid="reply-wait">{{
          t.forum.post.replyWait(replyWait)
        }}</small>
        <button
          class="btn btn-sm btn-primary ms-auto"
          :disabled="busy || replyWait > 0"
          data-testid="reply-submit"
          @click="submit"
        >
          {{ t.forum.post.reply }}
        </button>
      </div>
    </div>
    <div v-else class="dt-meta mt-3">{{ t.forum.post.verifyToReply }}</div>
  </template>
</template>
