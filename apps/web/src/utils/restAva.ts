import type { ArtName } from '../art/generated/names';
import { isNpcRest } from './npcName';

/**
 * 一家店的头像图（界面改版 P10：好友、排行、论坛）：蟹老板的店画蟹老板；
 * 别的店画它选的头像，没选或网页里没有这张图时画厨师
 */
export function restAva(
  id: number | null | undefined,
  avatar: number | null | undefined,
  avatarArt: (id: number | null | undefined) => ArtName | null,
): ArtName {
  if (isNpcRest(id)) return 'npc-krab';
  return avatarArt(avatar) ?? 'avatar-chef';
}
