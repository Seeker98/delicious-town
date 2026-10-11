<script setup lang="ts">
import type { ArtName } from '../art/generated/names';
import { useT } from '../composables/useT';
import { formatNum } from '../utils/format';
import DtArt from './DtArt.vue';
import DtSheet from './DtSheet.vue';
import DtStepper from './DtStepper.vue';

/**
 * 数量面板（界面改版 P9，设计 §1.1 第 5 条）：大图和说明、快捷“最多”、步进器、合计、整宽确认。
 * 酒吧换蟹币、神殿鉴定 / 发射 / 探险 / 投喂、厨塔声望商店共用；reason 不为空时写在上面并灰掉确认
 */
const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    art: ArtName;
    lines?: string[];
    /** 步进器前的说明（“鉴定几次”） */
    label: string;
    max: number;
    okText: string;
    busy?: boolean;
    reason?: string;
    /** 合计几行：[说明, 值, 加粗] */
    sum?: Array<[string, string, boolean?]>;
    testid?: string;
    /** 大图的底色（同 .dt-detail-art 的修饰类） */
    artClass?: string;
  }>(),
  { lines: () => [], busy: false, reason: '', sum: () => [], testid: 'qty-num', artClass: '' },
);
const num = defineModel<number>({ required: true });
const emit = defineEmits<{ close: []; ok: [] }>();
const t = useT();
</script>

<template>
  <DtSheet :open="open" :title="title" @close="emit('close')">
    <div class="dt-detail-head">
      <span :class="['dt-detail-art', artClass]"><DtArt :name="art" :size="52" /></span>
      <div class="dt-detail-info">
        <div v-for="(x, i) in props.lines" :key="i" :class="{ 'dt-detail-sub': i > 0 }">{{ x }}</div>
      </div>
    </div>
    <slot name="top" />
    <div v-if="reason" class="dt-detail-note text-danger" data-testid="qty-reason">{{ reason }}</div>
    <div v-if="max > 1" class="dt-detail-qty">
      <span class="flex-fill">{{ label }}</span>
      <button
        type="button"
        class="dt-choice"
        :aria-pressed="num === max"
        data-testid="qty-max"
        @click="num = max"
      >
        {{ t.store.shop.max(formatNum(max)) }}
      </button>
      <DtStepper v-model="num" :min="1" :max="Math.max(1, max)" :testid="testid" />
    </div>
    <slot />
    <dl v-if="sum.length > 0" class="dt-sum" data-testid="qty-sum">
      <div v-for="([k, v, strong], i) in sum" :key="i">
        <dt>{{ k }}</dt>
        <dd>
          <b v-if="strong">{{ v }}</b
          ><template v-else>{{ v }}</template>
        </dd>
      </div>
    </dl>
    <template #actions>
      <div class="dt-sheet-pair">
        <button type="button" class="btn btn-light" @click="emit('close')">{{ t.common.cancel }}</button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="busy || !!reason"
          data-testid="qty-ok"
          @click="emit('ok')"
        >
          {{ okText }}
        </button>
      </div>
    </template>
  </DtSheet>
</template>
