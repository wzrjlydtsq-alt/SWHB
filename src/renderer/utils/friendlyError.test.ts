import { describe, expect, it } from 'vitest'
import { friendlyError } from './friendlyError'

describe('friendlyError', () => {
  it('explains ByteString failures caused by non-ASCII API keys', () => {
    const message = friendlyError(
      '网络请求核心报错: Cannot convert argument to a ByteString because the character at index 7 has a value of 12304 which is greater than 255. ; 尝试访问了 -> https://www.lingjingxinghe.cn/v1/videos/generations (诊断: targetModel=doubao-seedance-2, modelId=doubao-seedance-2, configName=doubao-seedance-2)'
    )

    expect(message).toContain('API Key')
    expect(message).toContain('非 ASCII')
    expect(message).not.toContain('网络连接失败')
  })

  it('explains Seedance legacy gateway 500 failures with an actionable config hint', () => {
    const message = friendlyError(
      'Video generation submit failed: HTTP 500: Internal server error (endpoint=http://47.108.196.234:10086/prod/v1/video/generations, model=doubao-seedance-2, submittedModel=doubao-seedance-2, modelId=doubao-seedance-2, configName=doubao-seedance-2)'
    )

    expect(message).toContain('Seedance 网关提交失败')
    expect(message).toContain('服务端返回 500')
    expect(message).toContain('SSRF')
    expect(message).toContain('10086')
    expect(message).not.toContain('ep-...')
  })

  it('explains invalid tokens on the old Lingjing Xinghe host', () => {
    const message = friendlyError(
      'Video generation submit failed: HTTP 401 Unauthorized: 无效的令牌 (request id: 2026061510012418773677P1Yz6H3T) (endpoint=https://www.lingjingxinghe.cn/v1/video/generations, model=doubao-seedance-2, submittedModel=doubao-seedance-2, modelId=doubao-seedance-2, configName=doubao-seedance-2)'
    )

    expect(message).toContain('老站')
    expect(message).toContain('http://prod.lingjingxinghe.cn/prod')
  })

  it('explains the missing /prod path on the new Lingjing Xinghe host', () => {
    const message = friendlyError(
      'Video generation submit failed: HTTP 405 Not Allowed: HTTP 405 (endpoint=http://prod.lingjingxinghe.cn/v1/video/generations, model=doubao-seedance-2, submittedModel=doubao-seedance-2, modelId=doubao-seedance-2, configName=doubao-seedance-2)'
    )

    expect(message).toContain('少了 /prod')
    expect(message).toContain('http://prod.lingjingxinghe.cn/prod')
  })

  it('translates generic image submit HTTP failures', () => {
    const message = friendlyError(
      'Image generation submit failed: HTTP 500 Internal Server Error: Internal server error (endpoint=https://example.test/v1/images/generations, model=nano-banana)'
    )

    expect(message).toContain('图像生成提交失败')
    expect(message).toContain('服务端内部错误')
    expect(message).not.toContain('Image generation submit failed')
  })

  it('translates generic video submit HTTP failures', () => {
    const message = friendlyError(
      'Video generation submit failed: HTTP 429 Too Many Requests: quota exceeded (endpoint=https://example.test/v1/video/generations, model=sora-2)'
    )

    expect(message).toContain('视频生成提交失败')
    expect(message).toContain('请求过于频繁')
    expect(message).not.toContain('Video generation submit failed')
  })

  it('explains Seedance input image privacy moderation failures', () => {
    const message = friendlyError(
      'Video generation submit failed: HTTP 400: {"error":{"code":"InputImageSensitiveContentDetected.PrivacyInformation","message":"The request failed because the input image may contain real person. Request id: 021782382963546b63da7653fc4f8c7bdcf4dfd40872aa4eff8db","param":"","type":"BadRequest"}} (endpoint=http://47.108.196.234:10086/prod/v1/video/generations, model=doubao-seedance-2, submittedModel=doubao-seedance-2, modelId=doubao-seedance-2, configName=doubao-seedance-2)'
    )

    expect(message).toContain('视频生成提交失败')
    expect(message).toContain('参考图疑似包含真实人物或隐私信息')
    expect(message).toContain('更换参考图')
    expect(message).not.toContain('模型配置和输入内容')
    expect(message).not.toContain('InputImageSensitiveContentDetected')
  })

  it('translates HappyHorse and OSS generation errors', () => {
    expect(friendlyError('HappyHorse submit failed: HTTP 400 Bad Request: InvalidParameter')).toContain(
      'HappyHorse 任务提交失败'
    )
    expect(friendlyError('HappyHorse video source cannot be read: blob:http://local: fetch failed')).toContain(
      '无法读取视频素材'
    )
    expect(friendlyError('OSS reference upload failed: unknown error')).toContain('OSS 失败')
  })

  it('translates unsupported generation protocol errors', () => {
    const message = friendlyError('Unsupported generation protocol: foo (model=bar, type=video)')

    expect(message).toContain('当前模型协议暂不支持')
    expect(message).not.toContain('Unsupported generation protocol')
  })
})
