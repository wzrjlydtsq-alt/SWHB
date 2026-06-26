# M2.4 素材发送 / 接收流程

更新时间：2026-05-06

## 目标

让用户可以把团队素材库中的图片、视频、音频、文档或工程素材发送给同组成员。接收方可以选择接收或拒绝，并产生通知。

## 复用现有表

第一版不新增核心业务表，使用现有：

- `transfers`：记录发送、接收、拒绝状态。
- `notifications`：记录接收方通知。
- `assets`：被发送的素材。
- `team_members`：校验双方是否属于同一小组。
- `audit_logs`：记录关键操作。

## 状态机

| 状态 | 含义 | 可流转到 |
| --- | --- | --- |
| `pending` | 已发送，等待接收方处理 | `accepted` / `rejected` / `expired` |
| `accepted` | 接收方已接收 | 终态 |
| `rejected` | 接收方已拒绝 | 终态 |
| `expired` | 超时未处理 | 终态 |

默认过期时间建议：7 天。

## API 草案

### POST `/teams/:teamId/transfers`

状态：已落地并通过公网 smoke。

发送素材给组员。

权限：

- 发送方必须是小组 `owner/admin/member`。
- 接收方必须是同一小组成员。
- 素材必须属于当前小组。
- `viewer` 不允许发送。

```json
// Request
{
  "asset_id": 42,
  "receiver_id": 9,
  "message": "这张图给你接一下"
}

// Response 201
{
  "code": 0,
  "data": {
    "id": 1001,
    "asset_id": 42,
    "sender_id": 1,
    "receiver_id": 9,
    "team_id": 3,
    "message": "这张图给你接一下",
    "status": "pending",
    "expires_at": "2026-05-13T12:00:00.000Z",
    "created_at": "2026-05-06T12:00:00.000Z"
  },
  "message": "ok"
}
```

副作用：

- 写入 `transfers`。
- 给接收方写入 `notifications`，类型建议 `transfer.received`。
- 写入 `audit_logs`，action 建议 `transfer.create`。

### GET `/transfers/received`

状态：已落地并通过公网 smoke。

查看我收到的素材。

查询参数：

- `status`：可选，`pending/accepted/rejected/expired`。
- `page`：默认 1。
- `page_size`：默认 20。

返回建议包含素材基础信息，避免前端二次请求。

```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": 1001,
        "status": "pending",
        "message": "这张图给你接一下",
        "asset": {
          "id": 42,
          "name": "scene01.png",
          "asset_type": "image",
          "file_size": 2048000
        },
        "sender": {
          "id": 1,
          "nickname": "用户_0001"
        },
        "team": {
          "id": 3,
          "name": "角色设计小组"
        },
        "created_at": "2026-05-06T12:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "page_size": 20
  },
  "message": "ok"
}
```

### GET `/transfers/sent`

状态：已落地并通过公网 smoke。

查看我发出的素材。

查询参数同 `/transfers/received`。

### POST `/transfers/:transferId/accept`

状态：已落地并通过公网 smoke。

接收素材。

权限：

- 只有 `receiver_id = 当前用户` 可以接收。
- 只有 `pending` 状态可以接收。
- 过期后不能接收。

第一版接收含义：

- 把状态改为 `accepted`。
- 写入 `responded_at`。
- 给发送方写入 `notifications`，类型建议 `transfer.accepted`。
- 写入 `audit_logs`。

### POST `/transfers/:transferId/reject`

状态：已落地，待前端接入验证。

拒绝素材。

```json
{
  "reason": "不是最新版本"
}
```

权限同接收。

副作用：

- 把状态改为 `rejected`。
- 写入 `responded_at`。
- 给发送方写入 `notifications`，类型建议 `transfer.rejected`。
- 写入 `audit_logs`。

## 前端交互

素材卡片增加操作：

- `发送给组员`：打开成员选择弹窗。
- 弹窗展示当前小组成员，排除自己。
- 选择接收人，可填写一句留言。
- 发送成功后显示“已发送，等待对方接收”。

接收入口：

- 云素材库顶部增加“待接收”按钮。
- 小精灵收到通知后弹气泡提醒。
- 待接收列表支持“接收 / 拒绝”。

## 后续增强

- 批量发送多个素材。
- 发送给整个小组。
- 设置过期时间。
- 接收后自动加入个人素材区。
- WebSocket 实时推送通知。
