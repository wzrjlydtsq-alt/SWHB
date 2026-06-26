# 星河智绘 (Xinghe Zhihui) — Code Wiki

> **版本**: 2.0.46  
> **作者**: 郭瑞凡 (Guo Ruifan)  
> **最早开发时间**: 2026-03-20  
> **仓库**: https://github.com/wzrjlydtsq-alt/SWHB

---

## 目录

1. [项目概述](#1-项目概述)
2. [核心创作流程](#2-核心创作流程)
3. [AI 生成管线](#3-ai-生成管线)
4. [节点画布系统](#4-节点画布系统)
5. [3D 导演台](#5-3d-导演台)
6. [AI 副驾工具系统](#6-ai-副驾工具系统)
7. [宠物系统](#7-宠物系统)
8. [剧本解析与分镜](#8-剧本解析与分镜)
9. [云端素材与制片协作](#9-云端素材与制片协作)
10. [整体架构](#10-整体架构)
11. [数据层](#11-数据层)
12. [项目运行与构建](#12-项目运行与构建)

---

## 1. 项目概述

**星河智绘**是一款面向影视动画行业的桌面端 AI 创作工具。它将 AI 图像/视频生成能力与可视化节点编辑器深度整合，提供从文字到画面的全链路创作体验。

**核心创作链路**：

```
剧本/小说 → 角色提取 → 场景提取 → 导演分镜 → 3D 导演台编排 → AI 生图/生视频 → 制片看板
    ↑                                                                        ↓
    └────────────── AI 副驾（Chat + Function Calling）←──────────────────── 云端素材库
```

---

## 2. 核心创作流程

### 2.1 从文字到画面的完整工作流

```
1. 输入剧本/小说
   ├── NovelInputNode: 粘贴或导入文本
   ├── parseScript(): 按"镜头X"分段
   ├── parseCharacters(): 提取角色信息
   └── parseScenes(): 提取场景描述

2. 导演分镜
   ├── DirectorNode: 设定创意/风格/时长
   ├── 自动生成分镜表（每镜含中英文提示词）
   └── 可手动调整每镜 prompt/duration

3. 3D 场景编排
   ├── Director3DModal: Three.js 3D 预览
   ├── 放置角色人偶（骨骼姿态调节）
   ├── 设置摄像机（景别/跟拍/注视）
   ├── 添加场景道具（墙/门/桌/椅等）
   └── buildDirectorPrompt() → 自动生成英文提示词

4. AI 生成
   ├── GenNode (gen-image/gen-video)
   ├── 提示词 = 用户输入 + 模板 + 连接文本 + 隐藏摄像机/灯光提示词
   ├── 参考图 = 连接图 + 手动图 + 资产ID
   └── Provider 路由 → VolcanoProvider / MidjourneyProvider

5. 结果回流
   ├── outputResults 写入节点
   ├── history 记录生成历史
   ├── seriesResultBridge: 结果回流到云端分镜资产
   └── 制片看板: 批量查看/审核/导出
```

### 2.2 三大工作区

| 工作区 | 标识 | 组件 | 核心功能 |
|--------|------|------|----------|
| **助手** | `assistant` | `WorkspaceHome` | AI 对话 + 项目管理 + 本地文件操作 |
| **画布** | `canvas` | `CanvasFeature` | 节点编辑画布（ReactFlow） |
| **制片** | `production` | `ProductionBoard` | 制片看板 + 无人值守批量生成 |

---

## 3. AI 生成管线

### 3.1 生成流程全链路

```
用户点击"生成"
    │
    ▼
GenNode.handleGenerate()
    │  1. 组装提示词：basePrompt + appliedTemplates + connectedTexts + hiddenPromptParts
    │  2. 组装参考图：connectedImages + manualImages + assetIds
    │  3. 处理视频首尾帧：veoFramesMode → imageRoles
    │  4. 处理全景模式：buildPanoramaPrompt()
    │  5. 批量生成：batchSize 循环
    ▼
useGenerationManager.startGeneration()
    │  1. 解析模型 ID → 查找 API Config
    │  2. 计算 ratio/resolution/duration → getModelParams()
    │  3. 立即写入 history（status='generating'）
    │  4. 图片 base64 串行处理（防 OOM）
    │  5. IPC → engine:submit-task
    ▼
主进程 TaskQueue.submitTask()
    │  1. 入 waitingQueue
    │  2. 并发控制（max 10）
    │  3. 调度到 activeTasks
    ▼
TaskExecutor.execute()
    │  1. Provider 路由：resolveProvider(modelId)
    │  2. 本地文件 → OSS 上传
    │  3. 调用 Provider.generate()
    │  4. 异步任务 → 轮询 Provider.poll()
    ▼
VolcanoProvider / MidjourneyProvider
    │  HTTP 请求 → 远程 AI 服务
    ▼
TaskQueue 广播 task-updated
    │  节流：progress 变化 ≥5% 或间隔 ≥500ms
    ▼
渲染进程 useGenerationManager 监听
    │  1. 更新 history 状态
    │  2. 更新节点 progress/isGenerating/error
    │  3. 完成时 → updatePreviewFromTask()
    ▼
useWorkflowExecutor.updatePreviewFromTask()
    │  1. 写入节点 outputResults
    │  2. 结果回流 → seriesResultBridge
    ▼
GenNode 渲染 OutputResultsPanel
```

### 3.2 Provider 体系

```
IModelProvider (接口)
├── VolcanoProvider    — 火山引擎 Seedance 视频生成
│   ├── generate(): POST /v1/video/generations → 返回 remoteTaskId
│   ├── poll(): GET /v1/video/generations/{id} → 轮询状态
│   └── capabilities: { supportsImageInput, supportsAudioGeneration, isAsyncPolling }
│
└── MidjourneyProvider — Midjourney 图像生成
    ├── generate(): POST /mj/submit/imagine → 返回 remoteTaskId
    ├── poll(): GET /mj/task/{id}/fetch → 轮询状态
    └── capabilities: { supportsImageInput, isAsyncPolling }
```

**Provider 注册与路由** (`registry.ts`)：

```typescript
registerProvider(provider)           // 注册 Provider
bindModel(modelId, providerId)       // 绑定模型到 Provider
resolveProvider(modelId)             // 自动路由：先精确匹配，再模式推断
```

**IModelProvider 接口**：

| 方法 | 说明 |
|------|------|
| `generate(request, apiKey, baseUrl)` | 提交生成任务，返回 `GenerationResult` |
| `poll?(taskId, apiKey, baseUrl)` | 轮询异步任务状态（仅异步模型） |

**GenerationRequest 核心字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `prompt` | string | 文本提示词 |
| `type` | 'image' \| 'video' \| 'text' | 生成类型 |
| `modelId` | string | 模型 ID |
| `ratio` | string | 宽高比 |
| `sourceImages` | string[] | 参考图片 |
| `sourceVideos` | string[] | 参考视频 |
| `sourceAudios` | string[] | 参考音频 |
| `generateAudio` | boolean | 是否生成音频 |
| `imageRoles` | string[] | 图片角色（first_frame/last_frame） |

### 3.3 提示词组装规则

GenNode 中提示词的组装优先级：

```
最终提示词 = [
  appliedTemplates[].content,    // 模板内容
  connectedTexts[],              // 连接节点传入的文本
  basePrompt,                    // 用户手写提示词
  hiddenPromptParts              // 隐藏的摄像机/灯光提示词
].join(', ')
```

**隐藏提示词**：
- `buildHiddenCameraPrompt(_cameraToolState)` — 摄像机角度提示词
- `buildHiddenLightingPrompt(_lightingToolState)` — 灯光预设提示词

**全景模式**：
- `buildPanoramaPrompt(prompt, hasRefImage)` — 图像全景
- `buildVideoPanoramaPrompt(prompt)` — 视频全景

**引用替换**：
- `@图片N` → `【图片N】`
- `@素材N` → `【图片N】`
- `@音频N` → `【音频N】`
- `@视频N` → `【视频N】`

### 3.4 视频首尾帧模式

当 `veoFramesMode` 开启且模型为 Seedance/Veo 时：

```
startFrame = manualStartFrame || getConnectedImageForInput('veo_start')
endFrame   = manualEndFrame   || getConnectedImageForInput('veo_end')

imageRoles = ['first_frame', 'last_frame']  // 根据实际帧数
generationMode = 'image-first-last-frame'
```

---

## 4. 节点画布系统

### 4.1 节点类型与职责

| 节点类型 | 组件 | 核心职责 | 输入 | 输出 |
|----------|------|----------|------|------|
| `gen-image` | `GenNode` | AI 图像生成 | 提示词 + 参考图 + 模板 + 摄像机/灯光 | outputResults (图片) |
| `gen-video` | `GenNode` | AI 视频生成 | 提示词 + 参考图/视频/音频 + 首尾帧 | outputResults (视频) |
| `agent-node` | `AgentNode` | AI Agent 智能代理 | 对话上下文 | AI 回复 |
| `director-node` | `DirectorNode` | 导演分镜编排 | 创意/风格/时长 | 分镜表 |
| `director-stage` | `DirectorStageNode` | 3D 导演台 | 3D 场景配置 | 导演提示词 |
| `novel-input` | `NovelInputNode` | 小说/文本输入 | 文本内容 | 文本流 |
| `sticky-note` | `StickyNoteNode` | 便签标注 | 文字 | — |
| `character-extract` | `CharacterExtractNode` | 角色提取 | 剧本文本 | 角色列表 |
| `scene-extract` | `SceneExtractNode` | 场景提取 | 剧本文本 | 场景列表 |
| `script-shot` | `ScriptShotNode` | 剧本分镜 | 剧本文本 | 分镜列表 |

### 4.2 节点注册机制

`NodeRegistry` (`utils/nodeRegistry.ts`) 管理所有节点类型：

- 所有节点组件采用 `React.lazy()` 懒加载
- 注册时声明节点类型、默认尺寸、默认 settings
- 画布通过 `NodeRegistry.get(type)` 查找并渲染对应组件

### 4.3 节点连接与数据流

节点间通过 ReactFlow 的 Edge 连接，数据流方向：

```
NovelInputNode ──文本──► CharacterExtractNode ──角色──► GenNode
                    ──文本──► SceneExtractNode    ──场景──► GenNode
                    ──文本──► ScriptShotNode       ──分镜──► DirectorNode

DirectorNode ──分镜──► GenNode (gen-image/gen-video)
DirectorStageNode ──3D提示词──► GenNode

GenNode ──图片──► GenNode (图生图/图生视频)
```

**连接类型**：
- `default` — 默认数据流（文本/图片）
- `veo_start` — 视频首帧输入
- `veo_end` — 视频尾帧输入

### 4.4 GenNode 核心交互

GenNode 是最复杂的节点组件，核心交互包括：

| 交互 | 实现 |
|------|------|
| **提示词编辑** | `GenPromptArea` — 支持 `/` 指令、`@` 引用素材 |
| **参考图管理** | `GenMediaPanel` — 拖拽/粘贴/资产库导入 |
| **模型选择** | `GenToolbar` — 下拉选择模型/比例/分辨率 |
| **摄像机工具** | `GenImageToolPanel(kind='camera')` — 多角度预设 |
| **灯光工具** | `GenImageToolPanel(kind='lighting')` — 灯光预设 |
| **全景模式** | `enablePanoramaMode()` — 720° 全景生成 |
| **批量生成** | `batchSize` 循环提交，间隔 1s |
| **蒙版识别** | 自动检测连接源节点的 maskContent |
| **拖放** | 支持本地文件/资产库/seedance-id 拖入 |
| **粘贴** | Ctrl+V 粘贴剪贴板图片 |

**浮动控制面板**：GenNode 使用 `createPortal` 渲染浮动工具栏和媒体托盘，通过 `requestAnimationFrame` 实时跟踪节点位置。

---

## 5. 3D 导演台

### 5.1 概述

3D 导演台是基于 Three.js 的可视化场景编排工具，让用户在 3D 空间中安排角色、道具、摄像机，然后自动生成对应的英文提示词。

### 5.2 DirectorStore 状态模型

`useDirectorStore` (`features/director/useDirectorStore.ts`) 管理每个导演台节点的 3D 场景状态：

```typescript
interface DirectorStateSnapshot {
  characters: DirectorCharacter[]      // 角色人偶
  sceneAssets: DirectorSceneAsset[]    // 场景道具
  backgroundPlate: DirectorBackgroundPlate | null  // 背景板
  camera: DirectorCamera              // 摄像机
  shotType: DirectorShotType          // 景别
  composition: DirectorCompositionId  // 构图
  formation: { total, cols }          // 阵型
  frameRatio: DirectorAspectRatioId   // 画面比例
}
```

### 5.3 角色人偶系统

```typescript
interface DirectorCharacter {
  id, label, x, z, rotation, color, scale
  pose: DirectorPoseId              // 姿态预设
  variant: DirectorCharacterVariantId  // 男/女
  boneAdjustments: DirectorBoneAdjustments  // 骨骼微调
}
```

**姿态预设** (13种)：中性站姿、行走、奔跑、对话、指向、警戒、半蹲、坐姿、跪姿、抱臂、举手、倚靠、倒地

**骨骼控制** (14组)：头颈、躯干、左/右上臂、左/右前臂、左/右手、左/右大腿、左/右小腿、左/右脚

**骨骼轴** (3轴)：俯仰 X、旋转 Y、侧摆 Z（范围 -1.6 ~ 1.6 弧度）

### 5.4 摄像机系统

```typescript
interface DirectorCamera {
  distance: number          // 距离
  elevation: number         // 仰角
  azimuth: number           // 方位角
  fov: number               // 视场角
  followCharacterId: string | null  // 跟随角色
  bindMode: DirectorCameraBindModeId  // 绑定模式
  offsetPreset: DirectorCameraOffsetPresetId  // 跟拍预设
}
```

**景别→摄像机预设**：

| 景别 | distance | elevation | fov |
|------|----------|-----------|-----|
| 特写 | 2.6 | 10° | 42° |
| 中景 | 5 | 22° | 56° |
| 远景 | 9.5 | 28° | 64° |
| 航拍 | 14 | 62° | 70° |

**跟拍预设** (5种)：居中跟拍、左肩跟拍、右肩跟拍、侧面跟拍、迎面推进

**摄像机绑定模式**：自由(none)、跟随(follow)、注视(look-at)

### 5.5 场景道具

12 种预设道具：墙面、门、窗、桌子、椅子、沙发、床、台阶、路灯、树、石块、车

### 5.6 背景板

```typescript
interface DirectorBackgroundPlate {
  path: string         // 图片路径
  width, height        // 尺寸
  opacity: number      // 透明度 (0.15~1, 默认0.82)
  mode: 'viewport' | 'panorama'  // 视口图 or 720全景
  horizon: number      // 地平线位置
  depth: number        // 深度
  alignStrength: number // 对齐强度
}
```

### 5.7 提示词生成

`buildDirectorPrompt(state)` 将 3D 场景状态自动翻译为英文提示词：

```
输入: { characters: 2人, shotType: '中景', composition: 'center', 
        camera: { followCharacterId, bindMode: 'follow', offsetPreset: 'left-shoulder' },
        sceneAssets: [{ preset: 'table' }] }

输出: "two people, medium shot, centered composition, left shoulder tracking camera, rectangular table prop"
```

提示词组装规则：
1. 人数 → `single person` / `two people` / `N people` / `crowd of N people`
2. 景别 → `close-up shot` / `medium shot` / `wide shot` / `bird's eye view`
3. 构图 → `centered composition` / `rule of thirds` / `golden ratio`
4. 画面比例 → 对应英文（如 `cinematic 16:9 frame`）
5. 背景板 → `camera viewport background plate` / `panoramic 720 environment plate`
6. 姿态 → 非中性姿态的英文提示词
7. 摄像机跟拍 → 跟拍预设的 followPrompt/lookAtPrompt
8. 骨骼微调 → `hand adjusted skeletal pose(s)`
9. 角色性别 → `male/female director mannequin`
10. 前后景 → `N in foreground, N in background`
11. 道具 → 道具英文提示词

---

## 6. AI 副驾工具系统

### 6.1 概述

AI 副驾通过 OpenAI 兼容的 Function Calling 协议，让 AI 助手直接操控画布、节点、生成任务、资产库、本地文件系统甚至浏览器。工具定义在 `utils/toolDefinitions.ts` 中，共 **80+** 个工具函数。

### 6.2 工具分类

| 分类 | 工具数 | 核心工具 | 说明 |
|------|--------|----------|------|
| **画布查询** | 5 | `list_nodes`, `get_node`, `get_model_configs`, `get_history`, `get_assets` | 读取画布状态 |
| **画布写入** | 3 | `create_node`, `update_node`, `delete_node` | 增删改节点 |
| **生成操作** | 2 | `generate`, `create_and_generate` | 触发生成 |
| **导演分镜** | 3 | `setup_director`, `get_director_script`, `update_director_shot` | 导演节点操作 |
| **资产库** | 3 | `add_to_asset_library`, `create_asset_folder`, `save_history_to_assets` | 资产管理 |
| **批量操作** | 3 | `batch_update_nodes`, `batch_create_and_generate`, `clone_with_variants` | 批量执行 |
| **画布编排** | 8 | `arrange_nodes`, `align_nodes`, `distribute_nodes`, `move_node`, `resize_node`, `create_group`, `collapse_group`, `clear_canvas` | 布局管理 |
| **系统操作** | 2 | `set_theme`, `toggle_panel` | 应用控制 |
| **本地文件** | 11 | `read_local_file`, `list_local_directory`, `write_local_text_file`, `run_local_command`, `start_terminal_session` 等 | 文件系统操作 |
| **浏览器操作** | 14 | `start_browser_session`, `inspect_browser_dom`, `click_browser_element`, `fill_browser_form`, `capture_browser_screenshot` 等 | 隐藏浏览器自动化 |
| **智能创作** | 5 | `enhance_prompt`, `translate_prompt`, `suggest_prompt_variants`, `analyze_failed_reason`, `recommend_model` | AI 辅助创作 |
| **预设系统** | 4 | `save_preset`, `list_presets`, `apply_preset`, `delete_preset` | 配置预设 |
| **Skill 自动化** | 7 | `create_skill`, `execute_skill`, `edit_skill`, `export_skill`, `import_skill` 等 | 可复用工作流 |
| **自动流水线** | 4 | `setup_auto_pipeline`, `list_pipelines`, `toggle_pipeline`, `delete_pipeline` | 事件驱动自动化 |
| **Agent 模式** | 2 | `list_agent_modes`, `switch_agent_mode` | 切换 AI 专家角色 |
| **定时任务** | 3 | `create_timer_task`, `list_timer_tasks`, `cancel_timer_task` | 定时执行 |
| **标签系统** | 5 | `add_tag`, `remove_tag`, `tag_node`, `filter_by_tag`, `auto_suggest_tags` | 节点分类 |
| **智能分析** | 5 | `capture_canvas_for_review`, `extract_style_dna`, `score_generation_result`, `get_user_preferences`, `suggest_next_steps` | AI 感知 |
| **项目管理** | 4 | `get_project_info`, `rename_project`, `open_project_manager`, `list_projects` | 项目管理 |
| **Git/GitHub** | 3 | `get_workspace_git_summary`, `post_github_pr_comment`, `submit_github_pr_review` | 代码审查 |
| **GitLab** | 1 | `post_gitlab_mr_comment` | GitLab MR 评论 |

### 6.3 AI 专家模式

| 模式 | ID | 说明 |
|------|----|------|
| 默认 | `default` | 通用助手 |
| 美术总监 | `art_director` | 画面风格/构图/色彩指导 |
| 编剧 | `screenwriter` | 剧本创作/角色塑造 |
| 导演 | `director` | 分镜/镜头语言/节奏 |
| QA 审核 | `qa_reviewer` | 生成结果质量审核 |
| 提示词大师 | `prompt_master` | 提示词优化/变体生成 |

---

## 7. 宠物系统

### 7.1 状态机

`PetStateMachine.ts` 定义宠物状态优先级：

```
DRAGGING > HAPPY > TYPING > THINKING > LISTENING > WATCHING
```

| 状态 | 触发条件 | 中文标签 |
|------|----------|----------|
| `DRAGGING` | 用户拖拽宠物 | — |
| `HAPPY` | `happyUntil > now`（收到消息后开心一段时间） | 心情很好 |
| `TYPING` | AI 正在打字回复 | 正在打字 |
| `THINKING` | 消息发送中 | 正在思考 |
| `LISTENING` | 用户输入框有内容 | 正在听你说 |
| `WATCHING` | 空闲待机 | 待机陪伴 |

### 7.2 宠物组件

- `PetStage` — 宠物舞台容器
- `PetChatWidget` — 宠物对话气泡
- `petConfig.ts` — 宠物配置（状态定义、动画参数）
- `petWardrobe.ts` — 宠物换装系统

---

## 8. 剧本解析与分镜

### 8.1 剧本解析 — `parseScript.ts`

按"镜头X"标记分段提取镜头内容：

- 支持中文数字：镜头一、镜头十二
- 支持阿拉伯数字：镜头1、镜头12
- `chineseToNumber()` — 中文数字转阿拉伯数字（支持十/百/千/万）

```typescript
parseScript(text) → { shots: Array<{ index, title, content }>, count }
```

### 8.2 角色提取 — `parseCharacters.ts`

从剧本文本中提取角色信息（名称、描述、属性）。

### 8.3 场景提取 — `parseScenes.ts`

从剧本文本中提取场景描述（地点、环境、氛围）。

### 8.4 文档解析 — `parseDocument.ts`

支持多种文档格式：
- **Word** (.docx) — `mammoth` 库
- **PDF** (.pdf) — `pdfjs-dist` 库
- **纯文本** (.txt) — `iconv-lite` 编码转换
- **Excel** (.xlsx) — `xlsx` 库

---

## 9. 云端素材与制片协作

### 9.1 云端素材库

`CloudAssetsPanel` 提供云端素材浏览和收藏功能，支持：
- 剧集/集数/镜头层级浏览
- 素材拖拽到画布节点
- 素材收藏管理

### 9.2 生成结果回流 — `seriesResultBridge.ts`

AI 生成完成后，结果自动回流到云端分镜资产的媒体候选库：

```
GenNode 生成完成
    → updatePreviewFromTask()
    → addShotMediaCandidateFromResult(result)
    → 根据 sourceMeta.shotId 找到目标镜头
    → 创建 ShotMediaCandidate 添加到 shot.mediaCandidates
    → 触发 SERIES_RESULT_BRIDGE_EVENT 事件
```

### 9.3 导演通知

`notifyDirectorAssetReady(sourceMeta)` — 组员完成素材制作后，向导演发送审核通知：

```
通知 → localStorage 存储 → SERIES_DIRECTOR_NOTIFICATION_EVENT 事件广播
```

### 9.4 制片看板

`ProductionBoard` 提供批量生产管理：
- 表格式批量创建生成任务
- `useUnattendedMode` — 无人值守模式（自动重试失败任务）

---

## 10. 整体架构

### 10.1 三层架构

```
┌──────────────────────────────────────────────────────────────┐
│                     Electron Application                      │
│                                                               │
│  ┌─────────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │   Main Process   │  │   Preload    │  │ Renderer Process│ │
│  │                  │  │              │  │                 │ │
│  │  - 窗口管理       │  │ - IPC 安全桥 │  │  - React 19     │ │
│  │  - IPC Handlers  │◄─►│ - 通道白名单 │◄─►│  - Zustand Store│ │
│  │  - SQLite 数据库  │  │ - API 暴露   │  │  - ReactFlow    │ │
│  │  - TaskQueue     │  │              │  │  - Three.js     │ │
│  │  - TaskExecutor  │  │              │  │  - TailwindCSS  │ │
│  │  - OSS Upload    │  │              │  │                 │ │
│  │  - 飞书集成       │  │              │  │  创作功能:       │ │
│  │  - 自动更新       │  │              │  │  - 节点画布      │ │
│  │  - 自定义协议     │  │              │  │  - AI 生成管线   │ │
│  │  - GPU 降级       │  │              │  │  - 3D 导演台     │ │
│  │  - 异常保护       │  │              │  │  - AI 副驾      │ │
│  │                  │  │              │  │  - 宠物系统      │ │
│  │                  │  │              │  │  - 云端素材      │ │
│  │                  │  │              │  │  - 制片看板      │ │
│  └─────────────────┘  └──────────────┘  └─────────────────┘ │
│                                                               │
│  外部 AI 服务:                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐   │
│  │火山引擎   │ │Midjourney│ │阿里云 OSS │ │飞书开放平台    │   │
│  │Seedance  │ │          │ │          │ │               │   │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### 10.2 DAG 工作流引擎

渲染进程侧的 DAG 引擎管理节点间依赖的自动化执行：

```
buildExecutionLayers() → 拓扑排序 → 按层级分组
    ↓
WorkflowEngine.executeWorkflow()
    ↓
每层 Promise.allSettled() 并行执行
    ↓
失败节点 → 级联 skip 所有下游
    ↓
支持断点续跑 (resumeWorkflow)
```

**节点状态**：`pending` → `running` → `completed` / `failed` / `skipped`

### 10.3 双引擎协作

```
渲染进程 DAG Engine (节点编排)  ←→  主进程 TaskQueue (API 调度)
        ↓                                    ↓
  管理节点依赖和执行顺序              管理并发控制和 API 调用
  按层并行调度                       Provider 路由 + 轮询
  断点续跑                           OSS 上传 + 结果回传
```

### 10.4 IPC 通信

| 模式 | 方法 | 适用场景 |
|------|------|----------|
| 请求-响应 | `invoke()` ↔ `handle()` | 绝大多数操作 |
| 单向推送 | `webContents.send()` | 任务状态更新、飞书消息 |
| 同步调用 | `sendSync()` | 仅 `project:save-sync` |

**关键 IPC 通道**：

| 通道 | 方向 | 说明 |
|------|------|------|
| `engine:submit-task` | R→M | 提交 AI 生成任务 |
| `engine:task-update` | M→R | 任务状态更新推送 |
| `engine:cancel-task` | R→M | 取消任务 |
| `db:nodes:saveBatch` | R→M | 批量保存节点 |
| `project:save` | R→M | 保存项目 JSON |
| `cloud:request` | R→M | 代理 HTTP 请求 |
| `system:start-browser-session` | R→M | 启动浏览器会话 |

---

## 11. 数据层

### 11.1 持久化策略

| 存储 | 位置 | 数据 |
|------|------|------|
| **SQLite** | `canvas_data.db` | 项目、节点、连接、历史、设置 |
| **JSON 文件** | `projects/{id}.json` | 项目完整快照 |
| **localStorage** | 浏览器 | 用户偏好（Zustand persist） |
| **文件系统** | `ProjectCache/{id}/` | 图片、视频、缩略图、音频 |

### 11.2 Zustand Store 分片

```
useAppStore = persist(
  createUiSlice + createProjectSlice + createHistorySlice +
  createLibrarySlice + createCanvasSlice + createDagEngineSlice
)
```

| Slice | 关键状态 |
|-------|----------|
| `createProjectSlice` | currentProject, nodes, connections, nodesMap, edges |
| `createHistorySlice` | history (生成历史数组) |
| `createLibrarySlice` | characterLibrary, promptLibrary, apiConfigs |
| `createCanvasSlice` | selectedNodeId, selectedNodeIds |
| `createDagEngineSlice` | workflowEngine 实例 |

**持久化**：仅持久化用户配置（主题、API Key、角色库等），运行时数据不持久化。2s 节流写入，`skipHydration` 避免空状态窗口期。

---

## 12. 项目运行与构建

```bash
npm install          # 安装依赖
npm run dev          # 开发模式（HMR）
npm run build        # 构建
npm run build:win    # 打包 Windows 安装程序
npm run lint         # ESLint 检查
npm run typecheck    # TypeScript 类型检查
npm run test         # Vitest 单元测试
npm run check:quality # 完整质量检查
npm run release      # 构建 + 发布到 OSS
```

**TypeScript 渐进迁移**：`allowJs: true`, `strict: false`，JS/TS 混合共存。

**构建 Chunk 分割**：vendor-flow (ReactFlow), vendor-three (Three.js), vendor-zustand, vendor-motion, vendor-icons, vendor-marked
