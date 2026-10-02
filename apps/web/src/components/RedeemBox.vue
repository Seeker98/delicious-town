<script setup lang="ts">
import { ref } from 'vue';
import { endpoints } from '../api/endpoints';
import { useT } from '../composables/useT';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { rewardSummary } from '../utils/reward';

/** 兑换码输入框（子项目 6A-2）：放在邮箱页顶部；结果写在框下面，不用弹出提示 */
const emit = defineEmits<{ redeemed: [] }>();
const catalog = useCatalogStore();
const code = ref('');
const t = useT();
const busy = ref(false);
const result = ref<{ ok: boolean; text: string } | null>(null);

async function go() {
  const c = code.value.trim();
  if (!c || busy.value) return;
  busy.value = true;
  try {
    const r = await endpoints.redeem(c);
    result.value = { ok: true, text: t.value.mail.redeem.done(rewardSummary(r.items, catalog)) };
    code.value = '';
    emit('redeemed');
  } catch (e) {
    result.value = { ok: false, text: errorMessage(e, t.value.mail.redeem.failed) };
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="dt-card small mb-2">
    <div class="d-flex gap-2">
      <input
        v-model="code"
        class="form-control form-control-sm"
        :placeholder="t.mail.redeem.placeholder"
        maxlength="40"
        autocomplete="off"
        :aria-label="t.mail.redeem.label"
        data-testid="redeem-input"
        @keydown.enter.prevent="go"
      />
      <button
        type="button"
        class="btn btn-sm btn-primary text-nowrap"
        :disabled="busy || !code.trim()"
        data-testid="redeem-go"
        @click="go"
      >
        {{ t.mail.redeem.btn }}
      </button>
    </div>
    <div
      v-if="result"
      class="mt-1"
      :class="result.ok ? 'text-success' : 'text-danger'"
      role="status"
      data-testid="redeem-result"
    >
      {{ result.text }}
    </div>
  </div>
</template>
