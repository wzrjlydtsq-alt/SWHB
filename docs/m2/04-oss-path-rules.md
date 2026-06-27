# M2-1 OSS 对象路径规则

> Bucket 名称：`xinghe-team-assets-prod`  
> 地域：`cn-chengdu`  
> 访问权限：**私有读写**，所有读写通过 STS 临时凭证或预签名 URL

---

## 一、路径总览

```
xinghe-team-assets-prod/
├── teams/
│   └── {teamId}/
│       └── assets/
│           └── {assetId}/
│               ├── original/          ← 原始文件
│               │   └── {filename}
│               ├── thumb/             ← 缩略图
│               │   └── {filename}
│               └── versions/          ← 历史版本
│                   └── v{n}/
│                       └── {filename}
├── users/
│   └── {userId}/
│       └── avatar/
│           └── {filename}
└── temp/
    └── {date}/
        └── {uuid}_{filename}
```

---

## 二、路径规则详解

### 2.1 团队素材

| 路径 | 示例 | 说明 |
|------|------|------|
| 原始文件 | `teams/1/assets/a1b2c3/original/scene01.png` | 当前最新版 |
| 缩略图 | `teams/1/assets/a1b2c3/thumb/scene01_thumb.jpg` | 后端或客户端生成 |
| 历史版本 | `teams/1/assets/a1b2c3/versions/v1/scene01.png` | 上传新版时旧版移入 |

**路径生成规则**：
- `{teamId}` — 数据库 `teams.id`
- `{assetId}` — 使用 NanoID 12 位（`a1b2c3d4e5f6`），不用数据库自增 ID，避免暴露记录数
- `{filename}` — 保留原始文件名，但做安全过滤（去除路径分隔符、特殊字符）
- 文件名冲突：同名覆盖（因为 assetId 唯一，不会跨素材冲突）

### 2.2 用户头像

| 路径 | 示例 |
|------|------|
| 头像 | `users/1/avatar/photo.jpg` |

- 每次上传新头像覆盖旧文件（一个用户只保留一个头像）
- 头像大小限制：2 MB
- 格式限制：`jpg/jpeg/png/webp`

### 2.3 临时上传区

| 路径 | 示例 |
|------|------|
| 临时 | `temp/20260502/f47ac10b_draft.psd` |

- 用于未完成上传、临时中转
- 生命周期规则：**7 天自动删除**（OSS Lifecycle Rule）
- 上传成功后，后端将文件从 `temp/` 移到 `teams/{teamId}/assets/{assetId}/original/`

---

## 三、STS 临时凭证策略

### 3.1 上传策略（客户端拿到后直传 OSS）

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "oss:PutObject",
        "oss:InitiateMultipartUpload",
        "oss:UploadPart",
        "oss:CompleteMultipartUpload",
        "oss:AbortMultipartUpload"
      ],
      "Resource": [
        "acs:oss:*:*:xinghe-team-assets-prod/teams/{teamId}/assets/*",
        "acs:oss:*:*:xinghe-team-assets-prod/temp/*"
      ]
    }
  ]
}
```

**关键**：
- 限制只能写到当前用户所在团队的路径
- 不给 `GetObject`/`DeleteObject` 权限（下载和删除走后端签发的预签名 URL）
- STS 有效期：**1 小时**

### 3.2 下载策略（后端签发预签名 URL，不走 STS）

```typescript
// 后端签发
const downloadUrl = ossClient.signatureUrl(ossKey, {
  expires: 3600,      // 1 小时有效
  method: 'GET',
  'response-content-disposition': `attachment; filename="${encodeURIComponent(filename)}"`
})
```

- 下载不需要 STS，后端直接用长期 AccessKey 签一个临时 URL 给客户端
- 每次请求重新签发，URL 过期自动失效

---

## 四、文件类型与大小限制

| 类型 | 允许格式 | 单文件上限 |
|------|---------|-----------|
| 图片 | jpg, jpeg, png, webp, bmp, tiff, psd | 50 MB |
| 视频 | mp4, mov, avi, mkv, webm | 2 GB |
| 音频 | mp3, wav, flac, aac, ogg | 200 MB |
| 文档 | pdf, doc, docx, txt, md | 50 MB |
| 工程 | zip, rar, 7z, xhz(自定义) | 500 MB |

> 超过 100 MB 的文件强制使用 OSS 分片上传（Multipart Upload）

---

## 五、OSS Lifecycle 规则

| 规则名 | 匹配前缀 | 动作 | 天数 |
|--------|---------|------|------|
| 清理临时文件 | `temp/` | 删除 | 7 天 |
| 归档旧版本 | `teams/*/assets/*/versions/` | 转低频存储 | 90 天 |

---

## 六、CORS 配置

```json
{
  "AllowedOrigins": [
    "http://localhost:*",
    "https://web.yourdomain.com",
    "app://."
  ],
  "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders": ["ETag", "x-oss-request-id"],
  "MaxAgeSeconds": 3600
}
```

> `app://.` 是 Electron 桌面端的 origin（生产模式），开发模式用 `http://localhost:*`

---

## 七、安全红线

1. ❌ **永远不把 OSS AccessKey 放在客户端代码里** — 桌面端现有的 `ossUploader.js` 硬编码凭证必须在上云前清除
2. ❌ **不在客户端拼接完整 OSS 路径** — 路径由后端 API 返回，客户端只负责 PUT 到给定 URL
3. ✅ **STS Policy 限制到团队级别** — 用户 A 的上传凭证不能写入团队 B 的路径
4. ✅ **下载走预签名 URL** — 私有 Bucket 不开公共读，链接过期自动失效
5. ✅ **删除走后端** — 客户端无 `oss:DeleteObject` 权限，避免误删
