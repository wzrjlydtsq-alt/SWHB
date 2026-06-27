/**
 * Midjourney Provider — Midjourney 图片生成
 *
 * 异步轮询模式：提交 imagine 任务 → 轮询获取结果
 * runtime: 'local' — 目前仅桌面端通过第三方代理调用，涉及用户自有凭证
 */
import type {
  IModelProvider,
  GenerationRequest,
  GenerationResult,
  PollResult,
  ProviderCapabilities
} from './IModelProvider'

export class MidjourneyProvider implements IModelProvider {
  readonly id = 'midjourney'
  readonly name = 'Midjourney'
  readonly capabilities: ProviderCapabilities = {
    supportedTypes: ['image'],
    supportsImageInput: true,
    supportsAudioGeneration: false,
    isAsyncPolling: true,
    supportedRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    runtime: 'local'
  }

  async generate(
    request: GenerationRequest,
    apiKey: string,
    baseUrl: string
  ): Promise<GenerationResult> {
    const url = `${baseUrl.replace(/\/+$/, '')}/mj/submit/imagine`

    // 构造 Midjourney 的 prompt（含比例后缀）
    let mjPrompt = request.prompt
    if (request.ratio && request.ratio !== '1:1') {
      mjPrompt += ` --ar ${request.ratio}`
    }

    const body: Record<string, unknown> = {
      prompt: mjPrompt
    }

    // 垫图（参考图）
    if (request.sourceImages?.length) {
      body.base64Array = request.sourceImages
        .filter((img) => img.startsWith('data:'))
        .map((img) => img.split(',')[1])
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'mj-api-secret': apiKey
        },
        body: JSON.stringify(body)
      })

      const data = await res.json()

      if (data?.code !== 1 && data?.code !== 22) {
        return {
          success: false,
          error: data?.description || data?.message || `提交失败 (code: ${data?.code})`
        }
      }

      return {
        success: true,
        remoteTaskId: data?.result,
        needsPolling: true,
        pollInterval: 8000,
        rawResponse: data
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  async poll(taskId: string, apiKey: string, baseUrl: string): Promise<PollResult> {
    const url = `${baseUrl.replace(/\/+$/, '')}/mj/task/${taskId}/fetch`

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'mj-api-secret': apiKey }
      })

      const data = await res.json()
      const status = data?.status

      if (status === 'SUCCESS') {
        return {
          status: 'completed',
          progress: 100,
          resultUrl: data?.imageUrl
        }
      }

      if (status === 'FAILURE') {
        return {
          status: 'failed',
          progress: 0,
          error: data?.failReason || '生成失败'
        }
      }

      // IN_PROGRESS / SUBMITTED / NOT_START
      return {
        status: status === 'SUBMITTED' || status === 'NOT_START' ? 'pending' : 'processing',
        progress: data?.progress ? parseInt(data.progress) : 20
      }
    } catch (err) {
      return { status: 'failed', progress: 0, error: err.message }
    }
  }
}
