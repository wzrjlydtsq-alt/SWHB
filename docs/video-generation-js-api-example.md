# 视频生成 API JavaScript 调用示例

## 接口信息

```text
POST http://47.108.196.234:10086/prod/v1/video/generations
```

## 鉴权方式

请求头必须携带 `Authorization`，格式如下：

```text
Authorization: Bearer YOUR_API_KEY
```

注意：

- `Bearer` 必须保留。
- `YOUR_API_KEY` 替换为实际 API 密钥。
- API 密钥本身不要再包含 `Bearer `。
- 如果去掉 `Bearer`，服务端会返回类似 `Missing API key in Authorization header`。
- 如果带了 `Bearer` 仍返回 `Invalid token`，说明密钥本身无效、过期、未授权，或不是该网关分配的密钥。

## 原生 fetch 示例

```js
const API_URL = 'http://47.108.196.234:10086/prod/v1/video/generations'
const API_KEY = 'YOUR_API_KEY'

async function createVideo() {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'ep-20260528151839-mmr69',
        prompt: '一只猫在阳光下奔跑',
        ratio: '16:9',
        duration: 5
      })
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('请求失败:', response.status, data)
      return
    }

    console.log('提交成功:', data)
  } catch (error) {
    console.error('请求异常:', error)
  }
}

createVideo()
```

## axios 示例

```js
import axios from 'axios'

const API_URL = 'http://47.108.196.234:10086/prod/v1/video/generations'
const API_KEY = 'YOUR_API_KEY'

async function createVideo() {
  try {
    const response = await axios.post(
      API_URL,
      {
        model: 'ep-20260528151839-mmr69',
        prompt: '一只猫在阳光下奔跑',
        ratio: '16:9',
        duration: 5
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    )

    console.log('提交成功:', response.data)
  } catch (error) {
    console.error('请求失败:', error.response?.status, error.response?.data || error.message)
  }
}

createVideo()
```

## 常见错误说明

### 1. Missing API key in Authorization header

说明请求头中的 `Authorization` 格式不正确，通常是没有带 `Bearer`。

正确格式：

```text
Authorization: Bearer YOUR_API_KEY
```

### 2. Invalid token

说明服务端识别到了 `Authorization` 请求头，但密钥没有通过校验。

请检查：

- API 密钥是否正确。
- API 密钥是否已过期或被禁用。
- API 密钥是否属于当前接口网关。
- API 密钥是否有 `/prod` 环境权限。
- API 密钥是否有模型 `ep-20260528151839-mmr69` 的调用权限。

## 配置建议

如果在应用配置中填写：

```text
API 调用地址: http://47.108.196.234:10086/prod/v1/video/generations
模型名称: ep-20260528151839-mmr69
API 密钥: YOUR_API_KEY
```

API 密钥只填写纯密钥，不要填写：

```text
Bearer YOUR_API_KEY
```

程序或示例代码会自动拼接成：

```text
Authorization: Bearer YOUR_API_KEY
```
