import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  Captions,
  CheckCircle2,
  Download,
  FileVideo,
  Languages,
  Mic2,
  Play,
  RotateCw,
  Settings,
  Upload,
  Wand2
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { addAssetToLibrary } from '../../utils/assetLibrary'
import {
  createFallbackUtterances,
  createDubbingJob,
  getNextDubbingStatus,
  loadDubbingQueue,
  mapVodProjectStatus,
  patchDubbingJob,
  saveDubbingQueue
} from './dubbingQueue'
import type { DubbingJob, DubbingStatus, DubbingUtterance } from './dubbingQueue'
import {
  continueDubbingWorkflow,
  getDubbingProject,
  getVodTranslationStatus,
  readProjectOutputUrl,
  readProjectId,
  readProjectStatus,
  readUploadTaskInfo,
  readUrlUploadJobId,
  refreshDubbingProject,
  submitDubbingWorkflow,
  updateDubbingUtterances,
  queryUploadTask,
  uploadMediaByUrl
} from './vodAiTranslationService'
import type { TranslationType } from './vodAiTranslationService'

const STATUS_META: Record<DubbingStatus, { label: string; tone: string }> = {
  queued: { label: '待提交', tone: 'border-white/12 bg-white/[0.05] text-white/70' },
  submitted: { label: '处理中', tone: 'border-sky-300/20 bg-sky-300/10 text-sky-100' },
  subtitleReview: { label: '待校对', tone: 'border-amber-300/25 bg-amber-300/10 text-amber-100' },
  rendering: { label: '导出中', tone: 'border-violet-300/25 bg-violet-300/10 text-violet-100' },
  exportReady: { label: '可导出', tone: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100' },
  returned: { label: '已回流', tone: 'border-teal-300/25 bg-teal-300/10 text-teal-100' }
}

const TARGET_LANGUAGES = ['英语', '日语', '韩语', '西班牙语', '葡萄牙语', '泰语', '越南语']
const PIPELINE_STEPS = [
  { id: 'ingest', label: '素材入池', icon: Upload },
  { id: 'submit', label: '提交翻译', icon: Languages },
  { id: 'review', label: '字幕校对', icon: Captions },
  { id: 'voice', label: '音色复核', icon: Mic2 },
  { id: 'render', label: '导出译制', icon: Download },
  { id: 'return', label: '素材回流', icon: BadgeCheck }
]

type DubbingIngestPayload = {
  title?: string
  vid?: string
  duration?: string
  sourceUrl?: string
  sourcePanel?: string
  sourceRowId?: string
  targetLanguage?: string
}

export function OverseasDubbingPanel() {
  const [jobs, setJobs] = useState<DubbingJob[]>(() => loadDubbingQueue())
  const [selectedJobId, setSelectedJobId] = useState('')
  const [spaceName, setSpaceName] = useState('space-5v3c8f')
  const [sourceVid, setSourceVid] = useState('')
  const [sourceTitle, setSourceTitle] = useState('')
  const [sourceDuration, setSourceDuration] = useState('')
  const [targetLanguage, setTargetLanguage] = useState('英语')
  const [workflow, setWorkflow] = useState<'direct' | 'staged'>('staged')
  const [subtitleSource, setSubtitleSource] = useState('ASR')
  const [enableVoice, setEnableVoice] = useState(true)
  const [enableFace, setEnableFace] = useState(true)
  const [enableHardSub, setEnableHardSub] = useState(true)
  const [eraseOriginalSub, setEraseOriginalSub] = useState(false)
  const [vodConfigured, setVodConfigured] = useState(false)
  const [vodSource, setVodSource] = useState('')
  const [apiBusy, setApiBusy] = useState(false)
  const [apiNotice, setApiNotice] = useState('')
  const [reviewOpen, setReviewOpen] = useState(false)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)

  const selectedJob = jobs.find((job) => job.id === selectedJobId) || jobs[0]
  const summary = useMemo(() => {
    const total = jobs.length
    const review = jobs.filter((job) => job.status === 'subtitleReview').length
    const ready = jobs.filter((job) => job.status === 'exportReady').length
    const returned = jobs.filter((job) => job.status === 'returned').length
    return { total, review, ready, returned }
  }, [jobs])

  const refreshVodConfigStatus = useCallback(() => {
    let cancelled = false
    getVodTranslationStatus().then((result) => {
      if (cancelled) return
      setVodConfigured(Boolean(result.configured))
      setVodSource(result.source || '')
      if (result.spaceName && (!spaceName.trim() || spaceName === 'space-5v3c8f')) {
        setSpaceName(result.spaceName)
      }
      if (!result.configured) {
        setApiNotice('未检测到火山 VOD AK/SK，当前按钮会以本地流程推进。')
      } else {
        setApiNotice('')
      }
    })
    return () => {
      cancelled = true
    }
  }, [spaceName])

  useEffect(() => {
    const cleanup = refreshVodConfigStatus()
    const handleConfigUpdated = () => refreshVodConfigStatus()
    window.addEventListener('vod-ai-translation-config-updated', handleConfigUpdated)
    return () => {
      cleanup()
      window.removeEventListener('vod-ai-translation-config-updated', handleConfigUpdated)
    }
  }, [refreshVodConfigStatus])

  useEffect(() => {
    saveDubbingQueue(jobs)
    if (!jobs.length) {
      setSelectedJobId('')
      return
    }
    if (!selectedJobId || !jobs.some((job) => job.id === selectedJobId)) {
      setSelectedJobId(jobs[0].id)
    }
  }, [jobs, selectedJobId])

  const createMockJob = () => {
    const nextJob = createDubbingJob({
      index: jobs.length + 1,
      title: sourceTitle,
      vid: sourceVid,
      duration: sourceDuration,
      targetLanguage,
      workflow,
      subtitleSource,
      enableVoice,
      enableFace,
      hardSubtitle: enableHardSub,
      eraseOriginalSubtitle: eraseOriginalSub
    })
    setJobs((prev) => [nextJob, ...prev])
    setSelectedJobId(nextJob.id)
    setSourceVid('')
    setSourceTitle('')
    setSourceDuration('')
  }

  const ingestExternalJob = useCallback(
    (payload: DubbingIngestPayload) => {
      const nextJob = createDubbingJob({
        index: jobs.length + 1,
        title: payload.title || sourceTitle,
        vid: payload.vid || sourceVid,
        duration: payload.duration || sourceDuration,
        sourceUrl: payload.sourceUrl,
        sourcePanel: payload.sourcePanel,
        sourceRowId: payload.sourceRowId,
        targetLanguage: payload.targetLanguage || targetLanguage,
        workflow,
        subtitleSource,
        enableVoice,
        enableFace,
        hardSubtitle: enableHardSub,
        eraseOriginalSubtitle: eraseOriginalSub
      })
      setJobs((prev) => [nextJob, ...prev])
      setSelectedJobId(nextJob.id)
      setApiNotice(
        nextJob.vid
          ? '已从批量生产板加入海外译制队列。'
          : '已从批量生产板加入队列；提交前需要上传到火山 VOD 并填写 Vid。'
      )
    },
    [
      enableFace,
      enableHardSub,
      enableVoice,
      eraseOriginalSub,
      jobs.length,
      sourceDuration,
      sourceTitle,
      sourceVid,
      subtitleSource,
      targetLanguage,
      workflow
    ]
  )

  useEffect(() => {
    const handleIngest = (event: Event) => {
      ingestExternalJob((event as CustomEvent<DubbingIngestPayload>).detail || {})
    }
    const handleQueueUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ jobId?: string; message?: string }>).detail || {}
      const nextJobs = loadDubbingQueue()
      setJobs(nextJobs)
      if (detail.jobId) setSelectedJobId(detail.jobId)
      if (detail.message) setApiNotice(detail.message)
    }
    window.addEventListener('overseas-dubbing-ingest', handleIngest)
    window.addEventListener('overseas-dubbing-queue-updated', handleQueueUpdated)
    return () => {
      window.removeEventListener('overseas-dubbing-ingest', handleIngest)
      window.removeEventListener('overseas-dubbing-queue-updated', handleQueueUpdated)
    }
  }, [ingestExternalJob])

  const openVodSettings = () => {
    setSettingsOpen(true)
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('open-settings-tab', { detail: 'services' }))
    }, 0)
  }

  const advanceSelectedJob = () => {
    if (!selectedJob) return
    const nextStatus = getNextDubbingStatus(selectedJob.status)
    setJobs((prev) =>
      patchDubbingJob(prev, selectedJob.id, {
        status: nextStatus,
        ...(nextStatus === 'exportReady'
          ? { outputUrl: selectedJob.outputUrl || `vod://${selectedJob.vid}/translated` }
          : {})
      })
    )
  }

  const patchSelectedJob = (patch: Partial<DubbingJob>) => {
    if (!selectedJob) return
    setJobs((prev) => patchDubbingJob(prev, selectedJob.id, patch))
  }

  const runVodAction = async (
    kind: 'upload-url' | 'query-upload' | 'submit' | 'inspect' | 'continue' | 'refresh' | 'return'
  ) => {
    if (!selectedJob || apiBusy) return

    if (kind === 'return') {
      const assetPath =
        selectedJob.outputUrl || `vod://${selectedJob.projectId || selectedJob.vid}/translated`
      const asset = addAssetToLibrary({
        category: 'videos',
        path: assetPath,
        name: `${selectedJob.title.replace(/\.[^.]+$/, '')}_${selectedJob.targetLanguage}.mp4`,
        type: 'video/mp4',
        source: 'vod-ai-translation'
      })
      if (asset.success) {
        patchSelectedJob({
          status: 'returned',
          outputUrl: assetPath,
          returnedAssetId: asset.assetId,
          lastError: ''
        })
        setApiNotice('译制成片已回流到本地素材库的视频分类。')
      } else {
        patchSelectedJob({ lastError: asset.error || '素材库回流失败' })
        setApiNotice(asset.error || '素材库回流失败')
      }
      return
    }

    if (!vodConfigured) {
      if (kind === 'upload-url' || kind === 'query-upload') {
        setApiNotice('未配置火山 VOD AK/SK，无法上传或查询 VOD 媒资。')
        return
      }
      advanceSelectedJob()
      setApiNotice('未配置火山 VOD AK/SK，已使用本地状态推进。')
      return
    }

    setApiBusy(true)
    setApiNotice('')
    try {
      let result: any = null
      if (kind === 'upload-url') {
        if (!selectedJob.sourceUrl && !selectedJob.outputUrl) {
          throw new Error('缺少源视频地址，无法提交 VOD URL 拉取上传。')
        }
        const sourceUrl = await ensurePublicVideoUrl(selectedJob.sourceUrl || selectedJob.outputUrl || '')
        result = await uploadMediaByUrl({
          spaceName,
          sourceUrl,
          title: selectedJob.title,
          fileExtension: inferFileExtension(selectedJob.title || sourceUrl),
          callbackArgs: selectedJob.id
        })
        if (result.success) {
          const uploadJobId = readUrlUploadJobId(result)
          patchSelectedJob({
            uploadJobId,
            uploadState: uploadJobId ? 'submitted' : 'unknown',
            uploadSourceUrl: sourceUrl,
            lastSyncedAt: new Date().toISOString(),
            lastError: ''
          })
          setApiNotice(
            uploadJobId
              ? '已提交 VOD URL 拉取上传，稍后可查询 Vid。'
              : '已提交 VOD URL 拉取上传，但未读到 JobId，请稍后手动同步。'
          )
        }
      } else if (kind === 'query-upload') {
        if (!selectedJob.uploadJobId) throw new Error('缺少 URL 上传 JobId。')
        result = await queryUploadTask(selectedJob.uploadJobId)
        if (result.success) {
          const info = readUploadTaskInfo(result)
          patchSelectedJob({
            uploadState: info.state || selectedJob.uploadState || 'unknown',
            ...(info.vid ? { vid: info.vid } : {}),
            ...(info.sourceUrl ? { uploadSourceUrl: info.sourceUrl } : {}),
            lastSyncedAt: new Date().toISOString(),
            lastError: info.error || ''
          })
          setApiNotice(info.vid ? 'VOD 上传已完成，Vid 已写回任务。' : `上传状态：${info.state || '未知'}`)
        }
      } else if (kind === 'submit') {
        if (!selectedJob.vid || selectedJob.vid.includes('://')) {
          throw new Error('缺少火山 VOD Vid。请先把源视频上传到 VOD，填写 Vid 后再提交译制。')
        }
        result = await submitDubbingWorkflow({
          spaceName,
          vid: selectedJob.vid,
          sourceLanguage: selectedJob.sourceLanguage === '中文' ? 'zh' : 'en',
          targetLanguage: languageToCode(selectedJob.targetLanguage),
          translationTypes: getTranslationTypesForJob(selectedJob),
          staged: selectedJob.workflow === 'staged',
          suspensionStage: 'SubtitleTranslation'
        })
        if (result.success) {
          const projectId = readProjectId(result)
          patchSelectedJob({
            status: 'submitted',
            projectId,
            lastSyncedAt: new Date().toISOString(),
            lastError: ''
          })
          setApiNotice(projectId ? '已提交火山 VOD AI 翻译任务。' : '已提交任务，等待项目编号回传。')
        }
      } else if (kind === 'inspect') {
        if (!selectedJob.projectId) throw new Error('缺少 ProjectId，无法查询项目。')
        result = await getDubbingProject(spaceName, selectedJob.projectId)
        if (result.success) {
          const status = mapVodProjectStatus(readProjectStatus(result), selectedJob.status)
          const outputUrl = readProjectOutputUrl(result)
          patchSelectedJob({
            status,
            ...(outputUrl ? { outputUrl } : {}),
            ...(status === 'subtitleReview' && !selectedJob.utterances?.length
              ? { utterances: createFallbackUtterances(selectedJob) }
              : {}),
            lastSyncedAt: new Date().toISOString(),
            lastError: ''
          })
          setApiNotice(status === 'exportReady' ? '项目已完成，可回流素材库。' : '已同步项目详情。')
        }
      } else if (kind === 'continue') {
        if (!selectedJob.projectId) throw new Error('缺少 ProjectId，无法恢复任务。')
        result = await continueDubbingWorkflow(spaceName, selectedJob.projectId)
        if (result.success) {
          patchSelectedJob({
            status: 'rendering',
            lastSyncedAt: new Date().toISOString(),
            lastError: ''
          })
          setApiNotice('已恢复 AI 翻译工作流。')
        }
      } else if (kind === 'refresh') {
        if (!selectedJob.projectId) throw new Error('缺少 ProjectId，无法刷新导出。')
        result = await refreshDubbingProject(spaceName, selectedJob.projectId)
        if (result.success) {
          const outputUrl = readProjectOutputUrl(result)
          patchSelectedJob({
            status: mapVodProjectStatus(readProjectStatus(result), 'exportReady'),
            ...(outputUrl ? { outputUrl } : {}),
            lastSyncedAt: new Date().toISOString(),
            lastError: ''
          })
          setApiNotice('已提交重新导出任务。')
        }
      }

      if (result && !result.success) {
        patchSelectedJob({ lastError: result.error || '火山 VOD 请求失败' })
        setApiNotice(result.error || '火山 VOD 请求失败')
      }
    } catch (error: any) {
      const message = error?.message || String(error)
      patchSelectedJob({ lastError: message })
      setApiNotice(message)
    } finally {
      setApiBusy(false)
    }
  }

  const updateSelectedUtterance = (
    utteranceId: string,
    patch: Partial<DubbingUtterance>
  ) => {
    if (!selectedJob) return
    const utterances = selectedJob.utterances?.length
      ? selectedJob.utterances
      : createFallbackUtterances(selectedJob)
    patchSelectedJob({
      utterances: utterances.map((utterance) =>
        utterance.id === utteranceId ? { ...utterance, ...patch } : utterance
      )
    })
  }

  const saveSubtitleReview = async () => {
    if (!selectedJob || apiBusy) return
    const utterances = selectedJob.utterances?.length
      ? selectedJob.utterances
      : createFallbackUtterances(selectedJob)

    if (!vodConfigured || !selectedJob.projectId) {
      patchSelectedJob({ utterances, lastError: '' })
      setApiNotice('字幕校对已保存到本地队列；配置 VOD 并同步 ProjectId 后可提交到火山。')
      return
    }

    setApiBusy(true)
    setApiNotice('')
    try {
      const result = await updateDubbingUtterances(
        spaceName,
        selectedJob.projectId,
        utterances.map((utterance) => ({
          UtteranceId: utterance.id,
          StartTime: utterance.startTime,
          EndTime: utterance.endTime,
          Speaker: utterance.speaker,
          SourceText: utterance.sourceText,
          TargetText: utterance.targetText,
          VoiceMode: utterance.voiceMode || 'translated'
        }))
      )
      if (!result.success) throw new Error(result.error || '字幕提交失败')
      patchSelectedJob({ utterances, lastSyncedAt: new Date().toISOString(), lastError: '' })
      setApiNotice('字幕校对已提交到火山 VOD。')
    } catch (error: any) {
      const message = error?.message || String(error)
      patchSelectedJob({ lastError: message })
      setApiNotice(message)
    } finally {
      setApiBusy(false)
    }
  }

  const submitRunnableJobs = async () => {
    if (apiBusy) return
    if (!vodConfigured) {
      setApiNotice('未配置火山 VOD AK/SK，无法批量提交真实任务。')
      return
    }
    const runnableJobs = jobs.filter(
      (job) => job.status === 'queued' && job.vid && !job.vid.includes('://')
    )
    if (!runnableJobs.length) {
      setApiNotice('没有可提交的任务：请确认队列状态为待提交，并已填写火山 VOD Vid。')
      return
    }

    setApiBusy(true)
    let successCount = 0
    let failCount = 0
    for (const job of runnableJobs) {
      try {
        const result = await submitDubbingWorkflow({
          spaceName,
          vid: job.vid,
          sourceLanguage: job.sourceLanguage === '中文' ? 'zh' : 'en',
          targetLanguage: languageToCode(job.targetLanguage),
          translationTypes: getTranslationTypesForJob(job),
          staged: job.workflow === 'staged',
          suspensionStage: 'SubtitleTranslation'
        })
        if (!result.success) throw new Error(result.error || '火山 VOD 请求失败')
        successCount += 1
        setJobs((prev) =>
          patchDubbingJob(prev, job.id, {
            status: 'submitted',
            projectId: readProjectId(result),
            lastSyncedAt: new Date().toISOString(),
            lastError: ''
          })
        )
      } catch (error: any) {
        failCount += 1
        setJobs((prev) =>
          patchDubbingJob(prev, job.id, {
            lastError: error?.message || String(error)
          })
        )
      }
    }
    setApiBusy(false)
    setApiNotice(`批量提交完成：成功 ${successCount} 个，失败 ${failCount} 个。`)
  }

  const uploadPendingSources = async () => {
    if (apiBusy) return
    if (!vodConfigured) {
      setApiNotice('未配置火山 VOD AK/SK，无法批量上传源视频。')
      return
    }
    const uploadableJobs = jobs.filter((job) => job.status === 'queued' && job.sourceUrl && !job.vid && !job.uploadJobId)
    if (!uploadableJobs.length) {
      setApiNotice('没有可提交 VOD URL 拉取的源视频。')
      return
    }

    setApiBusy(true)
    let successCount = 0
    let failCount = 0
    for (const job of uploadableJobs) {
      try {
        const sourceUrl = await ensurePublicVideoUrl(job.sourceUrl || '')
        const result = await uploadMediaByUrl({
          spaceName,
          sourceUrl,
          title: job.title,
          fileExtension: inferFileExtension(job.title || sourceUrl),
          callbackArgs: job.id
        })
        if (!result.success) throw new Error(result.error || 'VOD URL 拉取上传失败')
        const uploadJobId = readUrlUploadJobId(result)
        successCount += 1
        setJobs((prev) =>
          patchDubbingJob(prev, job.id, {
            uploadJobId,
            uploadState: uploadJobId ? 'submitted' : 'unknown',
            uploadSourceUrl: sourceUrl,
            lastSyncedAt: new Date().toISOString(),
            lastError: ''
          })
        )
      } catch (error: any) {
        failCount += 1
        setJobs((prev) =>
          patchDubbingJob(prev, job.id, {
            lastError: error?.message || String(error)
          })
        )
      }
    }
    setApiBusy(false)
    setApiNotice(`批量入 VOD 完成：成功 ${successCount} 个，失败 ${failCount} 个。`)
  }

  const syncUploadJobs = async () => {
    if (apiBusy) return
    if (!vodConfigured) {
      setApiNotice('未配置火山 VOD AK/SK，无法查询上传任务。')
      return
    }
    const pendingJobs = jobs.filter((job) => job.uploadJobId && !job.vid)
    if (!pendingJobs.length) {
      setApiNotice('没有待查询 Vid 的 URL 上传任务。')
      return
    }

    setApiBusy(true)
    let foundCount = 0
    let pendingCount = 0
    let failCount = 0
    for (const job of pendingJobs) {
      try {
        const result = await queryUploadTask(job.uploadJobId!)
        if (!result.success) throw new Error(result.error || '查询上传任务失败')
        const info = readUploadTaskInfo(result)
        if (info.vid) foundCount += 1
        else pendingCount += 1
        setJobs((prev) =>
          patchDubbingJob(prev, job.id, {
            uploadState: info.state || job.uploadState || 'unknown',
            ...(info.vid ? { vid: info.vid } : {}),
            ...(info.sourceUrl ? { uploadSourceUrl: info.sourceUrl } : {}),
            lastSyncedAt: new Date().toISOString(),
            lastError: info.error || ''
          })
        )
      } catch (error: any) {
        failCount += 1
        setJobs((prev) =>
          patchDubbingJob(prev, job.id, {
            lastError: error?.message || String(error)
          })
        )
      }
    }
    setApiBusy(false)
    setApiNotice(`Vid 查询完成：已回填 ${foundCount} 个，处理中 ${pendingCount} 个，失败 ${failCount} 个。`)
  }

  const syncAllProjects = async () => {
    if (apiBusy) return
    if (!vodConfigured) {
      setApiNotice('未配置火山 VOD AK/SK，无法同步项目状态。')
      return
    }
    const syncableJobs = jobs.filter((job) => job.projectId)
    if (!syncableJobs.length) {
      setApiNotice('没有可同步的 VOD ProjectId。')
      return
    }

    setApiBusy(true)
    let successCount = 0
    let failCount = 0
    for (const job of syncableJobs) {
      try {
        const result = await getDubbingProject(spaceName, job.projectId!)
        if (!result.success) throw new Error(result.error || '火山 VOD 请求失败')
        const outputUrl = readProjectOutputUrl(result)
        successCount += 1
        setJobs((prev) =>
          patchDubbingJob(prev, job.id, {
            status: mapVodProjectStatus(readProjectStatus(result), job.status),
            ...(outputUrl ? { outputUrl } : {}),
            lastSyncedAt: new Date().toISOString(),
            lastError: ''
          })
        )
      } catch (error: any) {
        failCount += 1
        setJobs((prev) =>
          patchDubbingJob(prev, job.id, {
            lastError: error?.message || String(error)
          })
        )
      }
    }
    setApiBusy(false)
    setApiNotice(`同步完成：成功 ${successCount} 个，失败 ${failCount} 个。`)
  }

  const ensurePublicVideoUrl = async (value: string) => {
    const source = String(value || '').trim()
    if (!source) throw new Error('缺少源视频地址')
    if (/^https?:\/\//i.test(source)) return source

    const uploadableLocal =
      source.startsWith('xinghe://local') || source.startsWith('file://') || /^[a-zA-Z]:[\\/]/.test(source)
    if (!uploadableLocal) {
      throw new Error('源视频不是公网 URL。请使用本地文件或 HTTP/HTTPS 直链。')
    }

    if (!window.api?.ossAPI?.uploadFile) {
      throw new Error('当前环境不支持中转上传到 OSS。')
    }
    setApiNotice('正在把本地视频中转上传到 OSS，随后提交 VOD 拉取...')
    const uploadResult = await window.api.ossAPI.uploadFile(source)
    if (!uploadResult?.success || !uploadResult.url) {
      throw new Error(uploadResult?.error || 'OSS 中转上传失败')
    }
    return uploadResult.url
  }

  return (
    <div className="h-full overflow-hidden bg-[var(--bg-panel)] text-white">
      <div className="flex h-full flex-col">
        <header className="border-b border-white/10 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-lg font-semibold text-white">
                <Languages size={20} />
                海外译制
              </div>
              <div className="mt-1 text-xs text-white/56">
                VOD 声影智译任务、字幕校对、音色复核、成片导出和素材回流
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openVodSettings}
                className="inline-flex items-center gap-2 rounded-md border border-white/12 bg-white/[0.06] px-3 py-2 text-xs text-white/78 transition hover:bg-white/[0.1]"
              >
                <Settings size={15} />
                配置接入
              </button>
              <button
                type="button"
                onClick={() => void submitRunnableJobs()}
                disabled={apiBusy}
                className="inline-flex items-center gap-2 rounded-md border border-white/12 bg-white/[0.06] px-3 py-2 text-xs text-white/78 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Play size={15} />
                批量提交
              </button>
              <button
                type="button"
                onClick={() => void uploadPendingSources()}
                disabled={apiBusy}
                className="inline-flex items-center gap-2 rounded-md border border-white/12 bg-white/[0.06] px-3 py-2 text-xs text-white/78 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Upload size={15} />
                批量入VOD
              </button>
              <button
                type="button"
                onClick={() => void syncUploadJobs()}
                disabled={apiBusy}
                className="inline-flex items-center gap-2 rounded-md border border-white/12 bg-white/[0.06] px-3 py-2 text-xs text-white/78 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RotateCw size={15} />
                同步Vid
              </button>
              <button
                type="button"
                onClick={() => void syncAllProjects()}
                disabled={apiBusy}
                className="inline-flex items-center gap-2 rounded-md border border-white/12 bg-white/[0.06] px-3 py-2 text-xs text-white/78 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RotateCw size={15} />
                全部同步
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-md border border-white/12 bg-white/[0.06] px-3 py-2 text-xs text-white/78 transition hover:bg-white/[0.1]"
              >
                <Boxes size={15} />
                术语库
              </button>
              <button
                type="button"
                onClick={createMockJob}
                className="inline-flex items-center gap-2 rounded-md bg-cyan-500 px-3 py-2 text-xs font-medium text-white transition hover:bg-cyan-400"
              >
                <Upload size={15} />
                加入批量
              </button>
            </div>
          </div>
        </header>

        <main className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)_360px] gap-0">
          <aside className="min-h-0 border-r border-white/10 bg-black/12 p-4">
            <div className="grid grid-cols-2 gap-2">
              <Metric label="任务" value={summary.total} />
              <Metric label="待校对" value={summary.review} />
              <Metric label="可导出" value={summary.ready} />
              <Metric label="已回流" value={summary.returned} />
            </div>

            <section className="mt-4 space-y-3">
              <Field label="VOD 空间">
                <input
                  value={spaceName}
                  onChange={(event) => setSpaceName(event.target.value)}
                  className="w-full rounded-md border border-white/12 bg-black/24 px-3 py-2 text-xs text-white outline-none"
                  placeholder="SpaceName"
                />
              </Field>

              <Field label="片源 Vid">
                <input
                  value={sourceVid}
                  onChange={(event) => setSourceVid(event.target.value)}
                  className="w-full rounded-md border border-white/12 bg-black/24 px-3 py-2 text-xs text-white outline-none"
                  placeholder="从火山 VOD 或批量生产板复制 Vid"
                />
              </Field>

              <div className="grid grid-cols-[minmax(0,1fr)_76px] gap-2">
                <Field label="任务标题">
                  <input
                    value={sourceTitle}
                    onChange={(event) => setSourceTitle(event.target.value)}
                    className="w-full rounded-md border border-white/12 bg-black/24 px-3 py-2 text-xs text-white outline-none"
                    placeholder="可选"
                  />
                </Field>
                <Field label="时长">
                  <input
                    value={sourceDuration}
                    onChange={(event) => setSourceDuration(event.target.value)}
                    className="w-full rounded-md border border-white/12 bg-black/24 px-2 py-2 text-xs text-white outline-none"
                    placeholder="02:40"
                  />
                </Field>
              </div>

              <Field label="目标语言">
                <select
                  value={targetLanguage}
                  onChange={(event) => setTargetLanguage(event.target.value)}
                  className="w-full rounded-md border border-white/12 bg-black/24 px-3 py-2 text-xs text-white outline-none"
                >
                  {TARGET_LANGUAGES.map((language) => (
                    <option key={language}>{language}</option>
                  ))}
                </select>
              </Field>

              <Field label="工作流">
                <div className="grid grid-cols-2 gap-2">
                  <SegmentButton
                    active={workflow === 'staged'}
                    label="分阶段"
                    onClick={() => setWorkflow('staged')}
                  />
                  <SegmentButton
                    active={workflow === 'direct'}
                    label="一把跑完"
                    onClick={() => setWorkflow('direct')}
                  />
                </div>
              </Field>

              <Field label="字幕来源">
                <div className="grid grid-cols-3 gap-2">
                  {['ASR', 'OCR', '字幕文件'].map((item) => (
                    <SegmentButton
                      key={item}
                      active={subtitleSource === item}
                      label={item}
                      onClick={() => setSubtitleSource(item)}
                    />
                  ))}
                </div>
              </Field>

              <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.04] p-3">
                <Toggle checked label="字幕翻译" locked />
                <Toggle checked={enableVoice} label="语音翻译" onChange={setEnableVoice} />
                <Toggle checked={enableFace} label="口型/面容" onChange={setEnableFace} />
                <Toggle checked={enableHardSub} label="硬字幕" onChange={setEnableHardSub} />
                <Toggle
                  checked={eraseOriginalSub}
                  label="擦除原字幕"
                  onChange={setEraseOriginalSub}
                />
              </div>

              {apiNotice && (
                <div className="rounded-lg border border-amber-300/18 bg-amber-300/8 p-3 text-xs leading-5 text-amber-50/72">
                  {apiNotice}
                </div>
              )}
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3 text-xs leading-5 text-white/50">
                VOD 接入：{vodConfigured ? '已配置' : '未配置'}
                {vodSource ? ` · ${vodSource === 'settings' ? '设置' : '环境变量'}` : ''}
              </div>
            </section>
          </aside>

          <section className="min-h-0 overflow-hidden p-5">
            <div className="grid grid-cols-6 gap-2">
              {PIPELINE_STEPS.map((step, index) => {
                const Icon = step.icon
                return (
                  <div
                    key={step.id}
                    className="rounded-lg border border-white/10 bg-white/[0.045] px-3 py-3"
                  >
                    <div className="flex items-center justify-between text-white/76">
                      <Icon size={16} />
                      <span className="text-[11px] text-white/38">{index + 1}</span>
                    </div>
                    <div className="mt-3 text-xs font-medium text-white/86">{step.label}</div>
                  </div>
                )
              })}
            </div>

            <div className="mt-5 min-h-0 rounded-lg border border-white/10 bg-black/14">
              <div className="grid grid-cols-[minmax(220px,1.4fr)_110px_100px_130px_110px_130px] border-b border-white/10 px-4 py-3 text-[11px] uppercase tracking-wide text-white/42">
                <span>片源 / Vid</span>
                <span>语言</span>
                <span>时长</span>
                <span>方式</span>
                <span>状态</span>
                <span>更新时间</span>
              </div>
              <div className="max-h-[calc(100vh-360px)] overflow-auto">
                {jobs.map((job) => {
                  const meta = STATUS_META[job.status]
                  return (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => setSelectedJobId(job.id)}
                      className={`grid w-full grid-cols-[minmax(220px,1.4fr)_110px_100px_130px_110px_130px] items-center border-b border-white/8 px-4 py-3 text-left text-xs transition ${
                        selectedJobId === job.id ? 'bg-cyan-300/8' : 'hover:bg-white/[0.04]'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-white/88">{job.title}</span>
                        <span className="mt-1 block truncate text-white/42">
                          {job.vid || job.uploadJobId || job.sourceUrl || '待上传到 VOD'}
                        </span>
                      </span>
                      <span className="text-white/68">
                        {job.sourceLanguage}
                        <ArrowRight className="mx-1 inline" size={12} />
                        {job.targetLanguage}
                      </span>
                      <span className="text-white/62">{job.duration}</span>
                      <span className="text-white/62">{job.scope.join(' / ')}</span>
                      <span
                        className={`w-fit rounded-full border px-2 py-1 text-[11px] ${meta.tone}`}
                      >
                        {meta.label}
                      </span>
                      <span className="text-white/46">{job.updatedAt}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </section>

          <aside className="min-h-0 border-l border-white/10 bg-black/12 p-4">
            {selectedJob && (
              <div className="flex h-full flex-col">
                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-cyan-300/14 text-cyan-100">
                      <FileVideo size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white/90">
                        {selectedJob.title}
                      </div>
                    <div className="mt-1 text-xs text-white/46">{selectedJob.vid}</div>
                    {!selectedJob.vid && selectedJob.sourceUrl && (
                      <div className="mt-1 truncate text-xs text-amber-100/70">
                        源视频：{selectedJob.sourceUrl}
                      </div>
                    )}
                  </div>
                </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <Detail label="工作流" value={selectedJob.workflow === 'staged' ? '分阶段' : '一把跑完'} />
                    <Detail label="目标" value={selectedJob.targetLanguage} />
                    <Detail label="时长" value={selectedJob.duration} />
                    <Detail label="范围" value={selectedJob.scope.join(' / ')} />
                    <Detail label="字幕来源" value={selectedJob.subtitleSource} />
                    <Detail label="输出字幕" value={selectedJob.hardSubtitle ? '硬字幕' : '外挂字幕'} />
                    <Detail label="来源" value={selectedJob.sourcePanel || '手动入池'} />
                  </div>

                  {selectedJob.projectId && (
                    <div className="mt-3 rounded-md bg-black/18 p-2 text-xs">
                      <div className="text-[11px] text-white/38">ProjectId</div>
                      <div className="mt-1 truncate text-white/76">{selectedJob.projectId}</div>
                    </div>
                  )}
                  {selectedJob.uploadJobId && (
                    <div className="mt-3 rounded-md bg-black/18 p-2 text-xs">
                      <div className="text-[11px] text-white/38">URL 上传任务</div>
                      <div className="mt-1 truncate text-white/76">{selectedJob.uploadJobId}</div>
                      <div className="mt-1 text-white/42">
                        状态：{selectedJob.uploadState || 'submitted'}
                      </div>
                    </div>
                  )}
                  <div className="mt-3 rounded-md bg-black/18 p-2 text-xs">
                    <div className="text-[11px] text-white/38">火山 VOD Vid</div>
                    <input
                      value={selectedJob.vid}
                      onChange={(event) => patchSelectedJob({ vid: event.target.value.trim() })}
                      className="mt-1 w-full rounded border border-white/10 bg-black/22 px-2 py-1 text-white/76 outline-none"
                      placeholder="上传到 VOD 后填写 Vid"
                    />
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <ActionButton
                    icon={Play}
                    label="提交 VOD 任务"
                    disabled={selectedJob.status !== 'queued'}
                    busy={apiBusy}
                    onClick={() => void runVodAction('submit')}
                  />
                  <ActionButton
                    icon={Upload}
                    label="上传源视频到 VOD"
                    disabled={!selectedJob.sourceUrl || Boolean(selectedJob.vid)}
                    busy={apiBusy}
                    onClick={() => void runVodAction('upload-url')}
                  />
                  <ActionButton
                    icon={RotateCw}
                    label="查询上传 Vid"
                    disabled={!selectedJob.uploadJobId || Boolean(selectedJob.vid)}
                    busy={apiBusy}
                    onClick={() => void runVodAction('query-upload')}
                  />
                  <ActionButton
                    icon={RotateCw}
                    label="同步项目状态"
                    disabled={!selectedJob.projectId || selectedJob.status === 'queued'}
                    busy={apiBusy}
                    onClick={() => void runVodAction('inspect')}
                  />
                  <ActionButton
                    icon={Captions}
                    label="进入字幕校对"
                    disabled={selectedJob.status !== 'submitted'}
                    busy={apiBusy}
                    onClick={() => void runVodAction('inspect')}
                  />
                  <ActionButton
                    icon={Captions}
                    label={reviewOpen ? '收起字幕校对' : '打开字幕校对'}
                    disabled={selectedJob.status !== 'subtitleReview'}
                    busy={apiBusy}
                    onClick={() => setReviewOpen((prev) => !prev)}
                  />
                  <ActionButton
                    icon={Mic2}
                    label="确认字幕和音色"
                    disabled={selectedJob.status !== 'subtitleReview'}
                    busy={apiBusy}
                    onClick={() => void runVodAction('continue')}
                  />
                  <ActionButton
                    icon={RotateCw}
                    label="刷新导出成片"
                    disabled={selectedJob.status !== 'rendering'}
                    busy={apiBusy}
                    onClick={() => void runVodAction('refresh')}
                  />
                  <ActionButton
                    icon={CheckCircle2}
                    label="回流素材库"
                    disabled={selectedJob.status !== 'exportReady'}
                    busy={apiBusy}
                    onClick={() => void runVodAction('return')}
                  />
                </div>

                {selectedJob.lastError && (
                  <div className="mt-4 rounded-lg border border-red-300/20 bg-red-300/8 p-3 text-xs leading-5 text-red-50/72">
                    {selectedJob.lastError}
                  </div>
                )}

                {reviewOpen && selectedJob.status === 'subtitleReview' && (
                  <SubtitleReviewEditor
                    utterances={
                      selectedJob.utterances?.length
                        ? selectedJob.utterances
                        : createFallbackUtterances(selectedJob)
                    }
                    busy={apiBusy}
                    onChange={updateSelectedUtterance}
                    onSave={() => void saveSubtitleReview()}
                  />
                )}

                <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.04] p-4">
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-white/80">
                    <Wand2 size={15} />
                    产物清单
                  </div>
                  <ul className="space-y-2 text-xs text-white/60">
                    <li>双语字幕 SRT / WebVTT</li>
                    <li>目标语言配音轨</li>
                    <li>{selectedJob.scope.includes('口型') ? '口型同步译制视频' : '译制成片'}</li>
                    <li>{selectedJob.eraseOriginalSubtitle ? '原字幕擦除版本' : '保留原画版本'}</li>
                    <li className="truncate">
                      {selectedJob.outputUrl ? `产物地址：${selectedJob.outputUrl}` : '等待产物地址'}
                    </li>
                  </ul>
                </div>

                <div className="mt-auto rounded-lg border border-amber-300/20 bg-amber-300/8 p-3 text-xs leading-5 text-amber-50/72">
                  火山 OpenAPI 需要在主进程签名调用；渲染层只发任务配置，不保存 AK/SK。
                </div>
              </div>
            )}
          </aside>
        </main>
      </div>
    </div>
  )
}

function SubtitleReviewEditor({
  utterances,
  busy,
  onChange,
  onSave
}: {
  utterances: DubbingUtterance[]
  busy: boolean
  onChange: (utteranceId: string, patch: Partial<DubbingUtterance>) => void
  onSave: () => void
}) {
  return (
    <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/8 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-50/86">
          <Captions size={15} />
          字幕校对
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          className="rounded-md bg-amber-300 px-3 py-1.5 text-xs font-medium text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? '保存中' : '保存字幕'}
        </button>
      </div>

      <div className="max-h-[260px] space-y-2 overflow-auto pr-1">
        {utterances.map((utterance) => (
          <div key={utterance.id} className="rounded-md border border-white/10 bg-black/18 p-2">
            <div className="mb-2 grid grid-cols-[1fr_1fr_92px] gap-2">
              <input
                value={utterance.startTime}
                onChange={(event) => onChange(utterance.id, { startTime: event.target.value })}
                className="rounded border border-white/10 bg-black/22 px-2 py-1 text-[11px] text-white/68 outline-none"
                placeholder="Start"
              />
              <input
                value={utterance.endTime}
                onChange={(event) => onChange(utterance.id, { endTime: event.target.value })}
                className="rounded border border-white/10 bg-black/22 px-2 py-1 text-[11px] text-white/68 outline-none"
                placeholder="End"
              />
              <select
                value={utterance.voiceMode || 'translated'}
                onChange={(event) =>
                  onChange(utterance.id, {
                    voiceMode: event.target.value as DubbingUtterance['voiceMode']
                  })
                }
                className="rounded border border-white/10 bg-black/22 px-2 py-1 text-[11px] text-white/68 outline-none"
              >
                <option value="translated">译配</option>
                <option value="original">原声</option>
                <option value="mute">静音</option>
              </select>
            </div>
            <input
              value={utterance.speaker}
              onChange={(event) => onChange(utterance.id, { speaker: event.target.value })}
              className="mb-2 w-full rounded border border-white/10 bg-black/22 px-2 py-1 text-[11px] text-white/68 outline-none"
              placeholder="Speaker"
            />
            <textarea
              value={utterance.sourceText}
              onChange={(event) => onChange(utterance.id, { sourceText: event.target.value })}
              className="mb-2 min-h-12 w-full resize-none rounded border border-white/10 bg-black/22 px-2 py-1 text-xs leading-5 text-white/62 outline-none"
              placeholder="源字幕"
            />
            <textarea
              value={utterance.targetText}
              onChange={(event) => onChange(utterance.id, { targetText: event.target.value })}
              className="min-h-14 w-full resize-none rounded border border-amber-200/20 bg-black/24 px-2 py-1 text-xs leading-5 text-white/86 outline-none"
              placeholder="译文"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function languageToCode(language: string) {
  const map: Record<string, string> = {
    中文: 'zh',
    英语: 'en',
    日语: 'ja',
    韩语: 'ko',
    西班牙语: 'es',
    葡萄牙语: 'pt',
    泰语: 'th',
    越南语: 'vi',
    法语: 'fr',
    德语: 'de',
    俄语: 'ru',
    阿拉伯语: 'ar',
    印尼语: 'id',
    意大利语: 'it',
    土耳其语: 'tr'
  }
  return map[language] || 'en'
}

function inferFileExtension(value: string) {
  const clean = String(value || '').split('?')[0]
  const match = clean.match(/\.([a-z0-9]{2,8})$/i)
  if (!match) return '.mp4'
  return `.${match[1].toLowerCase()}`
}

function getTranslationTypesForJob(job: Pick<DubbingJob, 'scope'>): TranslationType[] {
  const translationTypes: TranslationType[] = ['SubtitleTranslation']
  if (job.scope.includes('语音')) translationTypes.push('VoiceTranslation')
  if (job.scope.includes('口型')) translationTypes.push('FacialTranslation')
  return translationTypes
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
      <div className="text-[11px] text-white/42">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white/90">{value}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-white/62">{label}</span>
      {children}
    </label>
  )
}

function SegmentButton({
  active,
  label,
  onClick
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-2 text-xs transition ${
        active
          ? 'border-cyan-300/40 bg-cyan-300/14 text-cyan-50'
          : 'border-white/10 bg-white/[0.04] text-white/56 hover:bg-white/[0.08]'
      }`}
    >
      {label}
    </button>
  )
}

function Toggle({
  checked,
  label,
  locked,
  onChange
}: {
  checked: boolean
  label: string
  locked?: boolean
  onChange?: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs text-white/70">
      <span>{label}</span>
      <button
        type="button"
        disabled={locked}
        onClick={() => onChange?.(!checked)}
        className={`relative h-5 w-9 rounded-full border transition ${
          checked ? 'border-cyan-300/30 bg-cyan-400/75' : 'border-white/12 bg-white/12'
        } ${locked ? 'cursor-not-allowed opacity-80' : ''}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
            checked ? 'left-4' : 'left-0.5'
          }`}
        />
      </button>
    </label>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-black/18 p-2">
      <div className="text-[11px] text-white/38">{label}</div>
      <div className="mt-1 truncate text-white/76">{value}</div>
    </div>
  )
}

function ActionButton({
  icon: Icon,
  label,
  disabled,
  busy,
  onClick
}: {
  icon: LucideIcon
  label: string
  disabled?: boolean
  busy?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md border border-white/10 bg-white/[0.055] px-3 py-2 text-xs text-white/76 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon size={15} />
      {busy ? '处理中...' : label}
    </button>
  )
}
