# 多语言术语表（问题记录 272）

翻译界面文案时统一用下面的词。新增常用术语时在这里补一行，再改各语言文件。

| 简中 | en | fr | es |
|---|---|---|---|
| 银币 | Coins | Pièces | Monedas |
| 钻石 | Diamonds | Diamants | Diamantes |
| 体力 | Stamina | Énergie | Energía |
| 声望 | Renown | Renommée | Renombre |
| 经验 | EXP | EXP | EXP |
| 油 / 油壶 | Oil / Oil tank | Huile / Bidon d'huile | Aceite / Bidón de aceite |
| 餐厅 | Restaurant | Restaurant | Restaurante |
| 区服 | Server | Serveur | Servidor |
| 食材 | Ingredient | Ingrédient | Ingrediente |
| 食谱 | Recipe | Recette | Receta |
| 特色菜 | Signature dish | Plat signature | Plato estrella |
| 橱柜 | Pantry | Garde-manger | Despensa |
| 仓库 | Storage | Entrepôt | Almacén |
| 菜场 | Market | Marché | Mercado |
| 交易所 | Exchange | Bourse | Bolsa |
| 事件预测 | Predictions | Prédictions | Predicciones |
| 一番赏 | Ichiban Kuji | Ichiban Kuji | Ichiban Kuji |
| 厨塔 | Chef Tower | Tour des chefs | Torre de chefs |
| 广场 | Square | Place | Plaza |
| 嘻哈男孩 | Hip-hop Boy | Garçon hip-hop | Chico hip-hop |
| 蟹老板 | Mr. Krab | M. Krab | Don Krab |
| 痞老板 | Plankton | Plancton | Plancton |
| 章鱼哥 | Squidward | Carlo | Calamardo |
| 白食 | Eat for free / Freeloader | Manger gratis / Pique-assiette | Comer gratis / Gorrón |
| 挑剔顾客 | Picky customer | Client difficile | Cliente exigente |
| 上座率 | Occupancy | Fréquentation | Ocupación |
| 活跃 | Activity points | Points d'activité | Puntos de actividad |
| 签到 | Check in | Pointer | Registrarse |
| 设施 | Facilities | Équipements | Instalaciones |
| 厨具 | Cookware | Ustensiles | Utensilios |
| 限时活动 | Events | Événements | Eventos |
| 协会 | Guild | Guilde | Gremio |
| 冰箱 | Fridge | Frigo | Nevera |
| 万能食材 | Universal ingredient | Ingrédient universel | Ingrediente universal |
| 神秘礼券 | Mystery Voucher | Bon mystère | Vale misterioso |
| 菜园姐 | Garden Sis | Sœur du Potager | Hermana del Huerto |
| 雯姐 | Sister Wen | Sœur Wen | Hermana Wen |
| 品（食谱品级） | Grade | Qualité | Calidad |
| 翻橱柜 | Raid pantry | Fouiller le garde-manger | Revolver la despensa |
| 举报 | Report | Signaler | Denunciar |
| 广播 / 喇叭 | Broadcast / Horn | Annonce / Klaxon | Anuncio / Bocina |
| 星愿 | Wish | Vœu | Deseo |
| 共飨 | Feast | Festin | Banquete |
| 雷神锤 | Thor's Hammer | Marteau de Thor | Martillo de Thor |
| 神灯 | Magic Lamp | Lampe magique | Lámpara mágica |
| 偷学 | Sneak a lesson | Espionner un cours | Espiar una clase |
| 残卷 | Fragment | Fragment | Fragmento |
| 大胃哥 | Big Belly | Gros Mangeur | El Glotón |
| 13 哥 | Brother 13 | Frère 13 | Hermano 13 |
| 镇长 | Mayor | Maire | Alcalde |

约定：

- 繁中由简中自动转换（`pnpm -F @dt/web i18n:tw`），个别词转换不对时写进 `apps/web/src/i18n/zh-TW-overrides.json`。
- 数字一律用 `formatNum`（千分位按语言）；大数缩写用 `shortNum`。
- 物品、食材、街道等游戏数据的名字来自目录（`packages/config/data/i18n/<语言>/`），界面文案里不要写死。
