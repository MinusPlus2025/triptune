# TripTune

**Your trip, tuned to you. / 为你量身定制的旅程**

TripTune 是中客松 2026「未定信号」赛题的可运行比赛版：把旅人的历史偏好、当次旅行需求、途中变化和活动反馈沉淀为私有旅行数据，用同一个系统为不同旅人、不同目的地生成实质不同的路线。

这个版本不是静态 H5：目的地、天数、预算、人数、兴趣和节奏都来自真实表单输入；生成结果、个人偏好、单站编辑、反馈和改线均写入 SQLite，刷新页面后仍可恢复。Stitch 导出只作为视觉与布局外壳。

## 本地运行

要求 Node.js 24 或更高版本（使用内置 `node:sqlite`，无第三方 npm 依赖）。

```bash
npm start
```

访问 `http://localhost:7860`。运行测试：

```bash
npm test
```

## 评委演示流程

1. 进入「出发简报」，输入上海，以林默生成 3 天、松弛节奏的建筑/书店/爵士路线。
2. 把城市改成北京、杭州、成都、广州或南京，重新生成；地点库、区域、地图标签与路线内容一起变化。支持中英文城市名和机场三字码。
3. 切换为周野，选择 5 天、高密度、骑行/工业遗存/精酿，再生成一次；天数、活动数量、点位与解释均变化。
4. 在「今日漫游」对某个活动提交“很像我”或“太赶了”。反馈即时写入 SQLite。
5. 返回「出发简报」再次生成。结果面板会显示使用的历史反馈数量，活动排序和解释会使用新反馈。
6. 在「途中改线」选择下雨、延误、临时取消或交通受阻，接受替代方案；重启服务后改线仍保留。
7. 在「今日漫游」点击“调整这一站”，修改名称、时间或说明；保存后回到「旅程导览」可看到同一条数据库记录已经同步更新。

页面上的“本次旅程不是预置结果”证据面板会显示本次参与计算的天数、预算、人数、兴趣、节奏、反馈数量和存储方式。

## 数据设计

SQLite 文件默认位于 `data/triptune.sqlite`，也可通过 `TRIPTUNE_DB_PATH` 指定。主要关系表：

- `profiles` / `profile_interests`：脱敏演示旅人与初始偏好；
- `destinations`：支持城市、别名、三字码及界面信息；
- `places`：六座城市的受控地点候选集，不等于预置行程；
- `trip_requests`：每次真实表单输入；
- `itineraries` / `itinerary_days` / `itinerary_activities`：每次重新计算的输出及推荐理由；
- `feedback`：反馈、关联标签及是否为现场反馈；
- `replans`：途中改线建议和接受状态。

推荐器会同时使用 `profileId`、目的地、天数、预算、人数、当次兴趣、节奏与历史反馈。地点候选是受控数据集，行程组合、排序、每日密度和解释为实时计算结果。当前支持上海、北京、杭州、成都、广州、南京；未知城市会明确提示支持范围，避免为任意城市编造不可核验地点。

比赛版不要求先注册登录。当前以两位脱敏测试旅人演示“不同私有数据得到不同结果”，并提供真实可编辑的「我的旅行偏好」。如果后续开放给公众，再把 `profileId` 接到手机号、邮箱或第三方登录即可，不影响现有推荐和数据表结构。

## API

- `GET /api/health`
- `GET /api/profiles`
- `GET /api/destinations`
- `GET /api/profiles/:id`
- `POST /api/profiles/:id`
- `GET /api/itineraries/:profileId-or-itineraryId`
- `POST /api/itinerary/generate`
- `POST /api/itinerary/activities/:activityId`
- `POST /api/itinerary/replan`
- `POST /api/itinerary/accept`
- `POST /api/feedback`
- `GET /api/keepsake/:profileId`
- `POST /api/demo/reset`（确认值：`RESET_TRIPTUNE_DEMO`）

## 魔搭创空间

项目使用 Docker 部署，监听 `0.0.0.0:7860`。`Dockerfile` 使用 Node 24，将 SQLite 写入魔搭持久目录 `/mnt/workspace/triptune`。重命名或迁移创空间仍可能丢失数据，重要数据需备份。完整上线检查见 `DEPLOYMENT.md`。比赛现场至少确认：

- 创空间状态为 `Running`；
- 未登录浏览器可访问；
- 完整跑通“生成 → 对照旅人 → 反馈 → 再生成 → 改线”；
- 若使用模型 API，密钥只放 Secrets，不进入代码、截图或录屏。

## 测试档案与真实运行数据

林默和周野为脱敏合成测试旅人，种子反馈标记为 `demo-seed`。用户在页面输入后产生的请求、行程、单站修改、改线和反馈都是真实运行数据，现场反馈标记为 `live`。重置接口只清除现场生成、改线和 `live` 反馈，不删除地点候选库或种子证据。

当前地点与天气说明来自六座城市的受控候选库，并未接入互联网实时天气、地图、票价或场馆营业状态 API。比赛演示时应表述为“根据实时输入生成并持久化”，不要表述为“实时互联网旅游数据”。
