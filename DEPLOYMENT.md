# 魔搭创空间部署

依据中客松选手手册第 07、08、11 节：必须提供魔搭创空间 Demo 链接，路演状态为 Running。项目采用 Docker，不适合 Static 托管。

## 配置

- Node.js 24，启动命令 `node backend/server.js`。
- 监听 `0.0.0.0:7860`。
- SQLite 目录 `/mnt/workspace/triptune`，由应用自动创建。平台重命名或迁移仍可能丢失数据，需另行备份。
- 仅选免费硬件；付费资源需单独确认。
- 部署 Token 只通过本地环境变量 `MODELSCOPE_API_KEY` 使用，不提交到代码或远程地址中。
- 在空间密文变量配置 `MODELSCOPE_API_KEY`，用于魔搭 `Qwen/Qwen3-VL-8B-Instruct`。只发送用户主动提交的规划文字，不发送个人资料或回忆。不要将密钥写入仓库。
- 模型整理需求，用户确认后交给现有地点库推荐器生成路线；尚未实现联网地点检索、图片输入或语音。
- `/api/planning/interpret` 每进程最多并发2次、每天100次调用，重启会重置该保护。它不是持久化计费限额；公开推广前需补真正登录和持久化限流。

## 上线前检查

- 完成魔搭 Docker 所需的账号绑定和实名认证。
- 确认创空间可见性；参赛 Demo 必须能由评委访问。
- 不上传本地 SQLite、个人照片、真实旅人信息、密钥或环境配置文件。
- 当前两个测试旅人是共享演示档案，不可用于保存真实个人隐私；正式个人空间需账号隔离。
- `frontend/assets/window/SOURCES.md` 中的第三方窗框和音效尚未核实再分发授权，发布前需授权或替换。

## 验收

1. `npm test` 全部通过。
2. 查看 Docker build 日志，再查看 run 日志，确认 Running。
3. 未登录访问公开链接，测试生成、换城市、反馈、改线、编辑、历史旅程和导出。
4. 重启后验证测试旅程保留。
5. 确认最终访问地址后生成二维码，不使用 localhost。

提交：Demo 链接和操作说明、2min+ 演示视频、80×180cm（4:9）高清海报；GitHub 可选。手册提交栏标注 13 日上午 10 点，与日程表的提交准备时间不同，需以组委会最新通知确认。

官方部署流程：https://github.com/modelscope/modelscope-skills/blob/main/skills/ms-studio-deploy/SKILL.md
