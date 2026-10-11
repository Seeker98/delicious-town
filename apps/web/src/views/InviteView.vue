<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { InviteDto, InviteeDto, InviteStatus } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import DtArt from '../components/DtArt.vue';
import DtEmpty from '../components/DtEmpty.vue';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { useToastStore } from '../stores/toast';
import { restAva } from '../utils/restAva';

/**
 * 邀请好友（子项目 6A-2；界面改版 P11）：邀请码大字放虚线框里，两个整宽按钮复制码和带码的注册链接
 * （复制后按钮上短暂写“已复制”）；本月已计人数和进度条，规则拆成三格；
 * 好友一行一个：头像、店名、等级，下面写区服和两档奖励的状态（发了绿、待发琥珀、超上限灰）
 */
const toast = useToastStore();
const catalog = useCatalogStore();
const t = useT();
const data = ref<InviteDto | null>(null);
const copied = ref<'code' | 'link' | null>(null);
let copyTimer: ReturnType<typeof setTimeout> | undefined;

onMounted(async () => {
  void catalog.load().catch(() => undefined);
  try {
    data.value = await endpoints.invite();
  } catch (e) {
    toast.push(errorMessage(e, t.value.misc.invite.loadFailed), 'danger');
  }
});

/** 两档奖励的等级；旧服务端没给时按 10、30 级（backlog 1010） */
const levels = computed(() => data.value?.levels ?? { lv10: 10, lv30: 30 });
const link = computed(() => (data.value ? `${location.origin}/register?invite=${data.value.code}` : ''));
const pct = computed(() =>
  data.value
    ? Math.min(100, Math.round((data.value.monthCount / Math.max(1, data.value.monthlyCap)) * 100))
    : 0,
);

async function copy(what: 'code' | 'link') {
  const text = what === 'code' ? (data.value?.code ?? '') : link.value;
  try {
    await navigator.clipboard.writeText(text);
    copied.value = what;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copied.value = null), 2000);
  } catch {
    toast.push(t.value.misc.invite.copyFailed, 'danger');
  }
}

/** 一档奖励的状态：文字和颜色 */
function stage(level: number, s: InviteStatus | null): { text: string; cls: string } | null {
  const st = t.value.misc.invite.stage;
  if (s === 'sent') return { text: st.sent(level), cls: 'is-ok' };
  if (s === 'pending') return { text: st.pending(level), cls: 'is-warn' };
  if (s === 'capped') return { text: st.capped(level), cls: 'is-mute' };
  return null;
}
const stagesOf = (f: InviteeDto) =>
  [stage(levels.value.lv10, f.lv10), stage(levels.value.lv30, f.lv30)].filter((x) => x !== null);
</script>

<template>
  <template v-if="data">
    <section class="dt-card dt-invite-code">
      <div class="dt-invite-label">{{ t.misc.invite.myCode }}</div>
      <div class="dt-invite-box">
        <b class="dt-mono" data-testid="invite-code">{{ data.code }}</b>
      </div>
      <div class="dt-sheet-pair dt-invite-btns">
        <button type="button" class="btn btn-outline-primary" data-testid="copy-code" @click="copy('code')">
          <DtArt name="set-copy" :size="16" />{{
            copied === 'code' ? t.misc.invite.copied : t.misc.invite.copy
          }}
        </button>
        <button type="button" class="btn btn-primary" data-testid="copy-link" @click="copy('link')">
          <DtArt name="set-copy" :size="16" />{{
            copied === 'link' ? t.misc.invite.copied : t.misc.invite.copyLink
          }}
        </button>
      </div>
      <div class="dt-field-hint dt-invite-link" data-testid="invite-link">{{ link }}</div>
    </section>

    <section class="dt-card dt-invite-month">
      <div class="dt-invite-month-head">
        <b>{{ t.misc.invite.monthLabel }}</b
        ><span class="dt-num">{{ data.monthCount }} / {{ data.monthlyCap }}</span>
      </div>
      <span class="dt-meter"><i :style="{ width: `${pct}%` }"></i></span>
      <div class="dt-invite-steps">
        <div class="dt-sum">
          <span>{{ t.misc.invite.stepOpen }}</span
          ><b>{{ t.misc.invite.stepOpenGift }}</b>
        </div>
        <div class="dt-sum">
          <span>{{ t.misc.invite.stepLevel(levels.lv10) }}</span
          ><b>{{ t.misc.invite.stepYou }}</b>
        </div>
        <div class="dt-sum">
          <span>{{ t.misc.invite.stepLevel(levels.lv30) }}</span
          ><b>{{ t.misc.invite.stepAgain }}</b>
        </div>
      </div>
      <p class="dt-field-hint">{{ t.misc.invite.rulesShort(data.monthlyCap) }}</p>
    </section>

    <div class="dt-block-head">
      <h2 class="dt-block-title">{{ t.misc.invite.listTitle }}</h2>
      <span class="dt-block-note">{{ t.misc.invite.people(data.invitees.length) }}</span>
    </div>
    <DtEmpty v-if="data.invitees.length === 0" art="town-invite" :title="t.misc.invite.empty" />
    <div v-else class="dt-card dt-rows-card">
      <div v-for="(f, i) in data.invitees" :key="i" class="dt-row dt-invitee" data-testid="invitee">
        <span class="dt-row-ava"
          ><DtArt v-if="f.restName" :name="restAva(null, f.avatar, catalog.avatarArt)" :size="40" /><DtArt
            v-else
            name="set-user"
            :size="20"
        /></span>
        <span class="dt-row-main">
          <span v-if="f.restName" class="dt-row-title is-strong"
            >{{ f.restName
            }}<span class="dt-tag dt-lv is-t3">{{ t.misc.invite.level(f.level ?? 0) }}</span></span
          >
          <span v-else class="dt-row-title dt-muted">{{ t.misc.invite.noRest }}</span>
          <span class="dt-row-sub dt-row-sub-wrap"
            ><template v-if="f.shardName">{{ f.shardName }}</template
            ><template v-if="!f.verified"
              ><template v-if="f.shardName"> · </template
              ><span class="dt-invite-st is-bad">{{ t.misc.invite.unverified }}</span></template
            ><template v-for="(s, j) in stagesOf(f)" :key="j"
              ><template v-if="f.shardName || !f.verified || j > 0"> · </template
              ><span :class="['dt-invite-st', s.cls]">{{ s.text }}</span></template
            ></span
          >
        </span>
      </div>
    </div>
  </template>
</template>
