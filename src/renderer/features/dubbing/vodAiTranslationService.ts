export type TranslationType = 'SubtitleTranslation' | 'VoiceTranslation' | 'FacialTranslation'

export type SubmitDubbingWorkflowPayload = {
  spaceName: string
  vid: string
  sourceLanguage: string
  targetLanguage: string
  translationTypes: TranslationType[]
  staged?: boolean
  suspensionStage?: 'SubtitleRecognition' | 'SubtitleTranslation'
  termbaseIds?: string[]
}

export type UploadMediaByUrlPayload = {
  spaceName: string
  sourceUrl: string
  title?: string
  fileName?: string
  fileExtension?: string
  callbackArgs?: string
}

function getVodApi() {
  return window.api?.vodAITranslation
}

export async function getVodTranslationStatus() {
  const api = getVodApi()
  if (!api?.status) return { success: false, configured: false, error: 'VOD IPC 未就绪' }
  return api.status()
}

export async function getVodTranslationConfig() {
  const api = getVodApi()
  if (!api?.getConfig) return { success: false, configured: false, error: 'VOD IPC 未就绪' }
  return api.getConfig()
}

export async function saveVodTranslationConfig(payload: {
  accessKeyId: string
  secretAccessKey: string
  region?: string
  spaceName?: string
}) {
  const api = getVodApi()
  if (!api?.saveConfig) return { success: false, configured: false, error: 'VOD IPC 未就绪' }
  return api.saveConfig(payload)
}

export async function clearVodTranslationConfig() {
  const api = getVodApi()
  if (!api?.clearConfig) return { success: false, configured: false, error: 'VOD IPC 未就绪' }
  return api.clearConfig()
}

export async function submitDubbingWorkflow(payload: SubmitDubbingWorkflowPayload) {
  const api = getVodApi()
  if (!api?.submitWorkflow) return { success: false, error: 'VOD IPC 未就绪' }

  const body: Record<string, unknown> = {
    SpaceName: payload.spaceName,
    Vid: payload.vid,
    TranslationConfig: {
      SourceLanguage: payload.sourceLanguage,
      TargetLanguage: payload.targetLanguage,
      TranslationTypeList: payload.translationTypes
    }
  }

  if (payload.staged) {
    body.ProcessConfig = {
      SuspensionStageList: [payload.suspensionStage || 'SubtitleTranslation']
    }
  }

  if (payload.termbaseIds?.length) {
    body.TranslationTermbaseIds = payload.termbaseIds
  }

  return api.submitWorkflow(body)
}

export async function getDubbingProject(spaceName: string, projectId: string) {
  const api = getVodApi()
  if (!api?.getProject) return { success: false, error: 'VOD IPC 未就绪' }
  return api.getProject({ SpaceName: spaceName, ProjectId: projectId })
}

export async function continueDubbingWorkflow(spaceName: string, projectId: string) {
  const api = getVodApi()
  if (!api?.continueWorkflow) return { success: false, error: 'VOD IPC 未就绪' }
  return api.continueWorkflow({ SpaceName: spaceName, ProjectId: projectId })
}

export async function updateDubbingUtterances(
  spaceName: string,
  projectId: string,
  utterances: Array<Record<string, unknown>>
) {
  const api = getVodApi()
  if (!api?.updateUtterances) return { success: false, error: 'VOD IPC 未就绪' }
  return api.updateUtterances({
    SpaceName: spaceName,
    ProjectId: projectId,
    UtteranceList: utterances
  })
}

export async function refreshDubbingProject(spaceName: string, projectId: string) {
  const api = getVodApi()
  if (!api?.refreshProject) return { success: false, error: 'VOD IPC 未就绪' }
  return api.refreshProject({ SpaceName: spaceName, ProjectId: projectId, RefreshType: 'whole' })
}

export async function listDubbingProjects(spaceName: string) {
  const api = getVodApi()
  if (!api?.listProject) return { success: false, error: 'VOD IPC 未就绪' }
  return api.listProject({ SpaceName: spaceName, PageNumber: 1, PageSize: 20 })
}

export async function uploadMediaByUrl(payload: UploadMediaByUrlPayload) {
  const api = getVodApi()
  if (!api?.uploadMediaByUrl) return { success: false, error: 'VOD IPC 未就绪' }

  const urlSet: Record<string, unknown> = {
    SourceUrl: payload.sourceUrl,
    Category: 'video',
    Title: payload.title || '海外译制源视频',
    CallbackArgs: payload.callbackArgs || ''
  }

  if (payload.fileName) {
    urlSet.FileName = payload.fileName
  } else if (payload.fileExtension) {
    urlSet.FileExtension = payload.fileExtension
  }

  return api.uploadMediaByUrl({
    SpaceName: payload.spaceName,
    URLSets: [urlSet]
  })
}

export async function queryUploadTask(jobId: string) {
  const api = getVodApi()
  if (!api?.queryUploadTask) return { success: false, error: 'VOD IPC 未就绪' }
  return api.queryUploadTask({ JobIds: jobId })
}

export function readProjectId(result: any) {
  const body = result?.result || result?.data?.Result || result?.data
  return (
    body?.ProjectId ||
    body?.ProjectBaseInfo?.ProjectId ||
    body?.Project?.ProjectId ||
    body?.ProjectInfo?.ProjectId ||
    ''
  )
}

export function readProjectBody(result: any) {
  return (
    result?.result ||
    result?.data?.Result ||
    result?.data?.Project ||
    result?.data?.ProjectInfo ||
    result?.data ||
    null
  )
}

export function readProjectStatus(result: any) {
  const body = readProjectBody(result)
  return (
    body?.Status ||
    body?.ProjectStatus ||
    body?.WorkflowStatus ||
    body?.ProjectBaseInfo?.Status ||
    body?.ProjectBaseInfo?.ProjectStatus ||
    body?.ProjectInfo?.Status ||
    body?.ProjectInfo?.ProjectStatus ||
    ''
  )
}

export function readProjectOutputUrl(result: any) {
  const body = readProjectBody(result)
  return findFirstUrl(body)
}

export function readUrlUploadJobId(result: any) {
  const body = result?.result || result?.data?.Result || result?.data
  const items = body?.Data || body?.data || body?.URLSets || body?.UrlSets || []
  const first = Array.isArray(items) ? items[0] : items
  return first?.JobId || first?.JobID || body?.JobId || ''
}

export function readUploadTaskInfo(result: any) {
  const body = result?.result || result?.data?.Result || result?.data
  const data = body?.Data || body?.data || body
  const list = data?.MediaInfoList || data?.mediaInfoList || data?.URLSet || data?.UrlSet || []
  const first = Array.isArray(list) ? list[0] : list
  return {
    state: first?.State || first?.Status || first?.state || '',
    vid: first?.Vid || first?.VID || first?.vid || '',
    sourceUrl: first?.SourceUrl || first?.sourceUrl || '',
    error: first?.Message || first?.ErrorMessage || first?.error || ''
  }
}

function findFirstUrl(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') {
    return /^https?:\/\//i.test(value) || /^vod:\/\//i.test(value) ? value : ''
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = findFirstUrl(item)
      if (url) return url
    }
    return ''
  }
  if (typeof value !== 'object') return ''

  const record = value as Record<string, unknown>
  const preferredKeys = [
    'VideoUrl',
    'OutputUrl',
    'FileUrl',
    'PlayUrl',
    'Url',
    'SubtitleUrl',
    'AudioUrl'
  ]
  for (const key of preferredKeys) {
    const url = findFirstUrl(record[key])
    if (url) return url
  }
  for (const item of Object.values(record)) {
    const url = findFirstUrl(item)
    if (url) return url
  }
  return ''
}
