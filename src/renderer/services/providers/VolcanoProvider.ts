/**
 * 火山引擎 Provider — Seedance / 豆包系列视频模型
 *
 * 异步轮询模式：提交任务 → 拿到 taskId → 轮询状态直到完成
 * runtime: 'both' — 桌面端可直接调用，未来也可迁移到后端统一路由
 */
import type {
  IModelProvider,
  GenerationRequest,
  GenerationResult,
  PollResult,
  ProviderCapabilities
} from './IModelProvider'

export class VolcanoProvider implements IModelProvider {
  readonly id = 'volcano'
  readonly name = '火山引擎 (Seedance)'
  readonly capabilities: ProviderCapabilities = {
    supportedTypes: ['video'],
    supportsImageInput: true,
    supportsAudioGeneration: true,
    isAsyncPolling: true,
    supportedRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
    supportedDurations: ['5s', '8s', '11s', '15s'],
    runtime: 'both'
  }

  async generate(
    request: GenerationRequest,
    apiKey: string,
    baseUrl: string
  ): Promise<GenerationResult> {
    const url = `${baseUrl.replace(/\/+$/, '')}/v1/video/generations`

    const body: Record<string, unknown> = {
      model: request.modelId,
      prompt: request.prompt
    }

    // 视频参数
    const resolution = this.normalizeVideoResolution(
      request.resolution,
      this.normalizeVideoResolution(request.sizeStr)
    )
    if (request.ratio) body.ratio = request.ratio
    if (resolution) body.resolution = resolution
    body.duration = this.parseVideoDurationSeconds(request.duration)
    body.generate_audio = request.generateAudio !== undefined ? request.generateAudio : true
    body.framespersecond = this.normalizeVideoFps(request.framesPerSecond)

    // 参考图 (图生视频)
    if (request.sourceImages?.length) {
      body.image_url = request.sourceImages[0]
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
      })

      const data = await res.json()

      if (!res.ok) {
        return {
          success: false,
          error: data?.error?.message || `HTTP ${res.status}`
        }
      }

      const taskId = data?.id || data?.task_id
      if (!taskId) {
        return { success: false, error: '未返回任务 ID' }
      }

      return {
        success: true,
        remoteTaskId: taskId,
        needsPolling: true,
        pollInterval: 5000,
        rawResponse: data
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  private normalizeVideoResolution(value?: string, fallback?: string): string | undefined {
    const normalized = String(value || '').toLowerCase()
    return ['480p', '720p', '1080p'].includes(normalized) ? normalized : fallback
  }

  private parseVideoDurationSeconds(value?: number | string): number {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.round(value)
    }

    const text = String(value || '').trim()
    if (!text) return 5

    const timeParts = text.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/)
    if (timeParts) {
      const parts = timeParts
        .slice(1)
        .filter((part): part is string => part !== undefined)
        .map(Number)
      if (parts.every((part) => Number.isFinite(part))) {
        if (parts.length === 2) return Math.max(parts[0] * 60 + parts[1], 1)
        return Math.max(parts[0] * 3600 + parts[1] * 60 + parts[2], 1)
      }
    }

    const numeric = Number.parseFloat(text.replace(/秒|s(ec(ond)?s?)?$/i, '').trim())
    return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 5
  }

  private normalizeVideoFps(value?: number): number {
    const numeric = Number(value)
    return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 24
  }

  async poll(taskId: string, apiKey: string, baseUrl: string): Promise<PollResult> {
    const url = `${baseUrl.replace(/\/+$/, '')}/v1/video/generations/${taskId}`

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` }
      })

      const data = await res.json()
      const status = data?.status

      if (status === 'succeeded' || status === 'completed') {
        return {
          status: 'completed',
          progress: 100,
          resultUrl: data?.content?.video_url || data?.video_url
        }
      }

      if (status === 'failed') {
        return {
          status: 'failed',
          progress: 0,
          error: data?.error?.message || '生成失败'
        }
      }

      return {
        status: 'processing',
        progress: data?.progress || 30
      }
    } catch (err) {
      return { status: 'failed', progress: 0, error: err.message }
    }
  }
}
