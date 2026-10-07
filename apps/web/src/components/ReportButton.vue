<script setup lang="ts">
import { ref } from 'vue';
import { REPORT_REASONS, type ReportReason, type ReportTarget } from '@dt/shared';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';

/** 举报（子项目 6B-1）：一个小链接，点开是内联的小卡片——选理由、写说明、提交；结果写在卡片里 */
const props = withDefaults(defineProps<{ targetType: ReportTarget; targetId: number; testid?: string }>(), {
  testid: 'report',
});
const open = ref(false);
const t = useT();
const reason = ref<ReportReason>('abuse');
const detail = ref('');
const busy = ref(false);
const done = ref(false);
const error = ref('');
const tid = (s: string) => `${props.testid}-${s}`;

async function submit() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const d = detail.value.trim();
    await endpoints.report({
      targetType: props.targetType,
      targetId: props.targetId,
      reason: reason.value,
      ...(d ? { detail: d } : {}),
    });
    done.value = true;
  } catch (e) {
    error.value = errorMessage(e, t.value.friends.report.failed);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <span class="d-inline-block">
    <button
      v-if="!open"
      type="button"
      class="dt-link-btn text-muted fw-normal"
      :data-testid="tid('open')"
      @click="open = true"
    >
      {{ t.friends.report.open }}
    </button>
    <span v-else class="d-block dt-card small mt-1 text-start" :data-testid="tid('card')">
      <template v-if="done">{{ t.friends.report.done }}</template>
      <template v-else>
        <span class="d-flex flex-wrap gap-2 mb-1">
          <label v-for="r in REPORT_REASONS" :key="r" class="form-check-label">
            <input
              v-model="reason"
              type="radio"
              class="form-check-input me-1"
              :value="r"
              :data-testid="tid(`reason-${r}`)"
            />{{ t.friends.report.reasons[r] }}
          </label>
        </span>
        <input
          v-model="detail"
          class="form-control form-control-sm mb-1"
          maxlength="100"
          :placeholder="t.friends.report.detail"
          :data-testid="tid('detail')"
        />
        <span v-if="error" class="d-block text-danger mb-1">{{ error }}</span>
        <button
          type="button"
          class="btn btn-sm btn-danger me-1"
          :disabled="busy"
          :data-testid="tid('submit')"
          @click="submit"
        >
          {{ t.friends.report.submit }}
        </button>
        <button type="button" class="btn btn-sm btn-outline-secondary" @click="open = false">
          {{ t.common.cancel }}
        </button>
      </template>
    </span>
  </span>
</template>
