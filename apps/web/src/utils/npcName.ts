import { activeMessages } from '../i18n';
import { useSessionStore } from '../stores/session';

/** 是不是本区服的蟹老板（NPC）餐厅：编号来自 /account/me */
export function isNpcRest(id: number | null | undefined): boolean {
  const npc = useSessionStore().me?.npcRestId;
  return npc != null && id === npc;
}

/** 店名：蟹老板的店按当前语言写（服务器存的是中文名，视觉第三轮记下的），别的店用服务器给的名字 */
export function restName(id: number | null | undefined, name: string): string {
  return isNpcRest(id) ? activeMessages().friends.npcName : name;
}

/** 店铺公告：蟹老板的店按当前语言写；玩家写的公告原样 */
export function restNotice(id: number | null | undefined, notice: string): string {
  return isNpcRest(id) ? activeMessages().friends.npcNotice : notice;
}
