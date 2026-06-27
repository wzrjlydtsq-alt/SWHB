# M2+ 云素材拖拽流转与写作工作台执行计划

更新时间：2026-05-06

## 1. 当前判断

“插入画布 / 加入资产库 / 加入批量生产板”不应该继续做成固定按钮。

原因：

- 同一个云素材可能是人物参考图、场景参考图、普通素材、视频参考、音频参考、剧本文档。
- 固定按钮必须猜目标，很容易猜错。
- 用户自己拖到目标区域，语义最准确，也更符合创作软件直觉。

推荐方向：

- 云素材卡片支持拖拽。
- 拖到画布空白处：按素材类型创建节点。
- 拖到已有节点：作为该节点的引用素材填入。
- 拖到资产库分类：进入对应分类。
- 拖到批量生产板单元格：进入角色 / 道具 / 场景 / 图片 / 音频 / 视频对应字段。

## 2. 分类答案

### 2.1 加入资产库加入哪个

不再用一个“加入资产库”按钮决定，而是按拖拽落点决定。

资产库分类建议扩展为：

- `characters`：人物。
- `scenes`：场景。
- `props`：道具。
- `materials`：通用素材 / 参考图 / 纹理 / 风格图。
- `audio`：音频。
- `video`：视频。
- `documents`：剧本 / 文档 / 提示词文本。

当前本地资产库只有 `characters / scenes / materials / audio`，需要补 `props / video / documents`。

### 2.2 插入画布插入哪个节点

拖到画布空白处时按类型创建：

- 图片：默认创建 `gen-image` 节点，并放入参考图字段。
- 视频：默认创建 `gen-video` 节点，并放入参考视频字段。
- 音频：创建 `gen-video` 或导演相关节点时作为参考音频；如果空白处拖入，先创建 `sticky-note` 提示用户选择用途。
- 文档 / 文本：创建 `novel-input` 节点，作为剧本/文本输入。
- 项目文件 / 其他：创建 `sticky-note` 节点，记录云素材名称、下载入口和来源。

拖到已有节点时按节点能力填入：

- `gen-image`：图片进入 `manualImages` / reference images。
- `gen-video`：图片进入参考图，视频进入参考视频，音频进入参考音频。
- `novel-input`：文档/文本进入正文。
- `director-node` / `director-stage`：图片/视频作为分镜参考素材。
- `sticky-note`：写入素材链接与说明。

### 2.3 插入批量生产板插入哪个字段

拖到批量生产板的具体单元格决定字段：

- 角色列：`refCharacters`
- 道具列：`refProps`
- 场景列：`refScenes`
- 参考图列：`refImages`
- 参考音频列：`refAudios`
- 参考视频列：`refVideos`

如果拖到批量生产板空白处：

- 图片默认进 `refImages`。
- 音频默认进 `refAudios`。
- 视频默认进 `refVideos`。
- 文档默认弹出“导入为批量任务 / 作为备注 / 取消”。

## 3. 拖拽协议

云素材卡片拖拽时写入：

```ts
type CloudAssetDragPayload = {
  source: 'cloud-assets'
  assetId: number
  teamId: number
  name: string
  assetType: 'image' | 'video' | 'audio' | 'document' | 'project' | 'other'
  mimeType: string
  fileSize: number
  tags: string[]
  thumbUrl?: string
  downloadUrl?: string
  ossKey?: string
}
```

DataTransfer key：

- `application/x-xinghe-cloud-asset`
- 兼容已有本地拖拽：同时写入 `asset-path` 或 `asset-url`，但真实云素材优先用上面的 JSON。

落点统一处理：

```ts
type CloudAssetDropTarget =
  | { kind: 'canvas-empty'; x: number; y: number }
  | { kind: 'canvas-node'; nodeId: string; nodeType: string }
  | { kind: 'asset-library'; category: string; folderId?: string }
  | { kind: 'production-cell'; rowId: string; field: string }
  | { kind: 'production-board-empty' }
```

## 4. 预览与缩略图

### 4.1 最小可用版本

- 云素材列表展示类型图标。
- 图片素材悬停或点击时请求 `download-url`，显示图片预览。
- 视频素材点击时请求 `download-url`，用 `<video controls>` 预览。
- 音频素材点击时请求 `download-url`，用 `<audio controls>` 预览。
- 文档素材点击时显示文件信息，提供下载。

### 4.2 标准版本

后端新增字段：

- `thumb_oss_key`
- `preview_oss_key`
- `preview_status`: `pending | ready | failed | skipped`
- `duration_sec`
- `width`
- `height`

上传后处理：

- 图片：生成 320px WebP 缩略图。
- 视频：抽取第 1 秒或中间帧生成 WebP 缩略图。
- 音频：先用类型卡片，后续可生成波形图。
- 文档：先用类型卡片，后续可生成首页预览图。

## 5. 大组/小组/权限模型修正

### 5.1 加入小组自动加入上级大组

规则：

- 用户加入某个小组时，如果小组属于大组，则必须自动成为该大组成员。
- 如果大组加入策略是 `approval`，但用户是通过小组邀请码加入，应视为小组授权通过，自动加入大组为 `member`。
- 如果用户离开最后一个小组，不自动退出大组，避免误删权限；后续由管理员清理。

### 5.2 权限角色

大组角色：

- `owner`：拥有者，能删除/归档大组、任命管理员、管理全部小组和成员。
- `admin`：管理员，能创建/归档小组、审核加入、管理成员，不能删除大组和转移 owner。
- `member`：普通成员，能查看自己加入的大组和可见小组，能上传/接收/发送权限内素材。
- `viewer`：只读成员，能查看和下载允许素材，不能上传、发送、审核。

小组角色：

- `owner`：小组负责人，能删除/归档小组、管理成员、管理小组素材。
- `admin`：子管理员，能审核小组加入、管理普通成员、管理小组素材。
- `member`：普通成员，能上传、发送、接收小组素材。
- `viewer`：只读成员。

权限继承：

- 大组 `owner/admin` 对大组下所有小组拥有管理权限。
- 小组 `owner/admin` 只管理该小组。
- 普通成员只拥有自己加入小组的素材权限。

## 6. 用户头像

后端：

- `PATCH /users/me` 支持 `nickname` 和 `avatar_url`。
- 可选：`POST /users/me/avatar/upload-url` 生成 OSS 头像上传地址。

前端：

- 云素材面板顶部显示头像。
- 成员列表显示头像。
- 发送素材弹窗显示头像。
- 审核中心显示申请人头像。

头像默认规则：

- 有 `avatar_url` 用头像。
- 没有头像用昵称首字或用户编号生成圆形占位。

## 7. Claude 执行任务拆分

Claude 只做代码，不写文档。

### 任务 A：云素材卡片拖拽源

负责文件：

- `src/renderer/features/cloud-assets/CloudAssetsPanel.tsx`
- `src/renderer/features/cloud-assets/CloudAssetsPanel.css`

目标：

- AssetCard 支持 `draggable`。
- `onDragStart` 写入 `application/x-xinghe-cloud-asset`。
- 如果卡片还没有 `downloadUrl`，先不要阻塞拖拽，只写 `assetId/teamId`；落点再异步取下载地址。
- 卡片 hover 时显示“可拖到画布 / 资产库 / 批量生产板”提示。

验收：

- 拖起云素材卡片时浏览器 DataTransfer 内能读到 JSON。
- 不影响现有下载、发送、预览按钮。

### 任务 B：云素材预览弹窗

负责文件：

- `src/renderer/features/cloud-assets/CloudAssetsPanel.tsx`
- `src/renderer/features/cloud-assets/CloudAssetsPanel.css`

目标：

- 点击素材预览区域打开预览弹窗。
- 图片显示 `<img>`。
- 视频显示 `<video controls>`。
- 音频显示 `<audio controls>`。
- 其他类型显示文件信息和下载按钮。
- 预览地址通过 `assetsApi.getDownloadUrl(teamId, asset.id)` 获取。

验收：

- 图片/视频/音频至少能用真实 OSS 下载地址预览。
- 加载失败时显示错误，不让整个素材库崩。

### 任务 C：资产库拖拽落点

负责文件：

- `src/renderer/utils/assetLibrary.ts`
- 找到本地资产库面板组件后补 drop handler。

目标：

- 资产库分类支持接收 `application/x-xinghe-cloud-asset`。
- 拖到人物/场景/道具/素材/音频/视频/文档分类时写入对应分类。
- 当前本地资产库补齐 `props / video / documents` 分类。
- 云素材写入本地资产库时保存 `cloudAssetId/teamId/source='cloud'`，不要只保存本地 path。

验收：

- 云素材拖到资产库分类后能看到条目。
- 刷新后仍然存在。

### 任务 D：批量生产板拖拽落点

负责文件：

- `src/renderer/features/production/ProductionBoard.tsx`

目标：

- 复用现有 `MediaCell` 拖拽逻辑。
- 支持读取 `application/x-xinghe-cloud-asset`。
- 根据单元格写入 `refCharacters/refProps/refScenes/refImages/refAudios/refVideos`。
- 如果云素材没有本地 path，先保存 `cloud://team/{teamId}/asset/{assetId}` 或下载地址作为 path，后续统一解析。

验收：

- 云图片拖到参考图列能显示。
- 云音频拖到参考音频列能显示。
- 云视频拖到参考视频列能显示。

### 任务 E：画布拖拽落点

负责文件：

- `src/renderer/components/canvas/ReactFlowCanvas.tsx`
- `src/renderer/store/slices/createCanvasSlice.ts`
- 必要时新增 `src/renderer/utils/cloudAssetDrop.ts`

目标：

- 画布空白处接收云素材拖拽并创建节点。
- 已有节点接收云素材拖拽并写入节点 settings。
- 新增统一函数 `resolveCloudAssetForDrop(payload)`，负责拿 download-url。

默认映射：

- 图片空白处：创建 `gen-image`，写 `manualImages`。
- 视频空白处：创建 `gen-video`，写 `refVideos` 或对应视频参考字段。
- 文档空白处：创建 `novel-input`。
- 其他空白处：创建 `sticky-note`。

验收：

- 云图片拖到空白画布能创建图片生成节点。
- 云图片拖到已有图片节点能追加参考图。
- 不影响本地文件拖拽。

### 任务 F：组织权限与头像前端补口

负责文件：

- `src/renderer/features/cloud-assets/CloudAssetsPanel.tsx`
- `src/renderer/services/cloud/types.ts`
- `src/renderer/services/cloud/cloudClient.ts`

目标：

- 成员列表显示头像。
- 发送弹窗显示头像。
- 管理员入口更明确：成员管理、审核、归档、删除、角色修改。
- 前端权限提示按 owner/admin/member/viewer 显示。

验收：

- owner 能看到删除/归档/成员管理。
- admin 能看到审核/成员管理，但不能删除大组。
- member 只能看到普通操作。

## 8. 我们这边后端任务

### 任务 G：加入小组自动加入大组

负责文件：

- `server/src/routes/teams.ts`
- `server/src/routes/organizations.ts`
- `server/src/services/permissionService.ts`

目标：

- `/teams/join` 成功加入小组后，如果 team 有 `org_id`，自动 `INSERT IGNORE organization_members`。
- `/join-requests/:id/review` 审核通过小组申请后，同步加入上级大组。
- 写 audit log。

### 任务 H：头像 API

负责文件：

- `server/src/routes/users.ts`
- `server/src/services/ossService.ts`
- `src/renderer/services/cloud/cloudClient.ts`
- `src/renderer/services/cloud/types.ts`

目标：

- `PATCH /users/me` 支持昵称和头像。
- 可选头像上传 STS/签名 URL。

### 任务 I：缩略图字段

负责文件：

- `server/migrations/003_asset_previews.sql`
- `server/src/routes/assets.ts`

目标：

- assets 表新增 `thumb_oss_key / preview_oss_key / preview_status`。
- API 返回 `thumb_url` 或 `thumb_oss_key`。
- 最小版先由前端按需请求 download-url 预览；后端缩略图处理后续做 worker。

## 9. 写作软件草案

产品定位：

面向编剧、导演、分镜、素材制作组的协作式剧本到生成资产工作台。

核心流程：

1. 编剧在 IDE 风格编辑器里写剧本。
2. 剧本按项目、季、集、场次、角色、地点管理。
3. 编辑器支持分屏对比、版本 diff、文字自动改色、批注。
4. 完成后分发“导演剧本”给导演。
5. 导演基于每集剧本生成分镜本。
6. 导演抽取全局人物、场景、道具、风格提示词。
7. 导演按任务分发给组员。
8. 组员接收任务后可一键创建画布节点，或导入批量生产板。
9. 生成结果回流到云素材库、分镜本、资产库和项目仓库。

### 9.1 数据结构

项目仓库：

- Project
- Season
- Episode
- Scene
- Beat
- Character
- Location
- Prop
- ScriptVersion
- Comment
- Assignment
- GeneratedAsset

剧本文档结构：

```ts
type ScriptDocument = {
  projectId: string
  episodeId: string
  versionId: string
  scenes: ScriptScene[]
}

type ScriptScene = {
  id: string
  title: string
  location?: string
  timeOfDay?: string
  characters: string[]
  body: ScriptBlock[]
}

type ScriptBlock =
  | { type: 'scene-heading'; text: string }
  | { type: 'action'; text: string }
  | { type: 'character'; text: string }
  | { type: 'dialogue'; speaker: string; text: string }
  | { type: 'parenthetical'; text: string }
  | { type: 'transition'; text: string }
```

### 9.2 编辑器能力

MVP：

- 类 IDE 左侧项目树。
- 中间剧本编辑器。
- 右侧大纲/人物/场景/批注。
- 自动识别场景标题、角色名、对白、动作描述。
- 不同文本块自动上色。
- 分屏对比两个版本。
- 导出导演剧本。

后续：

- 多人实时协作。
- 行级批注。
- 剧本锁定和审批。
- AI 辅助拆解角色、场景、道具。

### 9.3 导演工作台

MVP：

- 从剧本生成每集分镜列表。
- 每个分镜包含：镜号、画面描述、景别、运动、角色、场景、道具、提示词。
- 支持一键生成画布节点。
- 支持导入批量生产板。
- 支持分发给小组成员。

后续：

- 分镜版本管理。
- 分镜预览板。
- 导演批注和返工流。

### 9.4 任务分发

任务类型：

- 剧集任务。
- 分镜任务。
- 人物任务。
- 场景任务。
- 道具任务。
- 音频任务。
- 视频任务。

任务状态：

- `draft`
- `assigned`
- `accepted`
- `in_progress`
- `submitted`
- `reviewing`
- `approved`
- `rejected`
- `archived`

组员接收后：

- 一键创建画布节点。
- 导入批量生产板。
- 加入个人待办。
- 回传生成结果到云素材库。

## 10. 写作软件 Claude 首批执行任务

Claude 任务 W1：写作工作台壳子

负责文件：

- 新建 `src/renderer/features/writing/WritingStudio.tsx`
- 新建 `src/renderer/features/writing/WritingStudio.css`
- 接入侧边栏入口。

目标：

- 左侧项目树。
- 中间编辑器区域。
- 右侧大纲/批注。
- 先用 mock 数据。

Claude 任务 W2：剧本文本块解析

负责文件：

- 新建 `src/renderer/features/writing/scriptParser.ts`
- 新建测试 `src/renderer/features/writing/scriptParser.test.ts`

目标：

- 识别场景标题。
- 识别角色名。
- 识别对白。
- 识别动作描述。
- 输出 `ScriptBlock[]`。

Claude 任务 W3：编辑器自动改色

负责文件：

- `src/renderer/features/writing/WritingStudio.tsx`
- `src/renderer/features/writing/WritingStudio.css`

目标：

- 场景标题、角色名、对白、动作描述用不同颜色。
- 支持点击左侧场景跳转。
- 支持右侧大纲显示场景和角色。

Claude 任务 W4：分屏对比 Mock

负责文件：

- `src/renderer/features/writing/WritingStudio.tsx`

目标：

- 增加“分屏对比”开关。
- 左右显示两个版本。
- 先做静态 mock diff 样式。

Claude 任务 W5：导演分镜本 Mock

负责文件：

- 新建 `src/renderer/features/writing/DirectorScriptBoard.tsx`
- 新建 `src/renderer/features/writing/DirectorScriptBoard.css`

目标：

- 展示每集分镜列表。
- 每条分镜有“一键创建节点”“导入批量生产板”“分发给组员”按钮。
- 按钮先 mock，不接云接口。

## 11. 验收顺序

第一批：

- 云素材可拖拽。
- 云素材可预览。
- 云图片能拖进批量生产板参考图。
- 云图片能拖到画布创建节点。

第二批：

- 资产库分类扩展。
- 用户头像。
- 权限 UI 更清晰。
- 加入小组自动加入大组。

第三批：

- 写作工作台 mock。
- 剧本解析。
- 分屏对比。
- 导演分镜本 mock。

