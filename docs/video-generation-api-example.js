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
      console.error('请求失败')
      console.error('HTTP 状态码:', response.status)
      console.error('响应数据:', data)
      return
    }

    console.log('提交成功:', data)
  } catch (error) {
    console.error('请求异常:', error)
  }
}

createVideo()
