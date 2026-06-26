# M2.5 云素材分类与使用场景

更新时间：2026-05-06

## 目标

把云素材库从“能上传文件”升级成“能管理、能复用、能进入创作流程”的素材系统。

核心问题：

- 素材怎么分类。
- 上传时怎么放到正确位置。
- 后期怎么搜索和筛选。
- 云素材怎么进入画布节点、资产库、批量生产板。

## 分类模型

第一版建议使用四层分类，不要一开始做太复杂：

| 维度 | 字段建议 | 用途 |
| --- | --- | --- |
| 类型 | `asset_type` | 图片、视频、音频、文档、工程、其他 |
| 文件夹 | `folder_id` | 团队内人工整理目录 |
| 标签 | `tags` | 多标签检索，如角色、场景、参考图 |
| 项目归属 | `project_id` | 绑定某个项目或作品 |

后续增强：

- `is_favorite`：收藏。
- `status`：`active/archived/deleted`。
- `source`：本地上传、AI 生成、别人发送、导入。
- `usage_count`：被使用次数。
- `last_used_at`：最近使用时间。

## 数据库扩展建议

### `asset_folders`

```sql
CREATE TABLE asset_folders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  team_id BIGINT UNSIGNED NOT NULL,
  parent_id BIGINT UNSIGNED DEFAULT NULL,
  name VARCHAR(200) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status ENUM('active','archived','deleted') NOT NULL DEFAULT 'active',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### `asset_favorites`

```sql
CREATE TABLE asset_favorites (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  asset_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_asset_user (asset_id, user_id)
);
```

### `asset_usage_logs`

记录素材被放到哪里使用。

```sql
CREATE TABLE asset_usage_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  asset_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  usage_target ENUM('canvas_node','local_asset_library','batch_board','download','transfer') NOT NULL,
  target_id VARCHAR(100) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## 上传时分类

上传弹窗第一版字段：

- 文件。
- 素材名称，默认文件名。
- 素材类型，自动识别，可手动改。
- 文件夹，默认“未分类”。
- 标签，可输入多个。
- 项目归属，可选。

上传流程：

1. 前端选择文件。
2. 前端填写分类信息。
3. 后端签发 OSS 上传 URL。
4. 前端直传 OSS。
5. 前端调用 `POST /teams/:teamId/assets` 创建素材记录，并带上分类字段。

## 后期筛选

素材列表查询建议支持：

```text
GET /teams/:teamId/assets
  ?page=1
  &page_size=40
  &type=image
  &folder_id=12
  &tags=角色,正面
  &project_id=5
  &favorite=true
  &search=小猫
  &sort=created_at:desc
```

排序建议：

- `created_at:desc`：最新上传。
- `name:asc`：名称。
- `file_size:desc`：文件大小。
- `last_used_at:desc`：最近使用。
- `usage_count:desc`：最常用。

## 进入画布节点

素材卡片增加操作：

- `插入画布`。
- 拖拽素材卡片到画布。

不同素材类型对应节点：

| 素材类型 | 画布节点 |
| --- | --- |
| 图片 | 图片节点 / 参考图节点 |
| 视频 | 视频节点 / 视频输入节点 |
| 音频 | 音频节点 |
| 文档 | 文档节点 / 提示词参考节点 |
| 工程 | 项目导入节点 |

插入时记录 `asset_usage_logs`：

```json
{
  "asset_id": 42,
  "usage_target": "canvas_node",
  "target_id": "node_abc123"
}
```

## 进入本地资产库

两种模式：

### 模式 A：引用云素材

本地资产库只保存云素材 ID 和预览信息，打开时再请求下载 URL。

优点：

- 不重复占用本地磁盘。
- 团队更新后可同步。

缺点：

- 离线不可用。

### 模式 B：下载到本地资产库

用户点击“加入本地资产库”，下载文件到本地资产目录。

优点：

- 离线可用。
- 适合常用素材。

缺点：

- 会占用本地空间。
- 云端更新后需要手动同步。

第一版建议先做模式 A，后续补“下载离线副本”。

## 进入批量生产板

批量生产板增加“从云素材选择”入口。

使用方式：

- 图片素材作为参考图。
- 视频素材作为视频输入。
- 文档素材作为提示词/脚本输入。
- 多选素材后批量生成多个任务。

推荐交互：

1. 在批量生产板点击“添加云素材”。
2. 弹出云素材选择器。
3. 支持按类型、标签、项目筛选。
4. 选中素材后加入当前批量任务输入区。

## 素材发送后的归类

别人发来的素材被接收后，第一版不复制 OSS 文件，只生成使用关系：

- 原始素材仍属于原小组。
- 接收记录在 `transfers`。
- 若需要加入自己的团队素材库，后续提供“另存到当前团队”操作。

这样可以避免同一个大文件被复制很多份。

## 分阶段落地

### 第一阶段：可用分类

- [ ] 上传时填写标签。
- [ ] 列表按类型和标签筛选。
- [ ] 素材卡片展示标签。
- [ ] 收藏素材。

### 第二阶段：文件夹

- [ ] 创建/重命名/删除文件夹。
- [ ] 上传时选择文件夹。
- [ ] 素材移动文件夹。

### 第三阶段：进入创作流程

- [ ] 插入画布节点。
- [ ] 加入本地资产库。
- [ ] 批量生产板选择云素材。
- [ ] 记录使用日志。
