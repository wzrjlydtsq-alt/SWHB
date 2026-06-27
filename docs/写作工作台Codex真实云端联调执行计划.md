# 写作工作台 Codex 真实云端联调执行计划

更新时间：2026-05-07

本文只记录 Codex 在下一轮真实 cloud 联调中要领取和完成的任务。当前判断：后端 ECS/RDS 已部署并通过 `smoke-writing.mjs` 36/36；本地 Mock 链路继续保留；下一步重点是桌面端真实 cloud adapter 联调中的契约守门、最小胶水修复和最终验收。

---

## 1. 当前总状态

| 优先级 | 模块 | 状态 | 当前阻塞 | 下一动作 |
| --- | --- | --- | --- | --- |
| P0 | 后端写作 API smoke | 已完成 | 无 | 保持 36/36，不回退 |
| P0 | 前端 cloud 契约守门 | 进行中 | 等 GLM-5.1 接入真实 UI 流程后回收 | 检查路径、方法、字段、错误态 |
| P0 | 真实任务流转 UI 胶水 | 未完成 | 需要真实账号/团队/剧项目/分镜数据 | 协助补 `projectId / episodeId / shotId / assigneeId` 接入 |
| P1 | 生成结果真实回流 | 未完成 | 需要 cloud 模式真实分镜节点和生成结果 | 验证 `sourceMeta` 到候选媒体接口的真实链路 |
| P1 | 通知与轮询 | 已完成基础版 | WebSocket 后置 | 保持 45 秒轮询与 toast 兜底 |
| P2 | 审核历史 UI | 后置 | 不阻塞本轮 | 只守住后端类型与文档，不抢 GLM UI 任务 |

---

## 2. Codex 任务 C2：真实 cloud 联调总控与契约守门

负责文件：

- `src/renderer/features/writing/assignmentClient.ts`
- `src/renderer/features/writing/TaskCenterPanel.tsx`
- `src/renderer/features/writing/useWritingTaskPoller.ts`
- `src/renderer/services/cloud/writingClient.ts`
- `src/renderer/services/cloud/writingTypes.ts`
- `server/scripts/smoke-writing.mjs`
- `docs/写作工作台剩余未完成执行计划.md`
- `docs/写作工作台云端闭环测试矩阵.md`
- `docs/写作工作台多模型回收与修复任务.md`

任务：

1. 守住最终后端契约。
   - `GET /writing/assignments/me`：我接收的任务。
   - `GET /writing/assignments/sent`：我发出的任务。
   - `PATCH /writing/assignments/:id/accept`：接收任务。
   - `PATCH /writing/assignments/:id/submit`：提交任务。
   - `POST /writing/shots/:shotId/media-candidates`：绑定候选媒体。
   - `POST /writing/shots/:shotId/review`：导演审核。
   - 禁止回退到 `GET /writing/assignments/me?direction=sent`。
2. 确认前端 DTO 与后端字段一致。
   - 创建任务使用 `shot_id / text_asset_id / episode_id / assignee_id / title / description / deadline`。
   - 分镜候选媒体使用 `thumb_oss_key`。
   - 通知接口使用 `WritingNotificationDTO` 与 `WritingNotificationListResponse`。
3. 协助 GLM-5.1 切换 writing adapter 到 `cloud`。
   - 默认仍保留 `local`。
   - cloud 开关必须可控。
   - 不允许影响本地 Mock 演示。
4. 若 UI 缺真实云端 ID，补最小胶水。
   - 不伪造数字 ID。
   - 不把本地字符串 ID 转成 `0`。
   - 缺数据时给 toast 或明确空状态。
5. 回收 DeepSeek 测试数据任务。
   - 确认真实导演 A、组员 B、团队、项目、剧集、分镜、`assignee_id` 可用。
   - 如测试数据脚本新增，确认不输出真实 token 和密码。
6. 回收 GLM-5.1 真实 UI 联调。
   - 导演 A 分发任务。
   - 组员 B 接收任务。
   - 组员 B 提交任务。
   - 导演 A 看到待审核。
7. 回收生成结果真实回流。
   - 分镜创建画布节点后，节点 `settings.source === 'writing-studio'`。
   - `sourceType === 'storyboard-shot'`。
   - `sourceMeta.shotId`、`episodeId`、`projectId` 等真实字段存在。
   - 生成结果可进入真实分镜候选媒体。
8. 统一更新文档状态。
   - 已通过的写“已通过”。
   - 未实际跑 UI 的写“待人工联调”。
   - 不再写 RDS 阻塞。

验收：

- `npm run build` 通过。
- `npm test -- --run` 通过。
- `npm --prefix server run build` 通过。
- ECS 上 `node scripts/smoke-writing.mjs` 保持 36/36。
- 本地 Mock 任务中心仍能完整演示。
- cloud 模式不再因为路径、方法、字段错位产生 404/405/400。
- 真实联调失败时有清晰错误，不静默失败。

---

## 3. Codex 回收检查清单

### 3.1 DeepSeek-4-Pro 回收点

需要检查：

1. 是否提供最小真实联调用测试数据。
2. 是否能拿到真实 `projectId / episodeId / shotId / assigneeId`。
3. ECS smoke 是否仍为 36/36。
4. 是否没有新增敏感信息输出。

验收：

- 后端不回退。
- 权限模型不放宽。
- 测试数据能支撑 GLM-5.1 做 UI 联调。

### 3.2 GLM-5.1 回收点

需要检查：

1. adapter 切换是否可控。
2. local 默认模式是否保留。
3. cloud 模式是否使用 `/assignments/sent`。
4. 真实任务流转是否能从 UI 跑通。
5. Notification 被拒绝时是否 toast 兜底。
6. 错误态是否可见。

验收：

- `npm run build` 通过。
- 不出现 `?direction=sent`。
- 不出现 `Number(mockId) || 0` 这类云端 ID 伪造。

### 3.3 GLM-5V-Tuber 回收点

需要检查：

1. 真实 cloud 数据下任务中心是否拥挤。
2. 1366x768 是否可用。
3. toast/通知是否遮挡关键按钮。
4. 状态 badge 文案是否统一。

验收：

- P0 视觉问题必须落代码。
- P1/P2 可写入报告后置。

### 3.4 Gemini-3.1-Pro 回收点

需要检查：

1. 后端 API 已通过和桌面 UI 待联调是否分开写。
2. 新增 UI 联调矩阵是否覆盖登录、团队、项目、剧集、分镜、任务、回流、审核。
3. 未实际验证的项是否标为“待人工联调”。

验收：

- 文档无旧 RDS 阻塞口径。
- 每条状态能追溯到命令输出或 UI 操作结果。

---

## 4. Codex 本轮不做的内容

以下内容不在 Codex C2 主任务内，除非回收时发现它们阻塞 cloud 联调：

- 不重做写作工作台布局。
- 不把本地 Mock 删除。
- 不实现 WebSocket 实时推送。
- 不扩展完整评论线程 UI。
- 不新增大范围权限模型。
- 不重写素材库信息架构。

---

## 5. 最终交付格式

回收完成后，Codex 输出：

1. 修改文件列表。
2. 真实联调结果。
3. build/test/smoke 命令结果。
4. 剩余风险。
5. 需要继续派给其他模型的事项。

只认以下证据：

- 命令输出。
- UI 截图或明确操作结果。
- 真实接口返回。
- 文档中可追溯的验收记录。

---

## 6. 2026-05-07 Codex-C2 本地回收记录

已完成：
- 前端 cloud assignment client 守住最终契约：`GET /writing/assignments/me`、`GET /writing/assignments/sent`、`PATCH /accept`、`PATCH /submit`，未发现回退到 `?direction=sent`。
- `CreateWritingAssignmentRequest` 补齐 `source_meta`，分发任务时透传 `source: writing-studio`、`sourceType: storyboard-shot`、`episodeId`、`shotId`、`shotInfo` 等来源字段。
- cloud 模式下分发弹窗改为显式填写真实 `episode_id / shot_id / assignee_id`，不再用本地 Mock 成员 ID 或空 `episodeId` 静默提交云端。
- cloud 模式下 `assignment_id`、`media_candidate_id` 统一走数字 ID 校验，拒绝本地 Mock 字符串被 `Number(...)` 转成非法云端 ID。
- 前端 cloud client 补齐 `GET /writing/shots/:shotId/review-history` 与 `GET /writing/comments/:commentId/replies` 类型和方法。
- 修正 adapter 切换按钮在未登录时的本地 UI 状态回写，避免切换被拒绝但按钮显示为 cloud。

本地验证：
- `npm run build`：通过。
- `npm test -- --run`：通过，6 个测试文件、57 条测试。
- `npm --prefix server run build`：通过。
- `npm --prefix server test`：通过，1 个测试文件、2 条测试。

待人工真实联调：
- 需要导演 A / 组员 B 真实账号、同团队、真实项目、剧集、分镜 ID 后，在桌面 UI cloud 模式下跑分发、接收、提交、待审核闭环。
- ECS `node scripts/smoke-writing.mjs` 本轮未在远端执行，本地只验证了前后端 build/test。

---

## 7. 2026-05-07 Codex-C2 追加回收：审核 / ECS / Typecheck

已完成：
- 公网 ECS HTTP smoke 直接请求 `http://47.109.138.168/api/v1`，覆盖登录、团队、写作项目、剧集、文本资产、版本、剧本解析、分镜、素材、候选媒体、任务分发、接收、提交、导演审核、通知、审核历史、评论与评论回复。
- 导演审核闭环已在公网后端通过：`POST /writing/shots/:shotId/review` 返回 200，随后 `GET /writing/shots/:shotId/review-history` 返回 200。
- `GET /health` 与 `GET /ready` 均返回 ok，`/ready` 显示 `APP_ENV=production`、RDS、OSS 配置可用。
- 默认 `npm run typecheck` 已改为渐进式门禁，覆盖 cloud/writing 关键契约、写作解析/分镜/版本测试、cloud service 类型；全量旧债保留为 `npm run typecheck:full`。
- `src/renderer/utils/toast.ts` 补齐 TypeScript 参数类型，解除写作/cloud 适配层的 toast 调用类型错误。

验证结果：
- 公网 ECS HTTP smoke：38/38 通过。
- `npm run typecheck`：通过。
- `npm run build`：通过。
- `npm test -- --run`：通过，6 个测试文件、57 条测试。
- `npm --prefix server run build`：通过。
- `npm --prefix server test`：通过，1 个测试文件、2 条测试。

保留风险：
- `npm run typecheck:full` 仍显示历史类型债务，当前 Top 文件为 `src/renderer/utils/canvasTools.ts`、`src/renderer/components/canvas/ReactFlowCanvas.tsx`、`src/renderer/hooks/useGenerationManager.ts`、`src/renderer/features/production/ProductionBoard.tsx`、`src/renderer/store/useAppStore.ts` 等。
- 桌面端真实双账号 UI 流程仍待 2026-05-08 由人工辅助联调。

---

## 8. 2026-05-07 Codex-C2 追加：写作账号身份层

已完成：
- 新增写作工作台身份层：本地模式提供模拟身份，cloud 模式读取当前登录用户作为写作身份。
- 写作工具栏显示“当前编剧”，本地模式可切换模拟身份，cloud 模式显示登录用户。
- 本地草稿与版本快照新增 `authorId / authorName`，版本列表显示保存人，能回答“这版是谁写/存的”。
- 本地任务分发不再固定为默认导演账号，而是使用当前写作身份作为发起人。
- adapter 切换后会刷新写作身份，避免从 local 切 cloud 后身份仍显示本地用户。

验证结果：
- `npm run typecheck`：通过。
- `npm test -- --run`：通过，6 个测试文件、57 条测试。
- `npm run build`：通过。

后续真实联调检查点：
- cloud 登录用户是否正确显示为当前编剧。
- 保存版本、提交任务、评论与审核记录是否分别落到正确的云端用户 ID。
