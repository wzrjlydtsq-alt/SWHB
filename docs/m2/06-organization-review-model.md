# M2.3 Organization / Team / Personal Space Review Model

更新时间：2026-05-06

## 目标

把素材库权限从“单个团队邀请码”升级成三层结构：

| 层级 | 用途 | 当前落地方式 |
| --- | --- | --- |
| 大组 organization | 公司、工作室、项目总空间 | `organizations` + `organization_members` |
| 小组 team | 大组下面的项目组、职能组 | `teams.org_id` + `teams.parent_team_id` |
| 个人 personal | 后续个人素材/草稿空间 | `teams.team_type = personal` 预留 |

## 已落地数据库变更

- [x] `organizations`：大组基础信息、邀请口令、加入策略。
- [x] `organization_members`：大组成员与角色。
- [x] `teams.org_id`：团队归属到某个大组。
- [x] `teams.parent_team_id`：预留小组嵌套。
- [x] `teams.team_type`：`group` / `personal`。
- [x] `teams.join_policy`：`invite` / `approval` / `closed`。
- [x] `join_requests`：加入大组/小组的审核单。
- [x] `audit_logs`：创建、加入、审核动作写审计记录。

## 已落地 API

| API | 状态 | 说明 |
| --- | --- | --- |
| `POST /api/v1/organizations` | [x] | 创建大组，创建者自动成为 owner |
| `GET /api/v1/organizations` | [x] | 查看我加入的大组 |
| `POST /api/v1/organizations/join` | [x] | 通过邀请码加入；`approval` 策略会生成审核单 |
| `POST /api/v1/organizations/:orgId/teams` | [x] | 大组管理员创建小组 |
| `GET /api/v1/organizations/:orgId/teams` | [x] | 查看大组下的小组 |
| `POST /api/v1/teams/:teamId/join-requests` | [x] | 申请加入小组 |
| `GET /api/v1/join-requests` | [x] | 管理员查看待审核申请 |
| `POST /api/v1/join-requests/:requestId/review` | [x] | 管理员通过/拒绝申请 |

## 后续前端要接的内容

- [x] 团队素材库顶部选择器改成“大组 / 小组”两级选择。
- [x] 加入团队入口改成“输入邀请码后，如果需要审核，则显示等待审核”。
- [x] 增加“审核中心”小面板：待审核、已通过、已拒绝。
- [x] 创建小组时可选择归属大组和加入方式。
- [x] 展示并复制大组/小组邀请码。
- [x] 查看小组成员，管理员可移除非 owner 成员。
- [x] owner 可归档/软删除大组和小组。
- [ ] 创建小组时选择父级小组。
- [ ] 个人空间入口暂时隐藏，等素材库稳定后再打开。

## 当前阻塞

- [ ] OSS 上传仍被 RAM AccessKey 签名错误挡住。后端 STS 代码已就绪，但阿里云返回 `SignatureDoesNotMatch`，需要重新确认 RAM AccessKeySecret 或重新生成一组 backend-api AccessKey。
