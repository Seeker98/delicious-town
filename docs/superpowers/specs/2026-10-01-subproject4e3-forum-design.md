# 子项目 4E-3「论坛」设计

- 上位文档：`2026-09-30-subproject4e1-town-design.md`（4E 拆成 4E-1 小镇日常、4E-2 嘻哈男孩与排行、4E-3 论坛）
- 原版规格：`analysis/spec/12_协会与小镇.md` §12.7
- 原版源码：`SocietyServiceImpl` / `SocietyTranServiceImpl` 的 `getListPost`、`getPostContent`、`postOper`、`postNew`、`postBack`、`adminPost`、`deletePost`、`getAwardByPost`、`getListPostReadInfo`；实体 `DtPost`、`DtPostResp`、`PostReadInfo`

**完成标志**：
- 玩家能在论坛按分类和精华浏览、搜索帖子，发帖、改帖、删帖，回复（可以回复某一楼、可以匿名），点赞点踩；
- 作者能看阅读明细；
- mod / admin 能在论坛里置顶、加精、删帖删回复，第一次加精给作者发奖励；
- 支线"发表一篇帖子"开放。

## 1. 范围

| 内容 | 本次 |
|---|---|
| 帖子列表（分类、精华、关键词搜索、分页）、详情、发帖、编辑、删帖 | 做 |
| 回复（楼层、回复某一楼、匿名、删除） | 做 |
| 点赞 / 点踩、阅读数、作者看阅读明细 | 做 |
| mod / admin 置顶、加精（首次加精发奖励）、删帖删回复 | 做 |
| 草稿（原版 state 0） | 不做 |
| 编辑历史（原版 `insertPostToHis`） | 不做，只记最后编辑时间 |
| 蟹老板点赞标记（原版 `Krabthumb`） | 不做 |
| 敏感词过滤、图片 | 不做 |

### 1.1 用户已确认的决定

| # | 问题 | 决定 |
|---|---|---|
| 1 | 内容格式 | 纯文字，保留换行；标题最长 40 字，正文最长 5000 字 |
| 2 | 管理 | mod / admin 在论坛里直接置顶、加精、删除；第一次加精给作者发固定奖励（tuning，默认 20 张神秘礼券 + 50 钻石），写新闻 |
| 3 | 分类 | 闲聊 / 攻略 / 建议反馈；精华是单独的筛选，不是分类 |
| 4 | 附加功能 | 回复某一楼、匿名回复、作者看阅读明细、删回复，都做 |
| 5 | 存储方式 | 计数（阅读、赞、踩、回复、最后回复时间）冗余存在帖子行上，和操作在同一事务里更新 |

## 2. 规则

功能键 `forum` 加入已实现功能。事件键 `post.` 已经映射到它（4E-1 裁定 22），支线 107"发表一篇帖子"随之开放，跳转改为 `/forum`。下面的"管理员"指账号角色为 `mod` 或 `admin`。

### 2.1 发帖、编辑、删帖

- **发帖** `POST /forum/posts {category, title, content}`：
  - 需要验证邮箱，否则报 `EMAIL_NOT_VERIFIED`。
  - `category` ∈ `chat` / `guide` / `feedback`。
  - 标题、正文先去掉首尾空白再检查：标题 1~`titleMax`（40）字，正文 1~`contentMax`（5000）字，按字符计（emoji 算 1 个）。不合格报 `INVALID_STATE` reason `post_text`，带 `max`。
  - 正文去掉 `\r`，连续 3 个以上空行压成 2 个。
  - 防刷屏：同一家店两次发帖至少隔 `postCooldownSec`（60）秒，否则报 `COOLDOWN` what `forum_post`，带剩余秒数；每天最多 `postDailyMax`（10）篇，否则报 `LIMIT_REACHED` `forum_post`。
  - 触发事件 `post.create`，算支线。
- **编辑** `PUT /forum/posts/:id {category, title, content}`：
  - 作者或管理员可以改，校验同发帖，不受冷却限制。
  - 记 `edited_at`，并在 rest_log 记下是谁改的。
  - 别人报 `FORBIDDEN`；已删除的帖子报 `NOT_FOUND`。
- **删帖** `DELETE /forum/posts/:id`：
  - 作者可以删，但置顶或加精的不能删（报 `INVALID_STATE` reason `post_locked`）。管理员什么都能删。
  - 软删除（`deleted_at`），从列表和搜索里消失，详情页返回 `NOT_FOUND`。

### 2.2 回复

`POST /forum/posts/:id/replies {content, replyTo?, anonymous}`

- 需要验证邮箱。正文 1~`replyMax`（500）字，处理方式同帖子正文。
- 同一家店两次回复至少隔 `replyCooldownSec`（60）秒（原版规则，跨帖子计），否则报 `COOLDOWN` what `forum_reply`。
- 楼层号：锁住帖子行，`floor = reply_count + 1`，同时 `reply_count + 1`、`last_reply_at = now`。楼层号从 1 开始，删除不回收。
- `replyTo` 是本帖某条回复的楼层号，必须存在（已删除的也可以）。否则报 `INVALID_STATE` reason `reply_to`。
- `anonymous = true` 时，其他人看到的店名是"匿名"、店号为空；管理员和回复者本人能看到真名，前端标"（匿名）"。
- **删回复** `DELETE /forum/replies/:id`：回复者或管理员可以删。软删除后楼层保留，内容显示"该回复已删除"。
- 已删除的帖子不能回复（`NOT_FOUND`）。

### 2.3 赞、踩、阅读

- **赞和踩** `POST /forum/posts/:id/react {kind: 'up' | 'down'}`：
  - 每家店对每篇帖子只能有一个态度：没有就加上；相同就取消；不同就改过来（原版要求先取消，这里直接切换）。
  - 帖子上的 `up_num` / `down_num` 同步增减。
  - 返回 `{ mine: 'up' | 'down' | null, up, down }`。
- **阅读**：
  - 打开详情 `GET /forum/posts/:id` 时记一次阅读：`forum_read` 按（帖子, 店）累加 `times`、更新 `last_at`。
  - 第一次读时帖子 `read_num + 1`，所以阅读数等于读过的店数。作者自己打开不计。
- **阅读明细** `GET /forum/posts/:id/reads`：
  - 只有作者和管理员能看，别人报 `FORBIDDEN`。
  - 列出读过的店：店名、次数、最后阅读时间、态度（赞 / 踩 / 无），按最后阅读时间倒序，最多 200 条。

### 2.4 置顶、加精

`POST /forum/posts/:id/admin {action: 'pin' | 'unpin' | 'feature' | 'unfeature'}`，只有管理员，别人报 `FORBIDDEN`。

- 置顶：`pinned_at = now`；取消时设为 null。置顶帖按置顶时间倒序排在列表最前。
- 加精：`featured_at = now`；取消时设为 null。
- 第一次加精（`feature_rewarded = false`）时：
  - 给作者发 `featureReward`（默认 `{ goods: [[1, 20]], diamond: 50 }`），在作者店的系统操作里发放；
  - 写新闻 `forum.feature`："××的帖子《标题》被加精了"，`feature_rewarded = true`。
  - 取消后再加精不再发奖励。
- 置顶写新闻 `forum.pin`："××的帖子《标题》被置顶了"。取消不写新闻。
- 重复置顶、重复加精不报错，也不重复写新闻。

### 2.5 列表和搜索

`GET /forum/posts?tab=all|chat|guide|feedback|featured&q=关键词&cursor=游标`

- 只列未删除的帖子，每页 `pageSize`（20）。
- 排序：
  - `all` 和三个分类：置顶帖（按置顶时间倒序）在前；其余按最后动态时间倒序（有回复看 `last_reply_at`，没有就看 `created_at`），同时间按 id 倒序。
  - `featured`：只列精华，按加精时间倒序。
- 关键词：标题或正文包含（不区分大小写）。用参数化的 `ILIKE`，`%`、`_`、`\` 先转义；最长 20 字。
- 分页：
  - 置顶帖只在第一页（不带游标时）出现。
  - 普通帖用游标 `(活动时间, id)` 继续翻页；返回 `nextCursor`，没有下一页为 null。
- 每条：id、分类、标题、正文前 60 字、作者店名和店号、发帖时间、最后动态时间、阅读数、赞数、踩数、回复数、是否置顶、是否精华。

## 3. 数据

迁移 `0017_forum`：

**`forum_post`**

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | serial | PK |
| `shard_id` | integer | |
| `rest_id` | integer | 作者店 |
| `category` | text | `chat` / `guide` / `feedback` |
| `title` | text | |
| `content` | text | |
| `created_at` | timestamptz | |
| `edited_at` | timestamptz null | |
| `deleted_at` | timestamptz null | |
| `pinned_at` | timestamptz null | |
| `featured_at` | timestamptz null | |
| `feature_rewarded` | boolean default false | |
| `read_num`、`up_num`、`down_num`、`reply_count` | integer default 0 | |
| `last_reply_at` | timestamptz null | |

索引：`(shard_id, coalesce(last_reply_at, created_at) desc, id desc) where deleted_at is null`、`(shard_id, featured_at desc) where featured_at is not null and deleted_at is null`、`(rest_id, created_at)`。

**`forum_reply`**

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | serial | PK |
| `post_id` | integer | |
| `rest_id` | integer | |
| `floor` | integer | 楼层号；唯一 `(post_id, floor)` |
| `reply_to` | integer null | 回复的楼层号 |
| `anonymous` | boolean | |
| `content` | text | |
| `created_at` | timestamptz | |
| `deleted_at` | timestamptz null | |

索引：`(rest_id, created_at)`。

**`forum_reaction`**：`(post_id, rest_id)` PK，`kind` text（`up` / `down`），`created_at`。

**`forum_read`**：`(post_id, rest_id)` PK，`times` integer，`first_at`、`last_at` timestamptz。

**tuning `forum`**：`titleMax` 40、`contentMax` 5000、`replyMax` 500、`queryMax` 20、`postCooldownSec` 60、`postDailyMax` 10、`replyCooldownSec` 60、`pageSize` 20、`excerpt` 60、`readsMax` 200、`featureReward { goods: [[1, 20]], diamond: 50 }`。构建校验：奖励里的道具存在。

**新闻类型**：`forum.pin`、`forum.feature`。

**任务**：任务 107 的 `href` 改为 `/forum`。

## 4. 接口

| 方法 | 路径 | 请求 | 返回 |
|---|---|---|---|
| GET | `/forum/posts` | `?tab&q&cursor` | `ForumListDto { pinned: PostItemDto[], items: PostItemDto[], nextCursor, me: { canPost, isAdmin, postReadyAt, replyReadyAt } }` |
| POST | `/forum/posts` | `{category, title, content}` | `{ id }` |
| GET | `/forum/posts/:id` | – | `PostDetailDto`：帖子全文、我的态度、我能否编辑 / 删除 / 管理、全部回复（含楼层、`replyTo`、匿名处理后的店名、是否已删除、我能否删除） |
| PUT | `/forum/posts/:id` | `{category, title, content}` | `{ id }` |
| DELETE | `/forum/posts/:id` | – | `{}` |
| POST | `/forum/posts/:id/replies` | `{content, replyTo?, anonymous}` | `ReplyDto` |
| DELETE | `/forum/replies/:id` | – | `{}` |
| POST | `/forum/posts/:id/react` | `{kind}` | `{ mine, up, down }` |
| GET | `/forum/posts/:id/reads` | – | `{ items: [{ restId, name, times, lastAt, reaction }] }` |
| POST | `/forum/posts/:id/admin` | `{action}` | `{ pinned, featured, rewarded }` |

- 写操作走 `runOp`（功能 `forum`），锁当前店。
- 回复、点赞、阅读还要锁帖子行（`select ... for update`），保证楼层号和计数正确。
- 加精发奖励时，在作者店的系统操作里发；作者就是管理员自己时，复用同一个操作。
- 管理员身份每次从 `account.role` 读（`mod` 或 `admin`），不信任前端传入。
- 不同区服互相看不到帖子：查询都带 `shard_id`，跨区访问报 `NOT_FOUND`。

## 5. 前端

- **入口**：小镇页标题右侧一个"论坛"链接；"更多 → 玩法"里加"论坛"。
- **`/forum` 列表**：
  - `.dt-page-title`"论坛"，右侧"发帖"按钮（未验证邮箱时灰掉，并提示要先验证）。
  - 胶囊标签：全部 / 闲聊 / 攻略 / 建议反馈 / 精华。下面是搜索框。
  - 置顶帖带"置顶"标，精华带"精"标。每条 `.dt-item`：分类标、标题、摘要、`dt-meta`"店名 · 时间 · 阅读 N · 赞 N · 回复 N"。
  - 底部"加载更多"。
- **`/forum/:id` 详情**：
  - 标题、分类、作者（链接到好友店页）、时间（编辑过就写"编辑于"），正文保留换行（`white-space: pre-wrap`，文本插值，不用 `v-html`）。
  - 赞和踩按钮（高亮我的态度）。
  - 作者和管理员看到"编辑""删除"，管理员看到"置顶 / 取消置顶""加精 / 取消加精"，作者和管理员看到"阅读明细"（折叠面板）。
  - 回复列表：`#楼层 店名 时间`；有 `replyTo` 时显示"回复 #N"，点击跳到那一楼；可以删的显示"删除"。
  - 底部回复框：文本框、"匿名"勾选框、"回复"按钮。点某楼的"回复"会带上 `replyTo` 并在框上方显示"回复 #N（取消）"。
- **`/forum/new` 和 `/forum/:id/edit`**：分类单选、标题、正文（计数显示 n/5000）、发布。
- 删除前都要确认。按 `docs/design/视觉规范.md` 使用 `.dt-*` 类。

## 6. 测试

服务端：

- 发帖：
  - 未验证邮箱被拒；
  - 标题和正文的长度边界（含 emoji 计数）、空白被拒；
  - 换行规整；
  - 60 秒冷却和每天 10 篇（跨天重置）；
  - 支线 107 完成。
- 编辑：作者和管理员可以改，别人 `FORBIDDEN`；记 `edited_at`。
- 删帖：作者删普通帖成功；作者删置顶或精华帖被拒；管理员都能删；删后列表、详情、回复都拿不到。
- 回复：
  - 楼层递增；并发两条回复楼层号不重复；
  - `replyTo` 不存在被拒；
  - 60 秒冷却跨帖子；
  - 匿名对他人隐藏、对管理员和本人可见；
  - 删回复后保留楼层、内容为空、显示已删除；别人删被拒。
- 赞和踩：加、取消、切换时计数正确；并发两家店同时点赞，计数为 2。
- 阅读：作者自己读不计；同一家店读三次，`read_num` 为 1、`times` 为 3；明细只有作者和管理员能看，态度正确。
- 管理：
  - 非管理员被拒；
  - 置顶排序；
  - 首次加精发奖励并写新闻，取消再加精不重复发；
  - 重复置顶不重复写新闻。
- 列表：
  - 分类和精华筛选；
  - 关键词含 `%` 和 `_` 时按字面匹配；
  - 游标分页不重复、不遗漏；
  - 置顶只在第一页；
  - 跨区服看不到。

前端：
- 列表标签和搜索；
- 详情的按钮按权限显示；
- 回复某一楼、匿名勾选；
- 删除前确认；
- 正文换行显示，并确认 HTML 不会被当作标签渲染。

端到端 `e2e/forum.spec.ts`：
- 发一篇攻略帖，在列表里看到；
- 进入详情，点赞、回复一楼、回复 #1；
- 删除自己的回复，显示"该回复已删除"。

## 7. 文档

- `docs/rules/收益与加成.md` 新增"论坛（子项目 4E-3）"一节：发帖、回复、冷却、加精奖励。
- `docs/deploy.md` 记迁移 0017 和功能开关 `features.forum`。
