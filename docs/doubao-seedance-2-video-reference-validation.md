# doubao-seedance-2 视频参考入参校验同步

## 背景

这边联调时发现一个模型入口约束需要和后台同步一下。

目前 `doubao-seedance-2` 这个模型入口已经可以接收带 `video_url` 的请求，但从我们这边的使用口径看，`doubao-seedance-2` 希望只用于不带视频参考的常规视频生成。

只要请求里包含视频参考，不管是普通视频 URL 还是 `asset://` 视频素材，都不应该由 `doubao-seedance-2` 放行。

## 建议规则

当满足以下条件时，接口应直接返回明确错误，不进入生成流程：

- `model = doubao-seedance-2`
- `metadata.content` 中包含 `type: "video_url"`

## 判断方式

后台可以在任务提交入口增加一次入参检查：

```js
const hasVideoReference = Array.isArray(metadata?.content)
  && metadata.content.some((item) => item?.type === 'video_url')

if (model === 'doubao-seedance-2' && hasVideoReference) {
  // 返回错误，不创建任务
}
```

## 建议错误提示

```json
{
  "error": {
    "message": "当前模型不支持视频参考，请使用 doubao-seedance-2-video"
  }
}
```

## 示例：应拦截的请求

```json
{
  "model": "doubao-seedance-2",
  "prompt": "替换视频里的角色",
  "metadata": {
    "generate_audio": true,
    "ratio": "16:9",
    "duration": 15,
    "resolution": "480p",
    "content": [
      {
        "type": "text",
        "text": "替换视频里的角色"
      },
      {
        "type": "image_url",
        "image_url": {
          "url": "asset://asset-xxx"
        },
        "role": "reference_image"
      },
      {
        "type": "video_url",
        "video_url": {
          "url": "asset://asset-yyy"
        },
        "role": "reference_video"
      }
    ]
  }
}
```

## 预期行为

上面的请求不应进入生成流程，应直接返回错误：

```text
当前模型不支持视频参考，请使用 doubao-seedance-2-video
```

## 不需要拦截的情况

以下情况仍可由 `doubao-seedance-2` 正常处理：

- 纯文本生成视频
- 带图片参考生成视频
- `metadata.content` 中只有 `text` / `image_url`
- 不包含任何 `video_url` 的请求

## 目的

这样可以明确区分：

- `doubao-seedance-2`：常规视频生成，不含视频参考
- `doubao-seedance-2-video`：带视频参考的视频生成

避免后续任务类型、用量统计和计费口径混在一起。
