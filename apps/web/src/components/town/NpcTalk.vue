<script setup lang="ts">
import { ref } from 'vue';
import type { NpcKey, TownDto } from '@dt/shared';
import { endpoints } from '../../api/endpoints';
import { useT } from '../../composables/useT';
import { errorMessage } from '../../i18n/zh-CN';
import { useCatalogStore } from '../../stores/catalog';
import { useToastStore } from '../../stores/toast';
import { rewardText } from '../../utils/rewards';
import { talkText } from '../../utils/serverText';

/** 和一位 NPC 每天聊一次（大胃哥、雯姐在广场，13 哥在协会，问题记录 441） */
const props = defineProps<{ data: TownDto; npc: NpcKey }>();
const emit = defineEmits<{ reload: [] }>();
const catalog = useCatalogStore();
const toast = useToastStore();
const t = useT();
const busy = ref(false);

async function talk() {
  if (busy.value) return;
  busy.value = true;
  const name = t.value.town.npcs[props.npc].name;
  try {
    const r = await endpoints.townTalk(props.npc);
    toast.push(
      t.value.town.said(
        name,
        talkText(r.talk),
        r.rewards.map((x) => rewardText(x, catalog)).join(t.value.events.sep),
      ),
      'success',
    );
  } catch (e) {
    toast.push(errorMessage(e, t.value.town.talkFailed), 'danger');
  } finally {
    busy.value = false;
    emit('reload');
  }
}
</script>

<template>
  <div class="dt-item">
    <div class="dt-item-main">
      <div class="dt-item-title">{{ t.town.npcs[npc].name }}</div>
      <div class="dt-meta">{{ t.town.npcs[npc].desc }}</div>
    </div>
    <div class="dt-item-actions">
      <button
        class="btn btn-sm btn-outline-primary"
        :disabled="busy || data.talked[npc]"
        :data-testid="`talk-${npc}`"
        @click="talk"
      >
        {{ data.talked[npc] ? t.town.talkedToday : t.town.talk }}
      </button>
    </div>
  </div>
</template>
