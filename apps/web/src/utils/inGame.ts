/**
 * 是否按"游戏内"显示（底部导航、返回、可点的标题）。
 * 指引页、账号页不要求开店（gameChrome），已开店时也要有导航，不然只能靠浏览器后退（终审 I2）
 */
export function isInGame(
  meta: { needRestaurant?: boolean; gameChrome?: boolean },
  restaurantId: number | null | undefined,
): boolean {
  return meta.needRestaurant === true || (meta.gameChrome === true && Boolean(restaurantId));
}
