# Lingjing Xinghe 三张参考图 URL 生图示例

本文档演示通过 `https://www.lingjingxinghe.cn` 聚合网关调用图片生成接口，并传入 3 张公网参考图 URL。

## 关键点

- API Base URL 使用 `https://www.lingjingxinghe.cn`
- 图片生成接口使用 `POST /v1/images/generations`
- 参考图必须是服务端可访问的公网 URL，推荐使用 `https://image.lingjingxinghe.cn/uploads/...`
- Seedream 多参考图使用 `image` 数组字段，不是 `image_url`
- 不要传 `file://`、`blob:`、`xinghe://` 或本机路径给服务端

## 请求体

```json
{
  "model": "doubao-seedream-5-0-260128",
  "prompt": "参考三张图，将图1的人物、图2的服装、图3的场景融合成一张写实电影感海报，保持主体一致，光影自然，细节清晰。",
  "image": [
    "https://image.lingjingxinghe.cn/uploads/ref-image-1.png",
    "https://image.lingjingxinghe.cn/uploads/ref-image-2.png",
    "https://image.lingjingxinghe.cn/uploads/ref-image-3.png"
  ],
  "size": "2K",
  "output_format": "png",
  "response_format": "url",
  "watermark": false
}
```

把上面的 3 个 `ref-image-*.png` 替换成真实上传后的图片 URL。

## Node.js Fetch 示例

```js
const API_KEY = process.env.LINGJING_XINGHE_API_KEY
const BASE_URL = 'https://www.lingjingxinghe.cn'

async function generateWithThreeReferenceImages() {
  const response = await fetch(`${BASE_URL}/v1/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: 'doubao-seedream-5-0-260128',
      prompt:
        '参考三张图，将图1的人物、图2的服装、图3的场景融合成一张写实电影感海报，保持主体一致，光影自然，细节清晰。',
      image: [
        'https://image.lingjingxinghe.cn/uploads/ref-image-1.png',
        'https://image.lingjingxinghe.cn/uploads/ref-image-2.png',
        'https://image.lingjingxinghe.cn/uploads/ref-image-3.png'
      ],
      size: '2K',
      output_format: 'png',
      response_format: 'url',
      watermark: false
    })
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(
      `Image generation failed: HTTP ${response.status} ${response.statusText}: ${JSON.stringify(data)}`
    )
  }

  console.log(data)
  return data
}

generateWithThreeReferenceImages().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
```

## Curl 示例

```bash
curl https://www.lingjingxinghe.cn/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LINGJING_XINGHE_API_KEY" \
  -d '{
    "model": "doubao-seedream-5-0-260128",
    "prompt": "参考三张图，将图1的人物、图2的服装、图3的场景融合成一张写实电影感海报，保持主体一致，光影自然，细节清晰。",
    "image": [
      "https://image.lingjingxinghe.cn/uploads/ref-image-1.png",
      "https://image.lingjingxinghe.cn/uploads/ref-image-2.png",
      "https://image.lingjingxinghe.cn/uploads/ref-image-3.png"
    ],
    "size": "2K",
    "output_format": "png",
    "response_format": "url",
    "watermark": false
  }'
```

## 400 错误排查

如果返回类似 `get file base64 from ...` 的 `HTTP 400 Bad Request`，优先检查这几项：

- 参考图 URL 能否在无登录浏览器窗口直接打开
- URL 是否返回真实图片，而不是 403、404 或 HTML 页面
- URL 是否过期，或需要私有鉴权
- 图片是否过大、格式异常，建议先换小尺寸 JPG/PNG 测试
- 是否误传了本机路径、本地缓存协议或临时 blob URL
