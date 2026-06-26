# M2 云资源环境变量检查表

更新时间：2026-05-02

> 这份只记录“该填什么”，不记录真实密码和 AccessKey Secret。

## 已确认信息

| 项 | 值 |
| --- | --- |
| RDS 内网地址 | `rm-2vc4698340c012w13.mysql.cn-chengdu.rds.aliyuncs.com` |
| RDS 端口 | `3306` |
| RDS 账号 | `rds_xinghe` |
| 数据库名 | `xinghe_app` |
| OSS Bucket | `xinghe-team-assets-prod` |
| OSS 地域 | `cn-chengdu` |
| OSS Endpoint | `oss-cn-chengdu.aliyuncs.com` |
| RAM 用户 | `backend-api@1894072619872135.onaliyun.com` |
| STS Role ARN | `acs:ram::1894072619872135:role/oss-uploader-role` |

## 已执行结果

| 时间 | 操作 | 结果 |
| --- | --- | --- |
| 2026-05-02 | 在 ECS `/opt/xinghe-cloud-api` 执行 `npm run db:migrate` | 成功应用 `001_initial_schema.sql` |
| 2026-05-02 | 查询 RDS `xinghe_app` 表结构 | 已创建 `users`、`teams`、`team_members`、`assets`、`asset_versions`、`transfers`、`notifications`、`refresh_tokens`、`audit_logs`、`schema_migrations` |
| 2026-05-02 | 在 ECS `/opt/xinghe-cloud-api` 执行 `npm run smoke:m2-2` | 登录、当前用户、创建团队、团队列表、成员列表真实 RDS 冒烟通过 |
| 2026-05-02 | 使用 RAM 用户 `backend-api` 生成 OSS 上传 signed URL | M2-3 冒烟通过，`asset-upload-url` 返回 `signed_url` |
| 2026-05-02 | 在 RDS 创建素材元数据并读取列表/详情 | M2-3 冒烟通过，`asset-create`、`asset-list`、`asset-detail` 均成功 |
| 2026-05-02 | 扩展团队 API 冒烟 | 邀请码加入、owner 修改成员角色、移除成员均通过 |
| 2026-05-02 | ECS 配置 PM2 常驻服务 | `/opt/xinghe-cloud-api` 由 PM2 托管，进程名 `xinghe-cloud-api` |
| 2026-05-02 | ECS 配置 Nginx 反向代理 | 公网 `http://47.109.138.168/health` 与 `/ready` 访问成功 |

## 还需要你在本机填写

这些内容只填到 `server/.env`，不要发聊天，不要写文档：

- `MYSQL_PASSWORD`：已填入本地和 ECS 的 `.env`，不要写入文档或提交 Git。
- `ALIYUN_ACCESS_KEY_ID`：已填入本地和 ECS 的 `.env`，不要写入文档或提交 Git。
- `ALIYUN_ACCESS_KEY_SECRET`：已填入本地和 ECS 的 `.env`，不要写入文档或提交 Git。

## 执行顺序

1. 去 RDS 控制台重置 `rds_xinghe` 密码。
2. 确认 RDS 白名单允许 ECS 或当前调试机器访问。
3. 在 `server/.env` 填入新密码。
4. 如果要接真实 STS，在 RAM 用户 `backend-api` 创建 AccessKey，并填入 `server/.env`。
5. 先保持 `MOCK_STS_ENABLED=true` 跑迁移和本地 API。
6. 数据库连通后执行：

```bash
npm run --prefix server db:migrate
```

## 安全提醒

- 图里露出的 RDS 密码建议立即作废。
- RAM 用户 `backend-api` 不要开控制台登录，只保留 API 调用能力。
- `OSS-Uploader-Role` 当前如果仍是 `AliyunOSSFullAccess`，正式前要改成只允许访问 `xinghe-team-assets-prod` 指定路径。
