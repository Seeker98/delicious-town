/**
 * 食材配图的类别（界面改版 P4，设计 §3.2、§3.3）：每种食材在 master/foods.json 里写一个 art，
 * 网页按它画 food-<art> 图形，不写死食材编号。新加食材（新街道导入）也要写，构建会检查。
 */
export const FOOD_ARTS = [
  'pork',
  'poultry',
  'beef',
  'game',
  'offal',
  'fish',
  'shrimp',
  'shellfish',
  'seafood',
  'egg',
  'leafy',
  'root',
  'veg',
  'allium',
  'bean',
  'mushroom',
  'fruit',
  'grain',
  'spice',
  'sauce',
  'sweet',
  'dairy',
  'drink',
  'nut',
  'delicacy',
  'mystery',
  'master',
] as const;
export type FoodArt = (typeof FOOD_ARTS)[number];
