# M2 API 契约

更新时间：2026-05-06

> 协议：RESTful JSON  
> 基础路径：`/api/v1`  
> 认证：除登录/验证码外均使用 `Authorization: Bearer <access_token>`  
> 删除策略：团队、大组、素材默认软删除，不物理删除历史数据。

## 通用响应

```json
{
  "code": 0,
  "data": {},
  "message": "ok"
}
```

错误码范围：

| 范围 | 含义 |
| --- | --- |
| `40000-40099` | 参数错误 |
| `40100-40199` | 未登录或登录过期 |
| `40300-40399` | 权限不足 |
| `40400-40499` | 资源不存在 |
| `40900-40999` | 业务冲突 |
| `50000-50099` | 服务端错误 |

## 认证

### POST `/auth/send-code`

开发期固定验证码 `123456`。

```json
{
  "target": "13900000001",
  "type": "phone"
}
```

### POST `/auth/login`

验证码登录，首次登录自动创建用户。

```json
{
  "target": "13900000001",
  "type": "phone",
  "code": "123456"
}
```

返回 `access_token`、`refresh_token`、`expires_in`、`user`。

### POST `/auth/refresh`

刷新 token。

### POST `/auth/logout`

退出登录并废弃 refresh token。

## 用户

### GET `/users/me`

读取当前用户。

### PATCH `/users/me`

更新当前用户基础信息，预留昵称、头像等字段。

## 大组

### POST `/organizations`

创建大组。创建者自动成为 `owner`，后端自动生成 `invite_code`。

```json
{
  "name": "星河工作室",
  "join_policy": "approval"
}
```

### GET `/organizations`

查看我加入的大组列表。返回每个大组的 `id/name/invite_code/join_policy/role/member_count`。

### POST `/organizations/join`

通过大组邀请码申请加入。

```json
{
  "invite_code": "ORG53888417",
  "message": "申请加入"
}
```

规则：

- `join_policy = invite`：直接加入。
- `join_policy = approval`：生成 `join_requests` 待审核记录。
- `join_policy = closed`：拒绝加入。

### PATCH `/organizations/:orgId/archive`

归档大组。仅大组 `owner` 可操作。归档大组时，该大组下 `active` 小组同步归档。

### DELETE `/organizations/:orgId`

软删除大组。仅大组 `owner` 可操作。该大组下未删除小组同步标记为 `deleted`。

## 小组 / 团队

### POST `/teams`

创建独立团队。创建者自动成为 `owner`，后端自动生成 `invite_code`。

### GET `/teams`

查看我加入的团队列表。

### POST `/teams/join`

通过团队邀请码加入团队。

```json
{
  "invite_code": "XHD2894593"
}
```

### POST `/organizations/:orgId/teams`

在大组下创建小组。仅大组 `owner/admin` 可操作。

```json
{
  "name": "角色设计小组",
  "join_policy": "approval",
  "parent_team_id": null
}
```

### GET `/organizations/:orgId/teams`

查看某个大组下的小组列表。大组成员可查看。

### PATCH `/teams/:teamId/archive`

归档小组/团队。仅小组 `owner` 可操作。

### DELETE `/teams/:teamId`

软删除小组/团队。仅小组 `owner` 可操作。

### GET `/teams/:teamId/members`

查看小组成员。小组成员均可查看。

返回字段：`user_id`、`nickname`、`avatar_url`、`role`、`joined_at`。

### PATCH `/teams/:teamId/members/:userId`

修改小组成员角色。当前实现：仅 `owner` 可修改，且不能改成 `owner`。

```json
{
  "role": "viewer"
}
```

### DELETE `/teams/:teamId/members/:userId`

移除成员或主动退出。

- `owner` 可移除 `admin/member/viewer`。
- `admin` 可移除 `member/viewer`。
- `member/viewer` 可主动退出。
- `owner` 第一版不能退出自己创建的小组，也不能被移除。

## 加入审核

### POST `/teams/:teamId/join-requests`

申请加入小组。

```json
{
  "message": "申请加入角色设计小组"
}
```

### GET `/join-requests?scope_type=organization&scope_id=1`

查看加入申请。`scope_type` 可为 `organization` 或 `team`。对应范围的 `owner/admin` 可查看。

### POST `/join-requests/:requestId/review`

审核加入申请。对应范围的 `owner/admin` 可操作。

```json
{
  "action": "approve",
  "review_note": "通过"
}
```

`action` 可选：`approve`、`reject`。

## 素材

### POST `/teams/:teamId/assets/upload-url`

获取 OSS 直传 signed URL。

```json
{
  "filename": "scene01.png",
  "content_type": "image/png",
  "file_size": 2048000
}
```

返回 `method/upload_url/oss_key/headers/expires_in`。

### POST `/teams/:teamId/assets`

上传完成后创建素材记录。

```json
{
  "name": "scene01.png",
  "asset_type": "image",
  "mime_type": "image/png",
  "file_size": 2048000,
  "oss_key": "teams/1/assets/xxx/original/scene01.png",
  "tags": ["desktop-upload"]
}
```

### GET `/teams/:teamId/assets`

分页读取素材列表。支持 `page/page_size/type`，后续扩展 `folder_id/tags/search/favorite/project_id`。

### GET `/teams/:teamId/assets/:assetId`

读取素材详情。

### GET `/teams/:teamId/assets/:assetId/download-url`

获取私有素材下载 signed URL。

### DELETE `/teams/:teamId/assets/:assetId`

软删除素材。`owner/admin` 可删任意素材，`member` 只能删自己上传的素材。

## 素材发送 / 接收草案

> 详细流程见 `docs/m2/07-asset-transfer-flow.md`。

### POST `/teams/:teamId/transfers`

发送素材给小组成员。

```json
{
  "asset_id": 42,
  "receiver_id": 2,
  "message": "请确认这版素材"
}
```

### GET `/transfers/received`

查看我收到的素材发送请求。

### GET `/transfers/sent`

查看我发出的素材发送记录。

### POST `/transfers/:transferId/accept`

接收素材。

### POST `/transfers/:transferId/reject`

拒绝素材。

```json
{
  "reason": "不是最新版本"
}
```

## 通知草案

### GET `/notifications`

查看我的通知。

### PATCH `/notifications/:id/read`

标记单条通知已读。

### PATCH `/notifications/read-all`

全部标记已读。
