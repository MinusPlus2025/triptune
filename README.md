# TripTune

**Your trip, tuned to you. / 为你量身定制的旅程**

TripTune 帮你安排适合自己的旅行。选好目的地，告诉我们旅行天数、预算、同行人数，以及你喜欢的活动和旅行节奏，就能生成一份可以随时调整的行程。
出发前，查看每天去哪儿、做什么；途中遇到下雨、延误或临时变动，重新安排接下来的活动。行程和修改会自动保存，方便下次继续查看。你对每次安排的反馈，也会帮助下一次旅行更贴近你的喜好。
## 本地运行

要求 Node.js 24 或更高版本（使用内置 `node:sqlite`，无第三方 npm 依赖）。

```bash
npm start
```

访问 `http://localhost:7860`。运行测试：

```bash
npm test
```

## 如何使用

1. **规划旅行**：填写目的地、天数、预算和同行人数，选择喜欢的活动与旅行节奏，生成行程。
2. **查看安排**：在「我的行程」查看每天去哪儿，打开某一天了解具体安排。
3. **随时修改**：点击「调整这一站」，修改名称、时间或说明，保存后同步到行程中。
4. **应对变化**：遇到下雨、延误或活动取消，在「调整行程」选择对应情况，查看并确认替代安排。
5. **留下反馈**：告诉我们哪些安排合心意、哪些太赶，让下一次推荐更贴近你的喜好。
6. **保存与回看**：在「我的」查看已保存的旅程，也可以在行程的「旅行回忆」中导出行程文件。

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

## 在线体验与部署
访问：https://ming20260912-triptune.ms.show ，开始规划旅行。
自行部署的环境配置、数据备份和密钥管理，详见部署说明。

## 使用说明与数据范围
当前提供林默和周野两份虚构的体验档案，方便比较不同偏好下的行程安排。行程、修改和反馈会保存，但体验档案由访问者共享，并非独立个人账号，请勿填写隐私信息。
目前支持上海、北京、杭州、成都、广州和南京。行程根据已整理的地点资料与你的需求生成；天气、费用和路线说明仅供规划参考。出发前，请确认最新天气、交通及场馆开放信息。
