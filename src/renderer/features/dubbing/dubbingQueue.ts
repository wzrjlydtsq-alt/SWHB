export type DubbingStatus =
  | 'queued'
  | 'submitted'
  | 'subtitleReview'
  | 'rendering'
  | 'exportReady'
  | 'returned'

export type DubbingJob = {
  id: string
  title: string
  vid: string
  duration: string
  sourceUrl?: string
  sourcePanel?: string
  sourceRowId?: string
  uploadJobId?: string
  uploadState?: string
  uploadSourceUrl?: string
  sourceLanguage: string
  targetLanguage: string
  workflow: 'direct' | 'staged'
  scope: string[]
  subtitleSource: string
  hardSubtitle: boolean
  eraseOriginalSubtitle: boolean
  status: DubbingStatus
  updatedAt: string
  projectId?: string
  outputUrl?: string
  lastSyncedAt?: string
  returnedAssetId?: string
  lastError?: string
  utterances?: DubbingUtterance[]
}

export type DubbingUtterance = {
  id: string
  startTime: string
  endTime: string
  speaker: string
  sourceText: string
  targetText: string
  voiceMode?: 'translated' | 'original' | 'mute'
}

const STORAGE_KEY = 'xinghe_overseas_dubbing_queue'

export const DEMO_DUBBING_JOBS: DubbingJob[] = [
  {
    id: 'dub-001',
    title: '第五段1.1.mp4',
    vid: 'v0cc-dub-5th-001',
    duration: '03:42',
    sourceLanguage: '中文',
    targetLanguage: '英语',
    workflow: 'staged',
    scope: ['字幕', '语音', '口型'],
    subtitleSource: 'ASR',
    hardSubtitle: true,
    eraseOriginalSubtitle: false,
    status: 'subtitleReview',
    updatedAt: '19:10',
    utterances: [
      {
        id: 'utt-001',
        startTime: '00:00:01.200',
        endTime: '00:00:03.800',
        speaker: 'Speaker 1',
        sourceText: '我们现在必须把这件事说清楚。',
        targetText: 'We need to make this clear right now.',
        voiceMode: 'translated'
      },
      {
        id: 'utt-002',
        startTime: '00:00:04.100',
        endTime: '00:00:06.400',
        speaker: 'Speaker 2',
        sourceText: '我只给你最后一次机会。',
        targetText: 'I am giving you one last chance.',
        voiceMode: 'translated'
      }
    ]
  },
  {
    id: 'dub-002',
    title: '翻译测试用.mp4',
    vid: 'v0cc-dub-test-002',
    duration: '01:18',
    sourceLanguage: '中文',
    targetLanguage: '日语',
    workflow: 'direct',
    scope: ['字幕', '语音'],
    subtitleSource: 'ASR',
    hardSubtitle: true,
    eraseOriginalSubtitle: false,
    status: 'exportReady',
    updatedAt: '18:47',
    outputUrl: 'vod://v0cc-dub-test-002/translated'
  },
  {
    id: 'dub-003',
    title: '短剧冲突场-03.mp4',
    vid: 'v0cc-dub-drama-003',
    duration: '07:56',
    sourceLanguage: '中文',
    targetLanguage: '西班牙语',
    workflow: 'staged',
    scope: ['字幕', '语音', '口型'],
    subtitleSource: 'ASR',
    hardSubtitle: true,
    eraseOriginalSubtitle: false,
    status: 'submitted',
    updatedAt: '17:32'
  }
]

export function formatDubbingTime(date = new Date()) {
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

function normalizeJob(input: Partial<DubbingJob> | null): DubbingJob | null {
  if (!input || typeof input !== 'object') return null
  if (!input.id || !input.title) return null

  return {
    id: String(input.id),
    title: String(input.title),
    vid: String(input.vid || ''),
    duration: input.duration || '--:--',
    ...(input.sourceUrl ? { sourceUrl: String(input.sourceUrl) } : {}),
    ...(input.sourcePanel ? { sourcePanel: String(input.sourcePanel) } : {}),
    ...(input.sourceRowId ? { sourceRowId: String(input.sourceRowId) } : {}),
    ...(input.uploadJobId ? { uploadJobId: String(input.uploadJobId) } : {}),
    ...(input.uploadState ? { uploadState: String(input.uploadState) } : {}),
    ...(input.uploadSourceUrl ? { uploadSourceUrl: String(input.uploadSourceUrl) } : {}),
    sourceLanguage: input.sourceLanguage || '中文',
    targetLanguage: input.targetLanguage || '英语',
    workflow: input.workflow === 'direct' ? 'direct' : 'staged',
    scope: Array.isArray(input.scope) && input.scope.length ? input.scope : ['字幕'],
    subtitleSource: input.subtitleSource || 'ASR',
    hardSubtitle: input.hardSubtitle !== false,
    eraseOriginalSubtitle: Boolean(input.eraseOriginalSubtitle),
    status: normalizeStatus(input.status),
    updatedAt: input.updatedAt || formatDubbingTime(),
    ...(input.projectId ? { projectId: String(input.projectId) } : {}),
    ...(input.outputUrl ? { outputUrl: String(input.outputUrl) } : {}),
    ...(input.lastSyncedAt ? { lastSyncedAt: String(input.lastSyncedAt) } : {}),
    ...(input.returnedAssetId ? { returnedAssetId: String(input.returnedAssetId) } : {}),
    ...(input.lastError ? { lastError: String(input.lastError) } : {}),
    ...(Array.isArray(input.utterances)
      ? { utterances: input.utterances.map(normalizeUtterance).filter(Boolean) as DubbingUtterance[] }
      : {})
  }
}

function normalizeUtterance(input: Partial<DubbingUtterance> | null): DubbingUtterance | null {
  if (!input || typeof input !== 'object') return null
  return {
    id: String(input.id || `utt-${Date.now().toString(36)}`),
    startTime: String(input.startTime || ''),
    endTime: String(input.endTime || ''),
    speaker: String(input.speaker || 'Speaker 1'),
    sourceText: String(input.sourceText || ''),
    targetText: String(input.targetText || ''),
    voiceMode:
      input.voiceMode === 'original' || input.voiceMode === 'mute' ? input.voiceMode : 'translated'
  }
}

export function createFallbackUtterances(job: DubbingJob): DubbingUtterance[] {
  return [
    {
      id: `${job.id}-utt-1`,
      startTime: '00:00:00.000',
      endTime: '00:00:03.000',
      speaker: 'Speaker 1',
      sourceText: '待同步源字幕',
      targetText: `${job.targetLanguage}译文待校对`,
      voiceMode: 'translated'
    }
  ]
}

function normalizeStatus(status: unknown): DubbingStatus {
  if (
    status === 'queued' ||
    status === 'submitted' ||
    status === 'subtitleReview' ||
    status === 'rendering' ||
    status === 'exportReady' ||
    status === 'returned'
  ) {
    return status
  }
  return 'queued'
}

export function loadDubbingQueue() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEMO_DUBBING_JOBS
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEMO_DUBBING_JOBS
    const jobs = parsed.map(normalizeJob).filter(Boolean) as DubbingJob[]
    return jobs.length ? jobs : DEMO_DUBBING_JOBS
  } catch {
    return DEMO_DUBBING_JOBS
  }
}

export function saveDubbingQueue(jobs: DubbingJob[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs))
  } catch {
    // Keeping the queue in memory is still usable when storage is unavailable.
  }
}

export function createDubbingJob({
  index,
  title,
  vid,
  duration,
  sourceUrl,
  sourcePanel,
  sourceRowId,
  targetLanguage,
  workflow,
  subtitleSource,
  enableVoice,
  enableFace,
  hardSubtitle,
  eraseOriginalSubtitle
}: {
  index: number
  title?: string
  vid?: string
  duration?: string
  sourceUrl?: string
  sourcePanel?: string
  sourceRowId?: string
  targetLanguage: string
  workflow: 'direct' | 'staged'
  subtitleSource: string
  enableVoice: boolean
  enableFace: boolean
  hardSubtitle: boolean
  eraseOriginalSubtitle: boolean
}): DubbingJob {
  const nextId = `dub-${String(index).padStart(3, '0')}`
  const scope = ['字幕']
  if (enableVoice) scope.push('语音')
  if (enableFace) scope.push('口型')

  return {
    id: nextId,
    title: title?.trim() || `海外译制_${index}.mp4`,
    vid: vid?.trim() || (sourceUrl ? '' : `v0cc-dub-${Date.now().toString(36)}`),
    duration: duration?.trim() || '02:40',
    ...(sourceUrl ? { sourceUrl: sourceUrl.trim() } : {}),
    ...(sourcePanel ? { sourcePanel } : {}),
    ...(sourceRowId ? { sourceRowId } : {}),
    sourceLanguage: '中文',
    targetLanguage,
    workflow,
    scope,
    subtitleSource,
    hardSubtitle,
    eraseOriginalSubtitle,
    status: 'queued',
    updatedAt: formatDubbingTime()
  }
}

export function enqueueDubbingJob(
  payload: Omit<Parameters<typeof createDubbingJob>[0], 'index'>
) {
  const jobs = loadDubbingQueue()
  const nextJob = createDubbingJob({
    ...payload,
    index: jobs.length + 1
  })
  saveDubbingQueue([nextJob, ...jobs])
  return nextJob
}

export function getNextDubbingStatus(status: DubbingStatus): DubbingStatus {
  if (status === 'queued') return 'submitted'
  if (status === 'submitted') return 'subtitleReview'
  if (status === 'subtitleReview') return 'rendering'
  if (status === 'rendering') return 'exportReady'
  if (status === 'exportReady') return 'returned'
  return 'returned'
}

export function patchDubbingJob(
  jobs: DubbingJob[],
  id: string,
  patch: Partial<DubbingJob>
) {
  return jobs.map((job) =>
    job.id === id
      ? {
          ...job,
          ...patch,
          updatedAt: formatDubbingTime()
        }
      : job
  )
}

export function mapVodProjectStatus(rawStatus: unknown, fallback: DubbingStatus): DubbingStatus {
  const value = String(rawStatus || '').toLowerCase()
  if (!value) return fallback

  if (/(failed|fail|error|cancel|reject)/.test(value)) return fallback
  if (/(subtitle.*review|review|suspend|pause|waiting|manual|audit)/.test(value)) {
    return 'subtitleReview'
  }
  if (/(success|complete|completed|finished|done|exportready|export_ready)/.test(value)) {
    return 'exportReady'
  }
  if (/(render|export|running|processing|translating|submitted|queue)/.test(value)) {
    return fallback === 'queued' ? 'submitted' : 'rendering'
  }

  return fallback
}
