<script setup lang="ts">
import { ref } from 'vue';
import { endpoints } from '../api/endpoints';
import { errorMessage } from '../i18n/zh-CN';
import { useCatalogStore } from '../stores/catalog';
import { rewardSummary } from '../utils/reward';

/** 兑换码输入框（子项目 6A-2）：放在邮箱页顶部；结果写在框下面，不用弹出提示 */
const emit = defineEmits<{ redeemed: [] }>();
const catalog = useCatalogStore();
const code = ref('');
const busy = ref(false);
const result = ref<{ ok: boolean; text: string } | null>(null);

async function go() {
  const c = code.value.trim();
  if (!c || busy.value) return;
  busy.value = true;
  try {
    const r = await endpoints.redeem(c);
    result.value = { ok: true, text: `兑换成功：${rewardSummary(r.items, catalog)}` };
    code.value = '';
    emit('redeemed');
  } catch (e) {
    result.value = { ok: false, text: errorMessage(e, '兑换失败') };
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
        placeholder="输入兑换码"
        maxlength="40"
        autocomplete="off"
        aria-label="兑换码"
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
        兑换
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
