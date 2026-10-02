<script setup lang="ts">
import { computed } from 'vue';
import type { ActivityDto, PassDef } from '@dt/shared';
import { useCatalogStore } from '../../stores/catalog';
import { actionName } from '../../utils/activity';
import { rewardSummary } from '../../utils/reward';
import RewardButton from './RewardButton.vue';

const props = defineProps<{ a: ActivityDto & { kind: 'pass'; def: PassDef }; busy: boolean }>();
defineEmits<{ claim: [key: string]; unlock: [] }>();
const catalog = useCatalogStore();
const points = computed(() => props.a.counters.points ?? 0);
const byKey = computed(() => new Map(props.a.rewards.map((r) => [r.key, r])));
const next = computed(() => props.a.def.levels.find((l) => l.points > points.value));
const price = computed(() =>
  rewardSummary({ diamond: props.a.def.unlock.diamond, goods: props.a.def.unlock.goods }, catalog),
);
</script>

<template>
  <div class="mb-1">
    <b>积分 {{ points }}</b>
    <span v-if="next" class="small text-muted ms-2">下一档还差 {{ next.points - points }}</span>
  </div>
  <div class="small text-muted mb-2">
    今天：
    <span v-for="r in a.def.rules" :key="r.key" class="me-2"
      >{{ actionName(r.key) }} {{ a.today[r.key] ?? 0 }}/{{ r.dailyCap }}</span
    >
  </div>
  <table class="table table-sm align-middle">
    <thead>
      <tr>
        <th>积分</th>
        <th>普通</th>
        <th>
          进阶
          <button
            v-if="!a.premium && a.state === 'running'"
            type="button"
            class="btn btn-sm btn-outline-warning ms-1"
            :disabled="busy"
            :data-testid="`unlock-${a.id}`"
            @click="$emit('unlock')"
          >
            <i class="bi bi-lock"></i> 解锁（{{ price }}）
          </button>
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(l, i) in a.def.levels" :key="i">
        <td>{{ l.points }}</td>
        <td>
          <RewardButton
            v-if="byKey.get(`f${i}`)"
            :activity-id="a.id"
            :reward="byKey.get(`f${i}`)!"
            :state="a.state"
            :busy="busy"
            @claim="$emit('claim', $event)"
          />
        </td>
        <td>
          <RewardButton
            v-if="byKey.get(`p${i}`)"
            :activity-id="a.id"
            :reward="byKey.get(`p${i}`)!"
            :state="a.state"
            :busy="busy"
            @claim="$emit('claim', $event)"
          />
        </td>
      </tr>
    </tbody>
  </table>
</template>
