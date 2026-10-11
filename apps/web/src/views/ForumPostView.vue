<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { gameDateTime } from '../utils/format';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import type { ForumAdminAction, ForumPostDetailDto, ForumReadsDto } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import DtArt from '../components/DtArt.vue';
import DtSheet from '../components/DtSheet.vue';
import ReportButton from '../components/ReportButton.vue';
import { useCatalogStore } from '../stores/catalog';
import { useConfirmStore } from '../stores/confirm';
import { errorMessage } from '../i18n/zh-CN';
import { usePageMenu } from '../stores/pageTitle';
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
const catalog = useCatalogStore();
const confirm = useConfirmStore();
/**
 * 界面改版 P10：顶栏标题是“帖子”，标题在正文上面大字；编辑、删除、置顶、加精、阅读明细、举报收进顶栏右边“⋯”，
 * 回复框是底部一条“写回复…”，点了从下面弹出面板
 */
const menuOpen = ref(false);
const replyOpen = ref(false);
usePageMenu(() =>
  data.value ? { label: t.value.forum.post.more, open: () => (menuOpen.value = true) } : null,
);
const ava = (id: number | null | undefined) => catalog.avatarArt(id) ?? 'avatar-chef';
/** 回复的那一层原文的开头（引用一行） */
const quoteOf = (floor: number) => {
  const r = data.value?.replies.find((x) => x.floor === floor);
  return r ? (r.deleted ? t.value.forum.post.replyDeleted : r.content) : '';
};
const contentLen = computed(() => [...content.value].length);
function replyFloor(floor: number | null) {
  replyTo.value = floor;
  replyOpen.value = true;
}
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
  gameDateTime(iso, {
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
  menuOpen.value = false;
  const r = await run(() => endpoints.forumAdmin(id.value, action), t.value.forum.post.opFailed);
  if (r?.rewarded) toast.push(t.value.forum.post.featuredReward, 'success');
  if (r) await load();
}
async function removePost() {
  menuOpen.value = false;
  if (
    !(await confirm.ask({
      title: t.value.forum.post.deleteConfirm,
      ok: t.value.forum.post.delete,
      danger: true,
    }))
  )
    return;
  const r = await run(() => endpoints.forumDelete(id.value), t.value.forum.post.deleteFailed);
  if (r) await router.push('/forum');
}
async function removeReply(replyId: number) {
  if (
    !(await confirm.ask({
      title: t.value.forum.post.replyDeleteConfirm,
      ok: t.value.forum.post.delete,
      danger: true,
    }))
  )
    return;
  const r = await run(() => endpoints.forumDeleteReply(replyId), t.value.forum.post.deleteFailed);
  if (r) await load();
}
async function toggleReads() {
  menuOpen.value = false;
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
    replyOpen.value = false;
  }
}
</script>

<template>
  <template v-if="data">
    <div class="dt-post-tags">
      <span v-if="data.post.pinned" class="dt-tag dt-tag-danger">{{ t.forum.pinned }}</span>
      <span v-if="data.post.featured" class="dt-tag dt-tag-warn">{{ t.forum.featured }}</span>
      <span class="dt-tag dt-tag-mute">{{ t.forum.categories[data.post.category] }}</span>
    </div>
    <h2 class="dt-post-title" data-testid="post-title">{{ data.post.title }}</h2>
    <div class="dt-post-author">
      <span class="dt-post-ava"><DtArt :name="ava(data.post.avatar)" :size="40" /></span>
      <span class="dt-post-author-main">
        <RouterLink :to="`/friends/${data.post.restId}`" class="dt-post-name">{{
          data.post.restName
        }}</RouterLink>
        <span class="dt-post-meta"
          >{{ when(data.post.createdAt)
          }}<span v-if="data.post.editedAt">{{ t.forum.post.edited(when(data.post.editedAt)) }}</span
          >{{ t.forum.post.read(data.post.readNum) }}</span
        >
      </span>
    </div>
    <div class="dt-card dt-post-body" data-testid="post-body">{{ data.post.content }}</div>
    <div class="dt-post-cheers">
      <button
        type="button"
        class="dt-cheer"
        :aria-pressed="data.mine === 'up'"
        :aria-label="t.forum.upN(data.post.upNum)"
        :disabled="busy"
        data-testid="post-up"
        @click="react('up')"
      >
        <i class="bi bi-hand-thumbs-up" aria-hidden="true"></i> {{ data.post.upNum }}
      </button>
      <button
        type="button"
        class="dt-cheer"
        :aria-pressed="data.mine === 'down'"
        :aria-label="t.forum.downN(data.post.downNum)"
        :disabled="busy"
        data-testid="post-down"
        @click="react('down')"
      >
        <i class="bi bi-hand-thumbs-down" aria-hidden="true"></i> {{ data.post.downNum }}
      </button>
    </div>
    <div v-if="reads" class="dt-card dt-post-reads" data-testid="post-reads-list">
      <div class="dt-post-reads-head">
        <b>{{ t.forum.post.reads }}</b>
        <button type="button" class="dt-link-btn" @click="reads = null">{{ t.common.close }}</button>
      </div>
      <div v-if="reads.items.length === 0" class="dt-meta">{{ t.forum.post.noReads }}</div>
      <div v-for="r in reads.items" :key="r.restId" class="dt-meta">
        {{ t.forum.post.readLine(r.name, r.times, r.lastDay)
        }}<span v-if="r.reaction"> · {{ t.forum.post.reaction[r.reaction] }}</span>
      </div>
    </div>

    <div class="dt-block-head mt-3">
      <h2 class="dt-block-title">{{ t.forum.post.replies(data.replies.length) }}</h2>
      <span class="dt-block-more">{{ t.forum.post.byFloor }}</span>
    </div>
    <div v-if="data.replies.length === 0" class="dt-card dt-up-max">{{ t.forum.post.noReplies }}</div>
    <div v-else class="dt-card dt-reply-list">
      <div
        v-for="r in data.replies"
        :id="`floor-${r.floor}`"
        :key="r.id"
        class="dt-reply"
        :data-testid="`reply-${r.floor}`"
      >
        <span class="dt-reply-ava"><DtArt :name="ava(r.avatar)" :size="32" /></span>
        <div class="dt-reply-main">
          <div class="dt-reply-head">
            <RouterLink v-if="r.restId !== null" :to="`/friends/${r.restId}`" class="dt-reply-name">{{
              r.restName
            }}</RouterLink>
            <b v-else class="dt-reply-name">{{ r.anonymous ? t.forum.post.anonymous : r.restName }}</b>
            <span v-if="r.anonymous && r.restId !== null">{{ t.forum.post.anonymousTag }}</span>
            <span>#{{ r.floor }}</span>
            <span>{{ when(r.createdAt) }}</span>
            <a v-if="r.replyTo !== null" :href="`#floor-${r.replyTo}`" class="dt-reply-to">{{
              t.forum.post.replyTo(r.replyTo)
            }}</a>
          </div>
          <div v-if="r.replyTo !== null && quoteOf(r.replyTo)" class="dt-reply-quote dt-clamp1">
            {{ quoteOf(r.replyTo) }}
          </div>
          <div v-if="r.deleted" class="dt-meta fst-italic">{{ t.forum.post.replyDeleted }}</div>
          <div v-else class="dt-reply-body">{{ r.content }}</div>
          <div class="dt-reply-ops">
            <button
              v-if="data.can.reply && !r.deleted"
              type="button"
              class="dt-link-btn"
              :data-testid="`reply-to-${r.floor}`"
              @click="replyFloor(r.floor)"
            >
              {{ t.forum.post.reply }}
            </button>
            <button
              v-if="r.canDelete"
              type="button"
              class="dt-link-btn"
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
      </div>
    </div>

    <!-- 底部一条“写回复…”，点了弹出回复面板 -->
    <div v-if="data.can.reply" class="dt-sticky-bar dt-reply-bar">
      <button type="button" class="dt-reply-open" data-testid="reply-open" @click="replyFloor(null)">
        {{ replyWait > 0 ? t.forum.post.replyWait(replyWait) : t.forum.post.writeReply }}
      </button>
    </div>
    <p v-else class="dt-block-note mt-3">{{ t.forum.post.verifyToReply }}</p>

    <DtSheet :open="replyOpen" :title="t.forum.post.reply" @close="replyOpen = false">
      <div v-if="replyTo !== null" class="dt-reply-target" data-testid="reply-target">
        <span class="dt-tag dt-tag-primary"
          >{{ t.forum.post.replyTo(replyTo) }}
          <button
            type="button"
            class="dt-tag-x"
            :aria-label="t.forum.post.replyToCancel"
            @click="replyTo = null"
          >
            <i class="bi bi-x-lg" aria-hidden="true"></i></button
        ></span>
      </div>
      <label class="dt-area mt-2">
        <span class="visually-hidden">{{ t.forum.post.replyPlaceholder }}</span>
        <textarea
          v-model="content"
          rows="5"
          maxlength="500"
          :placeholder="t.forum.post.replyPlaceholder"
          data-testid="reply-content"
        ></textarea>
      </label>
      <div class="dt-reply-sheet-foot">
        <label class="dt-check-row"
          ><input v-model="anonymous" type="checkbox" class="form-check-input" data-testid="reply-anon" />
          {{ t.forum.post.anonymous }}</label
        >
        <span :class="['dt-area-count', { 'is-over': contentLen > 500 }]">{{ contentLen }} / 500</span>
      </div>
      <p v-if="replyWait > 0" class="dt-detail-note" data-testid="reply-wait">
        {{ t.forum.post.replyWait(replyWait) }}
      </p>
      <template #actions>
        <div class="dt-sheet-pair">
          <button type="button" class="btn btn-light" @click="replyOpen = false">
            {{ t.common.cancel }}
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="busy || replyWait > 0 || content.trim() === ''"
            data-testid="reply-submit"
            @click="submit"
          >
            {{ t.forum.post.reply }}
          </button>
        </div>
      </template>
    </DtSheet>

    <!-- 顶栏“⋯”：这篇帖子我能做的事 -->
    <DtSheet :open="menuOpen" :title="t.forum.post.menuTitle" @close="menuOpen = false">
      <div class="dt-menu">
        <button
          v-if="data.can.edit"
          type="button"
          class="dt-menu-row"
          data-testid="post-edit"
          @click="router.push(`/forum/${id}/edit`)"
        >
          <i class="bi bi-pencil" aria-hidden="true"></i>{{ t.forum.post.edit }}
        </button>
        <button
          v-if="data.can.reads"
          type="button"
          class="dt-menu-row"
          data-testid="post-reads"
          @click="toggleReads"
        >
          <i class="bi bi-eye" aria-hidden="true"></i>{{ t.forum.post.reads }}
          <span class="dt-menu-note">{{ t.forum.post.readsNote }}</span>
        </button>
        <template v-if="data.can.admin">
          <button
            type="button"
            class="dt-menu-row"
            :disabled="busy"
            data-testid="post-pin"
            @click="admin(data.post.pinned ? 'unpin' : 'pin')"
          >
            <i class="bi bi-pin-angle" aria-hidden="true"></i
            >{{ data.post.pinned ? t.forum.post.unpin : t.forum.post.pin }}
            <span class="dt-tag dt-tag-mute ms-auto">{{ t.forum.post.adminTag }}</span>
          </button>
          <button
            type="button"
            class="dt-menu-row"
            :disabled="busy"
            data-testid="post-feature"
            @click="admin(data.post.featured ? 'unfeature' : 'feature')"
          >
            <i class="bi bi-star" aria-hidden="true"></i
            >{{ data.post.featured ? t.forum.post.unfeature : t.forum.post.feature }}
            <span class="dt-tag dt-tag-mute ms-auto">{{ t.forum.post.adminTag }}</span>
          </button>
        </template>
        <button
          v-if="data.can.delete"
          type="button"
          class="dt-menu-row is-danger"
          :disabled="busy"
          data-testid="post-delete"
          @click="removePost"
        >
          <i class="bi bi-trash" aria-hidden="true"></i>{{ t.forum.post.delete }}
        </button>
        <div v-if="data.post.restId !== myRest" class="dt-menu-row is-static">
          <i class="bi bi-flag" aria-hidden="true"></i>
          <ReportButton target-type="post" :target-id="data.post.id" testid="post-report" />
        </div>
      </div>
      <template #actions>
        <button type="button" class="btn btn-light dt-btn-block" @click="menuOpen = false">
          {{ t.common.close }}
        </button>
      </template>
    </DtSheet>
  </template>
</template>
