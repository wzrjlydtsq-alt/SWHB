import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, MutableRefObject, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  Bell,
  CheckCircle2,
  Clapperboard,
  ClipboardCheck,
  Cloud,
  Command,
  Copy,
  Database,
  ExternalLink,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  GitBranch,
  Globe2,
  HardDrive,
  Image,
  ListChecks,
  Mic,
  PanelRight,
  Paperclip,
  PackageCheck,
  Puzzle,
  RefreshCcw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Terminal,
  Trash2,
  Users,
  Video,
  Workflow,
  Wrench,
  X
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { marked } from 'marked'
import { useAppStore } from '../../store/useAppStore.ts'
import { getSettingJSON, setSettingJSON } from '../../services/dbService.ts'
import {
  createTextDocumentIndex,
  extractExcelDocumentIndex,
  extractPdfDocumentIndex,
  extractTextFromDocx,
  renderDocumentIndexPreview
} from '../../utils/parseDocument.ts'
import { canReadFileAsDataUrl } from '../../utils/fileHelpers.ts'
import type { DocumentExtractionIndex } from '../../utils/parseDocument.ts'
import { cancel_timer_task, create_timer_task, list_timer_tasks, post_github_pr_comment } from '../../utils/canvasTools.ts'
import { ProductionDesk } from '../production-desk/ProductionDesk.tsx'
import { ThumbnailImage } from '../../components/ui/ThumbnailImage.tsx'
import { VideoThumbnail } from '../../components/ui/VideoThumbnail.tsx'
import { useSpeechRecognitionInput } from '../../hooks/useSpeechRecognitionInput.ts'

interface WorkspaceHomeProps {
  chatFeatureRef?: MutableRefObject<any>
  addNode: (type: string, x: number, y: number) => void
  screenToWorld: (x: number, y: number) => { x: number; y: number }
  projects?: Array<{
    id?: string
    name?: string
    updatedAt?: string
    folderId?: string | null
    folder_id?: string | null
    [key: string]: unknown
  }>
  setProjects?: (updater: any) => void
  handleLoadFromHistory?: (
    project: any,
    setProjectListOpen?: (open: boolean) => void
  ) => void | Promise<void>
}

const WORKSPACE_FOLDERS_KEY = 'workspace_home_folders_v1'
const WORKSPACE_FILES_KEY = 'workspace_home_files_v1'
const WORKSPACE_ACCESS_POLICY_KEY = 'workspace_home_access_policy_v1'
const WORKSPACE_AUDIT_LOG_KEY = 'workspace_home_audit_log_v1'
const WORKSPACE_PENDING_OPS_KEY = 'workspace_home_pending_operations_v1'
const WORKSPACE_INDEX_KEY = 'workspace_home_index_v1'
const WORKSPACE_TASKS_KEY = 'workspace_home_tasks_v1'
const WORKSPACE_APPROVAL_MODE_KEY = 'workspace_home_approval_mode_v1'
const WORKSPACE_BROWSER_TARGETS_KEY = 'workspace_home_browser_targets_v1'
const WORKSPACE_REVIEW_REPORTS_KEY = 'workspace_home_review_reports_v1'
const WORKSPACE_CONNECTORS_KEY = 'workspace_home_connectors_v1'
const WORKSPACE_REVIEW_PR_KEY = 'workspace_home_review_pr_v1'
const WORKSPACE_EXPORT_FILE_NAME = 'xinghe-workspace-export.json'
const ROOT_FOLDER_ID = '__root__'
const WORKSPACE_UPDATED_EVENT = 'workspace-home-projects-updated'
const TEXT_ATTACHMENT_CONTEXT_LIMIT = 2400

function getSpeechInputTitle(speech: { supported: boolean; error: string; isListening: boolean; isProcessing?: boolean }) {
  if (!speech.supported) return '\u5f53\u524d\u73af\u5883\u4e0d\u652f\u6301\u8bed\u97f3\u8bc6\u522b'
  if (speech.isProcessing) return '\u6b63\u5728\u8bc6\u522b\u8bed\u97f3...'
  if (speech.isListening) return '\u6b63\u5728\u5f55\u97f3\uff0c\u518d\u70b9\u4e00\u6b21\u7ed3\u675f\u5e76\u8bc6\u522b'
  if (speech.error === 'speech-api-missing') return '\u8bf7\u5148\u5728\u6a21\u578b\u63a5\u53e3\u914d\u7f6e\u91cc\u8bbe\u7f6e\u6587\u672c\u7ec4 API Key'
  if (speech.error === 'speech-permission-denied') return '\u9ea6\u514b\u98ce\u6743\u9650\u88ab\u62d2\u7edd\uff0c\u8bf7\u5728\u7cfb\u7edf\u9690\u79c1\u8bbe\u7f6e\u91cc\u5141\u8bb8'
  if (speech.error) return '\u8bed\u97f3\u8bc6\u522b\u5931\u8d25\uff0c\u8bf7\u518d\u8bd5\u4e00\u6b21'
  return '\u70b9\u51fb\u5f00\u59cb\u8bed\u97f3\u8f93\u5165'
}

type WorkspaceCatalogItem = {
  name: string
  desc: string
  icon: LucideIcon
  detail?: string
  prompt?: string
}

type WorkspaceConnector = {
  id: string
  name: string
  description: string
  category: string
  scopes: string[]
  status?: 'available' | 'connected'
  connectedAt?: string
}

const primaryActions = [
  { id: 'new-folder', label: '新对话', icon: FolderPlus, title: '新建工作台项目' },
  { id: 'new-file', label: '添加新对话', icon: FilePlus2, title: '新建工作台文件' },
  { id: 'production-desk', label: '制片台', icon: Clapperboard, title: '打开制片生产台' },
  { id: 'plugins', label: '插件', icon: Puzzle, title: '插件中心' },
  { id: 'automation', label: '自动化', icon: Workflow, title: '自动化任务' },
  { id: 'feishu', label: '飞书直连', icon: Smartphone, title: '移动端协作' }
] as const

const productionTopicSeeds = [
  {
    id: 'research',
    name: '资料写剧本',
    skill:
      '你是剧集资料与剧本协作助手。围绕资料、世界观、分集梗概和剧本文档推进，只通过对话提出问题、整理素材、产出大纲/分集/场次/对白草稿，并把可交付内容标注清楚。'
  },
  {
    id: 'image',
    name: '生图',
    skill:
      '你是剧集图片生产助手。围绕角色、场景、道具和参考图候选推进，只通过对话整理生图需求、提示词、参考素材清单、批次计划和回收结果，不要求用户去画布操作。'
  },
  {
    id: 'storyboard',
    name: '改镜头本',
    skill:
      '你是镜头本编辑助手。围绕镜号、景别、运动、构图、节奏和镜头提示词推进，把剧本拆成可生产镜头表，并通过对话处理修改、合并、重排和版本说明。'
  },
  {
    id: 'character',
    name: '改角色卡',
    skill:
      '你是角色卡编辑助手。围绕角色设定、服装、脸部参考、性格、关系和一致性备注推进，通过对话维护角色卡版本，并指出跨镜头一致性风险。'
  },
  {
    id: 'review',
    name: '审核本子',
    skill:
      '你是剧本与生产资料审核助手。围绕剧本、镜头本、资产候选和返工意见推进，通过对话列出问题、风险、修改建议、通过/退回理由和下一步待办。'
  },
  {
    id: 'video',
    name: '等待生视频',
    skill:
      '你是视频生产排队与回收助手。围绕已通过镜头的视频生成需求推进，通过对话维护待提交、生成中、失败重试、结果验收和终版回流，不要求用户打开生产板。'
  }
] as const

type ProductionTopicId = (typeof productionTopicSeeds)[number]['id']

const workspaceConnectorSeeds: WorkspaceConnector[] = [
  {
    id: 'feishu',
    name: '飞书直连',
    description: '移动端确认、审批提醒和结果回写。',
    category: '协作',
    scopes: ['消息发送', '审批回写', '任务提醒']
  },
  {
    id: 'github',
    name: 'GitHub / GitLab',
    description: '代码托管、审查报告和 PR 评论草稿。',
    category: '代码',
    scopes: ['读取改动', '生成审查', '评论草稿']
  },
  {
    id: 'figma',
    name: 'Figma',
    description: '产品原型、组件检查和设计稿引用。',
    category: '设计',
    scopes: ['读取设计', '组件映射', '截图引用']
  },
  {
    id: 'browser',
    name: '本机浏览器',
    description: '页面检查、截图、DOM、表单和 cookies 登录态导入。',
    category: '浏览器',
    scopes: ['页面检查', '持久会话', '登录态导入'],
    status: 'connected'
  },
  {
    id: 'assets',
    name: '云素材库',
    description: '素材引用、产物回流和项目缓存归档。',
    category: '素材',
    scopes: ['素材读取', '产物归档', '缓存索引'],
    status: 'connected'
  }
]

const featuredPlugins: WorkspaceCatalogItem[] = [
  {
    name: '剧本拆条',
    desc: '从长文本、docx、分集大纲中拆出镜头、角色、场景和道具。',
    icon: FileText
  },
  {
    name: '批量生图',
    desc: '把角色、场景、道具清单直接转成生产板图片行。',
    icon: Image
  },
  {
    name: '批量生视频',
    desc: '按镜头表排队提交视频任务，支持失败重试和结果回流。',
    icon: Video
  },
  {
    name: '角色一致性',
    desc: '管理角色参考、服装、脸部参考和跨镜头一致性检查。',
    icon: Users
  },
  {
    name: '素材入库',
    desc: '把生成结果按工作台文件自动归档到云素材和本地缓存。',
    icon: Database
  },
  {
    name: '审核回流',
    desc: '把待审结果推送给负责人，审核意见回写到工作台文件。',
    icon: ClipboardCheck
  }
]

const automationItems: WorkspaceCatalogItem[] = [
  {
    name: '夜间批量生产',
    desc: '在低峰时段提交生产板队列，完成后汇总结果。',
    detail: '检查当前工作台文件、画布素材和生产板队列，规划夜间批量任务、失败重试和完成汇总。',
    prompt: '按「夜间批量生产」模板执行：检查当前工作台文件、画布素材和生产板队列，规划夜间批量任务、失败重试和完成汇总。',
    icon: Activity
  },
  {
    name: '失败任务重试',
    desc: '检测失败、超时、网关错误并按策略重试。',
    detail: '汇总失败、超时、网关错误任务，区分可重试和需人工处理项，并给出下一步操作。',
    prompt: '按「失败任务重试」模板执行：汇总失败、超时、网关错误任务，区分可重试和需人工处理项，并给出下一步操作。',
    icon: Wrench
  },
  {
    name: '飞书通知',
    desc: '关键节点完成、需要审核、任务失败时推送到飞书。',
    detail: '为当前工作台准备飞书提醒内容，包括完成节点、待审核项、失败任务和需要手机确认的动作。',
    prompt: '按「飞书通知」模板执行：为当前工作台准备飞书提醒内容，包括完成节点、待审核项、失败任务和需要手机确认的动作。',
    icon: Bell
  },
  {
    name: '缓存巡检',
    desc: '按项目扫描孤立缓存、超大文件和缺失引用。',
    detail: '扫描当前项目目录和项目缓存，列出孤立缓存、超大文件、缺失引用和建议清理方式。',
    prompt: '按「缓存巡检」模板执行：扫描当前项目目录和项目缓存，列出孤立缓存、超大文件、缺失引用和建议清理方式。',
    icon: Database
  },
  {
    name: '浏览器回归检查',
    desc: '检查本地预览或指定 URL 的布局、交互、截图、控制台和移动端表现。',
    detail: '为当前工作台创建浏览器回归检查，覆盖 URL 打开、DOM 摘要、截图证据、控制台诊断、移动端视口和关键交互。',
    prompt: '按「浏览器回归检查」模板执行：如果输入框下方已有 URL 就检查它，否则让我提供 URL；覆盖打开页面、DOM 摘要、截图证据、控制台诊断、移动端视口和关键交互。',
    icon: Globe2
  },
  {
    name: '云端同步',
    desc: '同步剧集、分配、审核状态和团队资产。',
    detail: '检查云端项目、剧集分配、审核状态和团队资产是否与当前工作台一致。',
    prompt: '按「云端同步」模板执行：检查云端项目、剧集分配、审核状态和团队资产是否与当前工作台一致。',
    icon: Cloud
  }
]

const automationTimerPresets = [
  {
    id: 'retry-30',
    name: '失败任务重试',
    desc: '每 30 分钟检查失败任务',
    intervalMinutes: 30
  },
  {
    id: 'queue-15',
    name: '生产队列巡检',
    desc: '每 15 分钟检查生产队列',
    intervalMinutes: 15
  },
  {
    id: 'cache-60',
    name: '缓存巡检',
    desc: '每 1 小时检查项目缓存',
    intervalMinutes: 60
  },
  {
    id: 'report-120',
    name: '进度汇总',
    desc: '每 2 小时汇总工作台状态',
    intervalMinutes: 120
  }
]

const slashCommands = [
  {
    label: '/review',
    desc: '审查当前工作台改动',
    prompt: '审查当前工作台相关改动，按严重程度列出问题、风险和建议，并给出可执行修复步骤。'
  },
  {
    label: '/browser',
    desc: '创建浏览器检查任务',
    prompt: '检查当前页面或我提供的 URL，关注布局、交互、加载、错误状态和移动端表现，记录问题并能修就修。'
  },
  {
    label: '/ship',
    desc: '打包前验收',
    prompt: '按发布前验收流程检查：类型、构建、关键功能、缓存边界、权限和已知风险，并输出可审查清单。'
  },
  {
    label: '/skill',
    desc: '设计一个 Skill',
    prompt: '为当前重复工作设计一个可复用 Skill：触发条件、输入、步骤、输出、失败处理和验收方式都写清楚。'
  },
  {
    label: '/fix',
    desc: '定位并修复问题',
    prompt: '定位这个问题的根因，做最小修复，说明影响范围，并运行必要验证。'
  }
]

const recommendedSkillSeeds = [
  {
    name: 'Bug 自修复',
    description: '遇到报错或异常时，先区分用户工程与软件本体问题；用户工程内可尝试最小修复，软件本体问题生成诊断报告或开发者补丁建议。',
    icon: 'fix',
    steps: [
      { tool: 'get_workspace_context', params: { includeIndex: true, includeMaterials: true, includeBrowser: true, includeReviews: true } },
      { tool: 'get_computer_access_status', params: {} },
      { tool: 'get_workspace_git_summary', params: {} }
    ]
  },
  {
    name: '浏览器验收',
    description: '检查页面状态、DOM 结构、截图证据和关键交互，并回写任务。',
    icon: 'browser',
    steps: [
      { tool: 'get_workspace_context', params: { includeBrowser: true, includeIndex: false, includeMaterials: false } },
      { tool: 'create_browser_review_task', params: { note: '检查页面状态、DOM 结构、截图证据和关键交互' } }
    ]
  },
  {
    name: '发布前检查',
    description: '执行 typecheck/build，汇总风险、安装包和验证结果。',
    icon: 'check',
    steps: [
      { tool: 'get_workspace_context', params: { includeIndex: true, includeMaterials: false, includeBrowser: false } },
      { tool: 'run_local_command', params: { command: 'npm run typecheck' } },
      { tool: 'run_local_command', params: { command: 'npm run build' } }
    ]
  },
  {
    name: '素材入库检查',
    description: '检查当前工作台素材引用、缓存边界和缺失文件。',
    icon: 'asset',
    steps: [
      { tool: 'get_workspace_context', params: { includeIndex: true, includeMaterials: true, includeBrowser: false } },
      { tool: 'get_computer_access_status', params: {} }
    ]
  }
]

type WorkspaceMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: WorkspaceAttachment[]
  elapsedMs?: number
  isError?: boolean
  toolCalls?: Array<{ name?: string; success?: boolean; error?: string }>
}

type WorkspaceAttachment = {
  id: string
  name: string
  type: string
  content?: string
  textContent?: string
  fileExt?: string
  isImage?: boolean
  isVideo?: boolean
  isAudio?: boolean
  isPDF?: boolean
  isDoc?: boolean
  isExcel?: boolean
  isCode?: boolean
  kind?: 'file' | 'folder' | 'project-directory'
  path?: string
  cachedUrl?: string
  cacheError?: string
  summary?: string
  documentIndex?: DocumentExtractionIndex
}

type WorkspaceMaterialRef = WorkspaceAttachment & {
  sourceFileId?: string
  sourceFileName?: string
  sourceFolderId?: string | null
  sourceFolderName?: string
  sourceUpdatedAt?: string
}

type WorkspaceFolder = {
  id: string
  name: string
  createdAt?: string
  updatedAt?: string
  localPath?: string | null
  accessMode?: 'scoped' | 'global'
  approvalMode?: 'request' | 'risky' | 'auto'
  allowedRoots?: string[]
  accessPermissions?: Record<string, boolean>
}

type WorkspaceFile = {
  id: string
  name: string
  folderId?: string | null
  cacheRoot?: string | null
  accessMode?: 'scoped' | 'global'
  approvalMode?: 'request' | 'risky' | 'auto'
  allowedRoots?: string[]
  accessPermissions?: Record<string, boolean>
  createdAt?: string
  updatedAt?: string
  messages?: WorkspaceMessage[]
  materialRefs?: WorkspaceAttachment[]
  productionTopicId?: ProductionTopicId
  productionSkillPrompt?: string
}

type WorkspacePendingOperation = {
  id: string
  at: string
  status?: 'pending' | 'approved' | 'rejected' | 'failed'
  operation: string
  targetPath?: string
  sourcePath?: string
  command?: string
  cwd?: string
  content?: string
  preview?: string
  append?: boolean
  overwrite?: boolean
  recursive?: boolean
  timeoutMs?: number
  result?: any
}

type WorkspaceAuditEntry = {
  id: string
  at: string
  type: string
  targetPath?: string
  sourcePath?: string
  command?: string
  success?: boolean
  error?: string
}

type WorkspaceIndexItem = {
  name: string
  path: string
  isDirectory?: boolean
  ext?: string
  size?: number
}

type WorkspaceVisibleFile = WorkspaceIndexItem & {
  kind: 'folder' | 'image' | 'video' | 'audio' | 'text' | 'other'
}

type WorkspaceTaskItem = {
  id: string
  name: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'waiting'
  channel?: 'local' | 'feishu' | 'production' | 'canvas' | 'browser' | 'review' | 'skill' | 'automation'
  detail?: string
  retryOf?: string
  retryAttempt?: number
  retryDelayMinutes?: number
  nextRetryAt?: string
  updatedAt: string
}

type WorkspaceReviewReport = {
  id: string
  cwd?: string
  status: 'done' | 'failed'
  statusText?: string
  diffStat?: string
  changedFiles?: string[]
  files?: WorkspaceReviewFile[]
  diffSnippets?: WorkspaceReviewDiffSnippet[]
  totalAdded?: number
  totalDeleted?: number
  riskLevel?: 'low' | 'medium' | 'high'
  historyDelta?: WorkspaceReviewHistoryDelta
  error?: string
  createdAt: string
}

type WorkspaceReviewFile = {
  path: string
  status?: string
  added?: number
  deleted?: number
  risk?: 'low' | 'medium' | 'high'
}

type WorkspaceReviewDiffSnippet = {
  path: string
  diff: string
  hunkCount?: number
  hunks?: WorkspaceReviewDiffHunk[]
}

type WorkspaceReviewHistoryDelta = {
  previousId?: string
  previousAt?: string
  newFiles: string[]
  resolvedFiles: string[]
  unchangedFiles: string[]
  addedDelta: number
  deletedDelta: number
}

type WorkspaceReviewDiffHunk = {
  header: string
  body: string
}

type WorkspaceBrowserTarget = {
  id: string
  url: string
  note?: string
  status: 'ready' | 'opened' | 'reviewing' | 'done' | 'failed'
  httpStatus?: number
  title?: string
  contentType?: string
  checkedAt?: string
  screenshotPath?: string
  domSummary?: string
  viewportSummary?: string
  annotationSummary?: string
  formSummary?: string
  consoleSummary?: string
  sessionId?: string
  sessionProfile?: string
  sessionPersisted?: boolean
  sessionSummary?: string
  action?: string
  finalUrl?: string
  error?: string
  fileId?: string | null
  createdAt: string
  updatedAt: string
}

const workspaceSystemPrompt =
  '后台按协同工作流处理：理解任务、盘点素材、读取本机路径、拆分生产步骤、必要时操作画布或生产板，并把结果保存回当前工作台文件。这个协同过程不需要用户手动选择。'

function parseReviewFiles(statusText = '', numStatText = ''): WorkspaceReviewFile[] {
  const statusByPath = new Map<string, string>()
  statusText
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .forEach((line) => {
      const status = line.slice(0, 2).trim() || 'M'
      const rawPath = line.slice(3).trim()
      const filePath = rawPath.includes(' -> ') ? rawPath.split(' -> ').pop() || rawPath : rawPath
      if (filePath) statusByPath.set(filePath, status)
    })

  const files = new Map<string, WorkspaceReviewFile>()
  numStatText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const [addedRaw, deletedRaw, ...pathParts] = line.split(/\s+/)
      const filePath = pathParts.join(' ')
      if (!filePath) return
      const added = addedRaw === '-' ? 0 : Number(addedRaw) || 0
      const deleted = deletedRaw === '-' ? 0 : Number(deletedRaw) || 0
      const churn = added + deleted
      const risk = churn > 300 ? 'high' : churn > 80 ? 'medium' : 'low'
      files.set(filePath, {
        path: filePath,
        status: statusByPath.get(filePath),
        added,
        deleted,
        risk
      })
    })

  statusByPath.forEach((status, filePath) => {
    if (files.has(filePath)) return
    files.set(filePath, { path: filePath, status, risk: 'low' })
  })

  return Array.from(files.values()).sort((a, b) => {
    const riskRank = { high: 0, medium: 1, low: 2 }
    const riskDelta = riskRank[a.risk || 'low'] - riskRank[b.risk || 'low']
    if (riskDelta) return riskDelta
    return (b.added || 0) + (b.deleted || 0) - ((a.added || 0) + (a.deleted || 0))
  })
}

function summarizeReviewRisk(files: WorkspaceReviewFile[]): 'low' | 'medium' | 'high' {
  if (files.some((file) => file.risk === 'high')) return 'high'
  if (files.some((file) => file.risk === 'medium') || files.length > 12) return 'medium'
  return 'low'
}

function buildReviewHistoryDelta(
  currentFiles: WorkspaceReviewFile[],
  currentAdded: number,
  currentDeleted: number,
  previous?: WorkspaceReviewReport
): WorkspaceReviewHistoryDelta | undefined {
  if (!previous?.files?.length) return undefined
  const currentPaths = new Set(currentFiles.map((file) => file.path))
  const previousPaths = new Set(previous.files.map((file) => file.path))
  const newFiles = currentFiles
    .map((file) => file.path)
    .filter((path) => !previousPaths.has(path))
    .slice(0, 20)
  const resolvedFiles = previous.files
    .map((file) => file.path)
    .filter((path) => !currentPaths.has(path))
    .slice(0, 20)
  const unchangedFiles = currentFiles
    .map((file) => file.path)
    .filter((path) => previousPaths.has(path))
    .slice(0, 20)

  return {
    previousId: previous.id,
    previousAt: previous.createdAt,
    newFiles,
    resolvedFiles,
    unchangedFiles,
    addedDelta: currentAdded - (previous.totalAdded || 0),
    deletedDelta: currentDeleted - (previous.totalDeleted || 0)
  }
}

function parseDiffHunks(diff = ''): WorkspaceReviewDiffHunk[] {
  const lines = diff.split(/\r?\n/)
  const hunks: WorkspaceReviewDiffHunk[] = []
  let current: WorkspaceReviewDiffHunk | null = null

  for (const line of lines) {
    if (line.startsWith('@@')) {
      if (current) hunks.push(current)
      current = { header: line, body: '' }
      continue
    }
    if (current) {
      current.body += `${line}\n`
    }
  }
  if (current) hunks.push(current)

  return hunks
    .map((hunk) => ({ ...hunk, body: hunk.body.trimEnd().slice(0, 4000) }))
    .filter((hunk) => hunk.header || hunk.body)
    .slice(0, 12)
}

function getHunkReviewLine(hunk: WorkspaceReviewDiffHunk) {
  const match = hunk.header.match(/\+(\d+)(?:,(\d+))?/)
  if (!match) return null
  let line = Number(match[1])
  if (!Number.isFinite(line) || line <= 0) return null
  const bodyLines = hunk.body.split(/\r?\n/)
  for (const bodyLine of bodyLines) {
    if (bodyLine.startsWith('+++') || bodyLine.startsWith('---') || bodyLine.startsWith('@@')) continue
    if (bodyLine.startsWith('+')) return line
    if (bodyLine.startsWith(' ') || bodyLine.startsWith('\\')) line += 1
  }
  return Number(match[1])
}

function buildHunkReviewDraft(path: string, hunk: WorkspaceReviewDiffHunk) {
  const lines = hunk.body.split(/\r?\n/)
  const added = lines
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .slice(0, 3)
    .map((line) => line.slice(1).trim())
    .filter(Boolean)
  const removed = lines
    .filter((line) => line.startsWith('-') && !line.startsWith('---'))
    .slice(0, 3)
    .map((line) => line.slice(1).trim())
    .filter(Boolean)
  const hint = added.length
    ? `这段新增逻辑需要确认：${added.join(' / ')}`
    : removed.length
      ? `这段删除逻辑需要确认：${removed.join(' / ')}`
      : '这段改动需要确认是否符合预期。'
  return [
    hint,
    '',
    `文件：${path}`,
    `位置：${hunk.header}`,
    '',
    '建议：请补充具体风险、影响和改法后再发送。'
  ].join('\n')
}

function quoteShellArg(value: string) {
  return `"${value.replace(/"/g, '\\"')}"`
}

function buildReviewCopyText(report: WorkspaceReviewReport) {
  const lines = [
    '# 工作台审查报告',
    '',
    `目录：${report.cwd || '未授权目录'}`,
    `时间：${new Date(report.createdAt).toLocaleString()}`,
    `风险：${formatReviewRisk(report.riskLevel)}`,
    `文件：${report.files?.length || report.changedFiles?.length || 0}`,
    `增删：+${report.totalAdded || 0} / -${report.totalDeleted || 0}`,
    ''
  ]
  if (report.files?.length) {
    lines.push('## 文件摘要')
    report.files.slice(0, 30).forEach((file) => {
      lines.push(
        `- ${formatReviewRisk(file.risk)} ${file.status || 'M'} ${file.path} (+${file.added || 0} / -${file.deleted || 0})`
      )
    })
    lines.push('')
  }
  if (report.diffStat) {
    lines.push('## Diff Stat', '```', report.diffStat.trim(), '```', '')
  }
  if (report.historyDelta) {
    lines.push('## 与上轮对比')
    if (report.historyDelta.previousAt) {
      lines.push(`上轮时间：${new Date(report.historyDelta.previousAt).toLocaleString()}`)
    }
    lines.push(
      `新增改动文件：${report.historyDelta.newFiles.length}`,
      `已消失改动文件：${report.historyDelta.resolvedFiles.length}`,
      `仍在改动文件：${report.historyDelta.unchangedFiles.length}`,
      `增删变化：${formatSignedNumber(report.historyDelta.addedDelta)} / ${formatSignedNumber(report.historyDelta.deletedDelta)}`,
      ''
    )
    if (report.historyDelta.newFiles.length) {
      lines.push('新增：', ...report.historyDelta.newFiles.map((file) => `- ${file}`), '')
    }
    if (report.historyDelta.resolvedFiles.length) {
      lines.push('已消失：', ...report.historyDelta.resolvedFiles.map((file) => `- ${file}`), '')
    }
  }
  if (report.diffSnippets?.length) {
    lines.push('## Diff 片段')
    report.diffSnippets.forEach((snippet) => {
      lines.push(`### ${snippet.path}`, '```diff', snippet.diff.trim(), '```', '')
      if (snippet.hunks?.length) {
        lines.push(`#### Hunks (${snippet.hunkCount || snippet.hunks.length})`)
        snippet.hunks.forEach((hunk, index) => {
          lines.push(`Hunk ${index + 1}: ${hunk.header}`, '```diff', hunk.body.trim(), '```', '')
        })
      }
    })
  }
  if (report.error) lines.push('## 错误', report.error)
  return lines.join('\n')
}

type FloatingPanelFrame = {
  x: number
  y: number
  width: number
  height: number
}

function clampFloatingPanelFrame(frame: FloatingPanelFrame): FloatingPanelFrame {
  if (typeof window === 'undefined') return frame
  const minWidth = 260
  const minHeight = 280
  const maxWidth = Math.max(minWidth, window.innerWidth - 24)
  const maxHeight = Math.max(minHeight, window.innerHeight - 24)
  const width = Math.min(Math.max(frame.width, minWidth), maxWidth)
  const height = Math.min(Math.max(frame.height, minHeight), maxHeight)
  return {
    width,
    height,
    x: Math.min(Math.max(frame.x, 12), Math.max(12, window.innerWidth - width - 12)),
    y: Math.min(Math.max(frame.y, 12), Math.max(12, window.innerHeight - height - 12))
  }
}

function getInitialFloatingPanelFrame(): FloatingPanelFrame {
  if (typeof window === 'undefined') return { x: 920, y: 72, width: 300, height: 520 }
  return clampFloatingPanelFrame({
    x: window.innerWidth - 372,
    y: 72,
    width: 340,
    height: Math.min(560, window.innerHeight - 120)
  })
}

export function WorkspaceHome({
  chatFeatureRef,
  addNode,
  screenToWorld
}: WorkspaceHomeProps) {
  const [draft, setDraft] = useState('')
  const [workspaceMessages, setWorkspaceMessages] = useState<WorkspaceMessage[]>([])
  const [workspaceAttachments, setWorkspaceAttachments] = useState<WorkspaceAttachment[]>([])
  const [workspaceSending, setWorkspaceSending] = useState(false)
  const [selectedChatModel, setSelectedChatModel] = useState('')
  const [planMode, setPlanMode] = useState(false)
  const [goalMode, setGoalMode] = useState(false)
  const [activeThread, setActiveThread] = useState('工作台')
  const [activePanel, setActivePanel] = useState<'overview' | 'plugins' | 'automation' | 'feishu'>(
    'overview'
  )

  useEffect(() => {
    const onFillDraft = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string }>).detail
      if (detail?.text) setDraft(detail.text)
    }
    window.addEventListener('workspace:fill-draft', onFillDraft)
    return () => window.removeEventListener('workspace:fill-draft', onFillDraft)
  }, [])

  const [folders, setFolders] = useState<WorkspaceFolder[]>(() =>
    getSettingJSON(WORKSPACE_FOLDERS_KEY, [])
  )
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>(() =>
    getSettingJSON(WORKSPACE_FILES_KEY, [])
  )
  const [activeFolderId, setActiveFolderId] = useState(ROOT_FOLDER_ID)
  const [activeWorkspaceFileId, setActiveWorkspaceFileId] = useState<string | null>(null)
  const [pendingOperations, setPendingOperations] = useState<WorkspacePendingOperation[]>(() =>
    readWorkspaceArray(WORKSPACE_PENDING_OPS_KEY)
  )
  const [auditLog, setAuditLog] = useState<WorkspaceAuditEntry[]>(() =>
    readWorkspaceArray(WORKSPACE_AUDIT_LOG_KEY)
  )
  const [workspaceIndex, setWorkspaceIndex] = useState<WorkspaceIndexItem[]>(() =>
    readWorkspaceArray(WORKSPACE_INDEX_KEY)
  )
  const [workspaceTasks, setWorkspaceTasks] = useState<WorkspaceTaskItem[]>(() =>
    readWorkspaceArray(WORKSPACE_TASKS_KEY)
  )
  const retryExecutorIdsRef = useRef<Set<string>>(new Set())
  const [browserTargets, setBrowserTargets] = useState<WorkspaceBrowserTarget[]>(() =>
    readWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY)
  )
  const [reviewReports, setReviewReports] = useState<WorkspaceReviewReport[]>(() =>
    readWorkspaceArray(WORKSPACE_REVIEW_REPORTS_KEY)
  )
  const [terminalSessions, setTerminalSessions] = useState<any[]>([])
  const [terminalInput, setTerminalInput] = useState('')
  const [indexQuery, setIndexQuery] = useState('')
  const [browserUrl, setBrowserUrl] = useState('')
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [approvalMode, setApprovalModeState] = useState<'request' | 'risky' | 'auto'>(() => {
    const stored = localStorage.getItem(WORKSPACE_APPROVAL_MODE_KEY)
    return stored === 'risky' || stored === 'auto' ? stored : 'request'
  })
  const [progressOpen, setProgressOpen] = useState(true)
  const [tasksOpen, setTasksOpen] = useState(true)
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [rightPanelMode, setRightPanelMode] = useState<'workspace' | 'production'>('workspace')
  const [rightPanelFrame, setRightPanelFrame] = useState<FloatingPanelFrame>(
    getInitialFloatingPanelFrame
  )
  const [visibleProjectFiles, setVisibleProjectFiles] = useState<WorkspaceVisibleFile[]>([])
  const [visibleProjectFilesLoading, setVisibleProjectFilesLoading] = useState(false)
  const [visibleProjectFilesError, setVisibleProjectFilesError] = useState('')
  const rightPanelDragRef = useRef<{
    mode: 'move' | 'resize'
    startX: number
    startY: number
    startFrame: FloatingPanelFrame
  } | null>(null)
  const {
    apiConfigs,
    nodes,
    productionBoardMode,
    productionBoardVideoRows,
    productionBoardImageRows,
    setActiveWorkspacePage,
    setCloudAssetsOpen,
    setSkillPanelOpen,
    setSettingsOpen
  } = useAppStore(
    useShallow((state) => ({
      apiConfigs: state.apiConfigs || [],
      nodes: state.nodes,
      productionBoardMode: state.productionBoardMode,
      productionBoardVideoRows: state.productionBoardVideoRows,
      productionBoardImageRows: state.productionBoardImageRows,
      setActiveWorkspacePage: state.setActiveWorkspacePage,
      setCloudAssetsOpen: state.setCloudAssetsOpen,
      setSkillPanelOpen: state.setSkillPanelOpen,
      setSettingsOpen: state.setSettingsOpen
    }))
  )

  const productionRows = useMemo(() => {
    if (productionBoardMode === 'image') return productionBoardImageRows?.length || 0
    return productionBoardVideoRows?.length || 0
  }, [productionBoardImageRows, productionBoardMode, productionBoardVideoRows])

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const activeDrag = rightPanelDragRef.current
      if (!activeDrag) return
      const dx = event.clientX - activeDrag.startX
      const dy = event.clientY - activeDrag.startY
      const start = activeDrag.startFrame
      if (activeDrag.mode === 'move') {
        setRightPanelFrame(
          clampFloatingPanelFrame({
            ...start,
            x: start.x + dx,
            y: start.y + dy
          })
        )
        return
      }
      setRightPanelFrame(
        clampFloatingPanelFrame({
          ...start,
          width: start.width + dx,
          height: start.height + dy
        })
      )
    }
    const onMouseUp = () => {
      rightPanelDragRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('resize', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('resize', onMouseUp)
    }
  }, [])

  const startRightPanelDrag = (mode: 'move' | 'resize', event: ReactMouseEvent) => {
    event.preventDefault()
    rightPanelDragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startFrame: rightPanelFrame
    }
    document.body.style.cursor = mode === 'move' ? 'grabbing' : 'nwse-resize'
    document.body.style.userSelect = 'none'
  }

  const chatModels = useMemo(
    () => (Array.isArray(apiConfigs) ? apiConfigs.filter((config: any) => config.type === 'Chat') : []),
    [apiConfigs]
  )

  const activeChatModel = selectedChatModel || chatFeatureRef?.current?.chatModel || chatModels[0]?.id || ''

  const activeWorkspaceFile = useMemo(
    () => workspaceFiles.find((file) => file.id === activeWorkspaceFileId) || null,
    [activeWorkspaceFileId, workspaceFiles]
  )

  const indexResults = useMemo(() => {
    const value = indexQuery.trim().toLowerCase()
    if (!value) return workspaceIndex.slice(0, 8)
    return workspaceIndex
      .filter((item) => `${item.name} ${item.path}`.toLowerCase().includes(value))
      .slice(0, 20)
  }, [indexQuery, workspaceIndex])

  useEffect(() => {
    const refreshAudit = () => setAuditLog(readWorkspaceArray(WORKSPACE_AUDIT_LOG_KEY))
    const refreshPending = () => setPendingOperations(readWorkspaceArray(WORKSPACE_PENDING_OPS_KEY))
    const refreshTasks = () => setWorkspaceTasks(readWorkspaceArray(WORKSPACE_TASKS_KEY))
    const refreshBrowserTargets = () => setBrowserTargets(readWorkspaceArray(WORKSPACE_BROWSER_TARGETS_KEY))
    const refreshReviewReports = () => setReviewReports(readWorkspaceArray(WORKSPACE_REVIEW_REPORTS_KEY))
    const refreshApprovalMode = (event: Event) => {
      const nextMode = (event as CustomEvent<string>).detail || localStorage.getItem(WORKSPACE_APPROVAL_MODE_KEY)
      if (nextMode === 'request' || nextMode === 'risky' || nextMode === 'auto') {
        setApprovalModeState(nextMode)
      }
    }
    const offTerminal = window.api?.terminalAPI?.onUpdate?.((update: any) => {
      setTerminalSessions((prev) => {
        const existing = prev.find((session) => session.id === update.id)
        if (existing) return prev.map((session) => (session.id === update.id ? { ...session, ...update } : session))
        return [{ ...update }, ...prev]
      })
    })
    window.addEventListener(`${WORKSPACE_AUDIT_LOG_KEY}:updated`, refreshAudit)
    window.addEventListener(`${WORKSPACE_PENDING_OPS_KEY}:updated`, refreshPending)
    window.addEventListener(`${WORKSPACE_TASKS_KEY}:updated`, refreshTasks)
    window.addEventListener(`${WORKSPACE_BROWSER_TARGETS_KEY}:updated`, refreshBrowserTargets)
    window.addEventListener(`${WORKSPACE_REVIEW_REPORTS_KEY}:updated`, refreshReviewReports)
    window.addEventListener('workspace-approval-mode-updated', refreshApprovalMode)
    window.api?.terminalAPI?.list?.().then((result: any) => {
      if (result?.success) setTerminalSessions(result.sessions || [])
    })
    return () => {
      window.removeEventListener(`${WORKSPACE_AUDIT_LOG_KEY}:updated`, refreshAudit)
      window.removeEventListener(`${WORKSPACE_PENDING_OPS_KEY}:updated`, refreshPending)
      window.removeEventListener(`${WORKSPACE_TASKS_KEY}:updated`, refreshTasks)
      window.removeEventListener(`${WORKSPACE_BROWSER_TARGETS_KEY}:updated`, refreshBrowserTargets)
      window.removeEventListener(`${WORKSPACE_REVIEW_REPORTS_KEY}:updated`, refreshReviewReports)
      window.removeEventListener('workspace-approval-mode-updated', refreshApprovalMode)
      offTerminal?.()
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandPaletteOpen(true)
      }
      if (event.key === 'Escape') {
        setCommandPaletteOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const projectGroups = useMemo(() => {
    const folderMap = new Map<
      string,
      WorkspaceFolder & {
        threads: Array<{ title: string; time: string; file: WorkspaceFile }>
      }
    >()
    folderMap.set(ROOT_FOLDER_ID, { id: ROOT_FOLDER_ID, name: '工作台项目', threads: [] })
    folders.forEach((folder) => folderMap.set(folder.id, { ...folder, threads: [] }))

    workspaceFiles.forEach((file) => {
      const folderId = file.folderId || ROOT_FOLDER_ID
      const group = folderMap.get(folderId as string) || folderMap.get(ROOT_FOLDER_ID)!
      group.threads.push({
        title: file.name || '未命名工作台文件',
        time: formatRelativeTime(file.updatedAt),
        file
      })
    })

    return Array.from(folderMap.values()).filter(
      (group) => group.id !== ROOT_FOLDER_ID || group.threads.length > 0 || folders.length === 0
    )
  }, [folders, workspaceFiles])

  const activeWorkspaceFolder = useMemo(() => {
    const folderId = activeWorkspaceFile?.folderId || activeFolderId || ROOT_FOLDER_ID
    return projectGroups.find((group) => group.id === folderId) || projectGroups[0] || null
  }, [activeFolderId, activeWorkspaceFile?.folderId, projectGroups])

  const visibleProjectRoot =
    activeWorkspaceFile?.cacheRoot || activeWorkspaceFolder?.localPath || ''

  const refreshVisibleProjectFiles = async () => {
    if (!visibleProjectRoot) {
      setVisibleProjectFiles([])
      setVisibleProjectFilesError('')
      return
    }
    setVisibleProjectFilesLoading(true)
    setVisibleProjectFilesError('')
    try {
      const result: any = await window.api?.fsAPI?.listDirectory?.(visibleProjectRoot)
      if (!result?.files) {
        setVisibleProjectFiles([])
        setVisibleProjectFilesError(result?.error || '目录里暂时没有可显示文件')
        return
      }
      const items = result.files
        .map((file: any) => ({
          ...file,
          kind: getWorkspaceVisibleFileKind(file)
        }))
        .sort((left: WorkspaceVisibleFile, right: WorkspaceVisibleFile) => {
          if (left.isDirectory !== right.isDirectory) return left.isDirectory ? -1 : 1
          return left.name.localeCompare(right.name, 'zh-CN')
        })
        .slice(0, 240)
      setVisibleProjectFiles(items)
    } catch (error) {
      setVisibleProjectFiles([])
      setVisibleProjectFilesError(error instanceof Error ? error.message : '读取项目目录失败')
    } finally {
      setVisibleProjectFilesLoading(false)
    }
  }

  useEffect(() => {
    void refreshVisibleProjectFiles()
  }, [visibleProjectRoot])

  const workspaceMaterialRefs = useMemo<WorkspaceMaterialRef[]>(() => {
    const folderNameById = new Map(projectGroups.map((group) => [group.id, group.name]))
    const seen = new Set<string>()
    return [...workspaceFiles]
      .sort((left, right) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime())
      .flatMap((file) => {
        const folderId = file.folderId || ROOT_FOLDER_ID
        return (file.materialRefs || []).map((material) => ({
          ...material,
          sourceFileId: file.id,
          sourceFileName: file.name || '未命名工作台文件',
          sourceFolderId: folderId,
          sourceFolderName: folderNameById.get(folderId) || '工作台项目',
          sourceUpdatedAt: file.updatedAt
        }))
      })
      .filter((material) => {
        const key = `${material.path || material.cachedUrl || material.id || material.name}:${material.sourceFileId || ''}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 80)
  }, [projectGroups, workspaceFiles])

  const publishWorkspaceAccessPolicy = (
    file?: WorkspaceFile | null,
    approvalModeOverride?: 'request' | 'risky' | 'auto'
  ) => {
    const roots = Array.from(
      new Set([file?.cacheRoot, ...(file?.allowedRoots || [])].filter(Boolean) as string[])
    )
    const nextApprovalMode = normalizeWorkspaceApprovalMode(
      approvalModeOverride || file?.approvalMode,
      approvalMode
    )
    localStorage.setItem(
      WORKSPACE_ACCESS_POLICY_KEY,
      JSON.stringify({
        activeFileId: file?.id || null,
        mode: file?.accessMode === 'global' ? 'global' : 'scoped',
        roots,
        permissions: getWorkspacePermissions(file),
        approvalMode: nextApprovalMode
      })
    )
  }

  const setApprovalMode = (mode: 'request' | 'risky' | 'auto') => {
    setApprovalModeState(mode)
    localStorage.setItem(WORKSPACE_APPROVAL_MODE_KEY, mode)
    let nextActiveFile: WorkspaceFile | null = null
    if (activeWorkspaceFileId) {
      setWorkspaceFiles((prev) => {
        const nextFiles = prev.map((file) => {
          if (file.id !== activeWorkspaceFileId) return file
          const updatedFile: WorkspaceFile = { ...file, approvalMode: mode, updatedAt: new Date().toISOString() }
          nextActiveFile = updatedFile
          return updatedFile
        })
        setSettingJSON(WORKSPACE_FILES_KEY, nextFiles)
        window.dispatchEvent(new CustomEvent(WORKSPACE_UPDATED_EVENT, { detail: { files: nextFiles } }))
        return nextFiles
      })
    }
    const currentPolicy = safeParseSetting(WORKSPACE_ACCESS_POLICY_KEY)
    localStorage.setItem(
      WORKSPACE_ACCESS_POLICY_KEY,
      JSON.stringify({
        ...(currentPolicy || {}),
        approvalMode: mode
      })
    )
    publishWorkspaceAccessPolicy(nextActiveFile || activeWorkspaceFile, mode)
  }

  const updateWorkspaceFile = (nextFile: WorkspaceFile) => {
    setWorkspaceFiles((prev) => {
      const nextFiles = prev.map((file) => (file.id === nextFile.id ? nextFile : file))
      setSettingJSON(WORKSPACE_FILES_KEY, nextFiles)
      window.dispatchEvent(new CustomEvent(WORKSPACE_UPDATED_EVENT, { detail: { files: nextFiles } }))
      return nextFiles
    })
    publishWorkspaceAccessPolicy(nextFile)
  }

  const updateWorkspaceFolder = (nextFolder: WorkspaceFolder) => {
    setFolders((prev) => {
      const nextFolders = prev.map((folder) => (folder.id === nextFolder.id ? nextFolder : folder))
      setSettingJSON(WORKSPACE_FOLDERS_KEY, nextFolders)
      window.dispatchEvent(new CustomEvent(WORKSPACE_UPDATED_EVENT, { detail: { folders: nextFolders } }))
      return nextFolders
    })
  }

  const saveActiveFolderAccessDefaults = () => {
    const storedFolder = folders.find((folder) => folder.id === activeWorkspaceFolder?.id)
    if (!storedFolder?.id) return
    const roots = activeWorkspaceFile
      ? getWorkspaceAccessRoots(activeWorkspaceFile)
      : getWorkspaceFolderDefaults(storedFolder, approvalMode).allowedRoots
    const nextFolder: WorkspaceFolder = {
      ...storedFolder,
      accessMode: activeWorkspaceFile?.accessMode === 'global' ? 'global' : 'scoped',
      approvalMode,
      allowedRoots: Array.from(new Set([storedFolder.localPath, ...roots].filter(Boolean) as string[])),
      accessPermissions: activeWorkspaceFile
        ? getWorkspacePermissions(activeWorkspaceFile)
        : getWorkspaceFolderDefaults(storedFolder, approvalMode).accessPermissions,
      updatedAt: new Date().toISOString()
    }
    updateWorkspaceFolder(nextFolder)
    createWorkspaceTask('保存项目默认权限', 'local', 'done', `${nextFolder.name} / ${formatApprovalModeLabel(approvalMode)}`)
    appendAudit({
      type: 'workspace_folder_access_defaults_saved',
      targetPath: nextFolder.localPath || nextFolder.name,
      success: true
    })
  }

  const applyActiveFolderDefaultsToFiles = () => {
    const storedFolder = folders.find((folder) => folder.id === activeWorkspaceFolder?.id)
    if (!storedFolder?.id) return
    const defaults = getWorkspaceFolderDefaults(storedFolder, approvalMode)
    const now = new Date().toISOString()
    let changedCount = 0
    const nextFiles: WorkspaceFile[] = workspaceFiles.map((file) => {
      if ((file.folderId || ROOT_FOLDER_ID) !== storedFolder.id) return file
      changedCount += 1
      return {
        ...file,
        accessMode: defaults.accessMode,
        approvalMode: defaults.approvalMode,
        allowedRoots: defaults.allowedRoots.length ? defaults.allowedRoots : file.allowedRoots || [],
        accessPermissions: defaults.accessPermissions,
        updatedAt: now
      }
    })
    if (!changedCount) return
    setWorkspaceFiles(nextFiles)
    setSettingJSON(WORKSPACE_FILES_KEY, nextFiles)
    window.dispatchEvent(new CustomEvent(WORKSPACE_UPDATED_EVENT, { detail: { files: nextFiles } }))
    const activeFile = nextFiles.find((file) => file.id === activeWorkspaceFileId)
    if (activeFile) {
      setApprovalModeState(defaults.approvalMode)
      localStorage.setItem(WORKSPACE_APPROVAL_MODE_KEY, defaults.approvalMode)
      publishWorkspaceAccessPolicy(activeFile, defaults.approvalMode)
    }
    createWorkspaceTask('套用项目默认权限', 'local', 'done', `${storedFolder.name} / ${changedCount} 个工作台文件`)
    appendAudit({
      type: 'workspace_folder_access_defaults_applied',
      targetPath: storedFolder.localPath || storedFolder.name,
      success: true
    })
  }

  const ensureProjectForConversation = async (prompt: string) => {
    const activeFile = workspaceFiles.find((file) => file.id === activeWorkspaceFileId)
    if (activeFile?.id) {
      setActiveFolderId(activeFile.folderId || ROOT_FOLDER_ID)
      setActiveThread(activeFile.name || '未命名工作台文件')
      return activeFile
    }

    let targetFolder: WorkspaceFolder | null = null
    if (activeFolderId === ROOT_FOLDER_ID) {
      targetFolder = await createProjectFolder()
      if (!targetFolder) return null
    }

    return createProjectFileRecord({
      name: buildConversationProjectName(prompt),
      activate: true,
      folder: targetFolder
    })
  }

  const addWorkspaceFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList)
    if (!files.length) return
    const attachments = await Promise.all(files.map(fileToWorkspaceAttachment))
    setWorkspaceAttachments((prev) => [...prev, ...attachments])
  }

  const removeWorkspaceAttachment = (id: string) => {
    setWorkspaceAttachments((prev) => prev.filter((item) => item.id !== id))
  }

  const saveWorkspaceMessages = (fileId: string | undefined, messages: WorkspaceMessage[]) => {
    if (!fileId) return
    const now = new Date().toISOString()
    setWorkspaceFiles((prev) => {
      const nextFiles = prev.map((file) =>
        file.id === fileId
          ? {
              ...file,
              updatedAt: now,
              messages: sanitizeWorkspaceMessages(messages)
            }
          : file
      )
      setSettingJSON(WORKSPACE_FILES_KEY, nextFiles)
      window.dispatchEvent(new CustomEvent(WORKSPACE_UPDATED_EVENT, { detail: { files: nextFiles } }))
      return nextFiles
    })
  }

  const saveWorkspaceMaterials = (fileId: string | undefined, attachments: WorkspaceAttachment[]) => {
    if (!fileId || attachments.length === 0) return
    setWorkspaceFiles((prev) => {
      const nextFiles = prev.map((file) => {
        if (file.id !== fileId) return file
        const existing = file.materialRefs || []
        const nextRefs = [...sanitizeWorkspaceAttachments(attachments), ...existing]
          .filter((item, index, arr) => arr.findIndex((other) => other.name === item.name && other.path === item.path) === index)
          .slice(0, 200)
        return { ...file, materialRefs: nextRefs, updatedAt: new Date().toISOString() }
      })
      setSettingJSON(WORKSPACE_FILES_KEY, nextFiles)
      return nextFiles
    })
  }

  const sendToAssistant = async (text = draft, attachmentsOverride?: WorkspaceAttachment[]) => {
    const value = text.trim()
    const attachmentsSource = attachmentsOverride ?? workspaceAttachments
    const isAutomatedSend = Boolean(attachmentsOverride)
    if ((!value && attachmentsSource.length === 0) || workspaceSending) return

    const project = await ensureProjectForConversation(value || attachmentsSource[0]?.name || '项目资料')
    if (!project) return
    const attachmentsForSend = await persistWorkspaceAttachments(project, attachmentsSource)
    const cacheFailures = attachmentsForSend.filter((attachment) => attachment.cacheError)
    if (cacheFailures.length) {
      createWorkspaceTask(
        `素材缓存失败：${cacheFailures.length} 个`,
        'local',
        'failed',
        cacheFailures.map((item) => `${item.name}: ${item.cacheError}`).join('\n')
      )
      appendAudit({
        type: 'workspace_attachment_cache_failed',
        targetPath: cacheFailures.map((item) => item.name).join('; '),
        success: false,
        error: cacheFailures.map((item) => item.cacheError).filter(Boolean).join('; ')
      })
    }
    saveWorkspaceMaterials(project?.id, attachmentsForSend)
    if (activeChatModel) {
      chatFeatureRef?.current?.setChatModel?.(activeChatModel)
    }
    const requestText = buildWorkspaceRequestText({
      text: value,
      attachments: attachmentsForSend,
      planMode,
      goalMode,
      project,
      approvalMode,
      materialRefs: workspaceMaterialRefs,
      workspaceIndex,
      browserTargets,
      pendingOperations
    })

    const startedAt = Date.now()
    const userMessage: WorkspaceMessage = {
      id: `workspace-user-${startedAt}`,
      role: 'user',
      content: value || '处理这些附件',
      attachments: attachmentsForSend
    }
    setWorkspaceMessages((prev) => {
      const nextMessages = [...prev, userMessage]
      saveWorkspaceMessages(project?.id, nextMessages)
      return nextMessages
    })
    if (!isAutomatedSend) {
      setDraft('')
      setWorkspaceAttachments([])
    }

    if (!chatFeatureRef?.current?.sendChatMessage) {
      const assistantMessage: WorkspaceMessage = {
        id: `workspace-assistant-${Date.now()}`,
        role: 'assistant',
        content: '工作台助手还没有连接到对话引擎，请稍后再试。',
        elapsedMs: Date.now() - startedAt,
        isError: true
      }
      setWorkspaceMessages((prev) => {
        const nextMessages = [...prev, assistantMessage]
        saveWorkspaceMessages(project?.id, nextMessages)
        return nextMessages
      })
      return assistantMessage
    }

    setWorkspaceSending(true)
    try {
      const result = await chatFeatureRef.current.sendChatMessage(requestText, {
        source: 'workspace-home',
        autoFallback: true,
        modelId: activeChatModel || undefined,
        extraFiles: attachmentsForSend
      })
      const assistantMessage: WorkspaceMessage = {
        id: `workspace-assistant-${Date.now()}`,
        role: 'assistant',
        content: result?.assistantMessage || '已收到，我会继续处理。',
        elapsedMs: Date.now() - startedAt,
        isError: result?.isError === true,
        toolCalls: Array.isArray(result?.toolCalls) ? result.toolCalls : undefined
      }
      setWorkspaceMessages((prev) => {
        const nextMessages = [...prev, assistantMessage]
        saveWorkspaceMessages(project?.id, nextMessages)
        return nextMessages
      })
      return assistantMessage
    } catch (error) {
      const assistantMessage: WorkspaceMessage = {
        id: `workspace-assistant-${Date.now()}`,
        role: 'assistant',
        content: `处理失败：${error instanceof Error ? error.message : '未知错误'}`,
        elapsedMs: Date.now() - startedAt,
        isError: true
      }
      setWorkspaceMessages((prev) => {
        const nextMessages = [...prev, assistantMessage]
        saveWorkspaceMessages(project?.id, nextMessages)
        return nextMessages
      })
      return assistantMessage
    } finally {
      setWorkspaceSending(false)
    }
  }

  const createNode = (type: string) => {
    const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2)
    addNode(type, center.x, center.y)
    setActiveWorkspacePage('canvas')
  }

  const createProjectFolder = async () => {
    const nextIndex = folders.length + 1
    const directory = await window.api?.localCacheAPI?.openDirectory?.()
    if (!directory?.success || !directory.path) return null
    const localPath = directory.path
    const now = new Date().toISOString()
    const folder = {
      id: `workspace-folder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: localPath ? getPathName(localPath) : `工作台项目 ${nextIndex}`,
      localPath,
      accessMode: 'scoped' as const,
      approvalMode,
      allowedRoots: localPath ? [localPath] : [],
      accessPermissions: getWorkspacePermissions(null),
      createdAt: now,
      updatedAt: now
    }
    const nextFolders = [folder, ...folders]
    const seededFiles = createProductionTopicFiles(folder, workspaceFiles)
    const nextFiles = [...seededFiles, ...workspaceFiles]
    setFolders(nextFolders)
    setWorkspaceFiles(nextFiles)
    setSettingJSON(WORKSPACE_FOLDERS_KEY, nextFolders)
    setSettingJSON(WORKSPACE_FILES_KEY, nextFiles)
    window.dispatchEvent(new CustomEvent(WORKSPACE_UPDATED_EVENT, { detail: { folders: nextFolders, files: nextFiles } }))
    setActiveFolderId(folder.id)
    setActiveThread(folder.name)
    setActiveWorkspaceFileId(null)
    setWorkspaceMessages([])
    publishWorkspaceAccessPolicy(null)
    setActivePanel('overview')
    setRightPanelMode('production')
    setRightPanelOpen(true)
    return folder
  }

  const createProjectFileRecord = async ({
    name,
    activate = true,
    folder,
    productionTopicId,
    productionSkillPrompt,
    initialMessages
  }: {
    name?: string
    activate?: boolean
    folder?: WorkspaceFolder | null
    productionTopicId?: ProductionTopicId
    productionSkillPrompt?: string
    initialMessages?: WorkspaceMessage[]
  } = {}) => {
    const projectName =
      name ||
      `工作台文件 ${new Date().toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })}`
    const now = new Date().toISOString()
    const activeFolder = folder || folders.find((item) => item.id === activeFolderId) || null
    if (!activeFolder?.id || !activeFolder.localPath) return null
    const folderId = activeFolder.id
    const cacheRoot = activeFolder.localPath
    const folderDefaults = getWorkspaceFolderDefaults(activeFolder, approvalMode)
    const newProject: WorkspaceFile = {
      id: `workspace-file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: projectName,
      folderId,
      cacheRoot,
      accessMode: folderDefaults.accessMode,
      approvalMode: folderDefaults.approvalMode,
      allowedRoots: folderDefaults.allowedRoots.length ? folderDefaults.allowedRoots : cacheRoot ? [cacheRoot] : [],
      accessPermissions: folderDefaults.accessPermissions,
      createdAt: now,
      updatedAt: now,
      messages: initialMessages || [],
      productionTopicId,
      productionSkillPrompt
    }

    const nextFiles = [newProject, ...workspaceFiles]
    setWorkspaceFiles(nextFiles)
    setSettingJSON(WORKSPACE_FILES_KEY, nextFiles)
    window.dispatchEvent(new CustomEvent(WORKSPACE_UPDATED_EVENT, { detail: { files: nextFiles } }))
    if (activate) {
      setActiveWorkspaceFileId(newProject.id)
      setActiveThread(projectName)
      setWorkspaceMessages(newProject.messages || [])
      setActivePanel('overview')
      setApprovalModeState(folderDefaults.approvalMode)
      localStorage.setItem(WORKSPACE_APPROVAL_MODE_KEY, folderDefaults.approvalMode)
      publishWorkspaceAccessPolicy(newProject, folderDefaults.approvalMode)
    }
    return newProject
  }

  const createProjectFile = async () => {
    let targetFolder: WorkspaceFolder | null = null
    if (activeFolderId === ROOT_FOLDER_ID) {
      targetFolder = await createProjectFolder()
      if (!targetFolder) return
    }
    await createProjectFileRecord({ activate: true, folder: targetFolder })
  }

  const createProductionTopicMessage = (topic: (typeof productionTopicSeeds)[number]): WorkspaceMessage => ({
    id: `workspace-assistant-production-${topic.id}-${Date.now()}`,
    role: 'assistant',
    content: `已进入「${topic.name}」话题。这个话题已内置对应生产 skill，你可以直接把资料、要求或修改意见发给我，我会按这个环节推进。`
  })

  const createProductionTopicFiles = (
    folder: WorkspaceFolder,
    sourceFiles: WorkspaceFile[] = workspaceFiles
  ): WorkspaceFile[] => {
    if (!folder?.id || !folder.localPath) return []
    const now = new Date().toISOString()
    const folderDefaults = getWorkspaceFolderDefaults(folder, approvalMode)
    const existingTopicIds = new Set(
      sourceFiles
        .filter((file) => file.folderId === folder.id)
        .map((file) => file.productionTopicId || productionTopicSeeds.find((topic) => topic.name === file.name)?.id)
        .filter(Boolean)
    )

    return productionTopicSeeds
      .filter((topic) => !existingTopicIds.has(topic.id))
      .map((topic) => ({
        id: `workspace-file-${Date.now()}-${topic.id}-${Math.random().toString(36).slice(2, 6)}`,
        name: topic.name,
        folderId: folder.id,
        cacheRoot: folder.localPath || null,
        accessMode: folderDefaults.accessMode,
        approvalMode: folderDefaults.approvalMode,
        allowedRoots: folderDefaults.allowedRoots.length
          ? folderDefaults.allowedRoots
          : folder.localPath
            ? [folder.localPath]
            : [],
        accessPermissions: folderDefaults.accessPermissions,
        createdAt: now,
        updatedAt: now,
        messages: [createProductionTopicMessage(topic)],
        productionTopicId: topic.id,
        productionSkillPrompt: topic.skill
      }))
  }

  const getActiveProductionFolder = async () => {
    const activeFile = workspaceFiles.find((file) => file.id === activeWorkspaceFileId)
    const folderId = activeFile?.folderId || activeFolderId
    let folder = folders.find((item) => item.id === folderId) || null
    if (!folder || folder.id === ROOT_FOLDER_ID) {
      folder = await createProjectFolder()
    }
    return folder
  }

  const ensureProductionTopic = async (
    topicId: ProductionTopicId,
    options: { activate?: boolean } = {}
  ) => {
    const topic = productionTopicSeeds.find((item) => item.id === topicId)
    if (!topic) return null
    const folder = await getActiveProductionFolder()
    if (!folder?.id) return null

    const existing = workspaceFiles.find(
      (file) =>
        file.folderId === folder.id &&
        (file.productionTopicId === topic.id || file.name === topic.name)
    )
    if (existing) {
      if (options.activate !== false) {
        openProjectFile(existing, existing.name)
      }
      return existing
    }

    return createProjectFileRecord({
      name: topic.name,
      activate: options.activate !== false,
      folder,
      productionTopicId: topic.id,
      productionSkillPrompt: topic.skill,
      initialMessages: [createProductionTopicMessage(topic)]
    })
  }

  const ensureProductionTopicsForActiveFolder = async () => {
    const folder = await getActiveProductionFolder()
    if (!folder?.id) return
    const missingFiles = createProductionTopicFiles(folder)
    if (!missingFiles.length) return
    const nextFiles = [...missingFiles, ...workspaceFiles]
    setWorkspaceFiles(nextFiles)
    setSettingJSON(WORKSPACE_FILES_KEY, nextFiles)
    window.dispatchEvent(new CustomEvent(WORKSPACE_UPDATED_EVENT, { detail: { files: nextFiles } }))
  }

  const openProductionDeskPanel = async () => {
    await ensureProductionTopicsForActiveFolder()
    setActivePanel('overview')
    setRightPanelMode('production')
    setRightPanelOpen(true)
  }

  const ensureWorkspaceFileForAccess = async () => {
    if (activeWorkspaceFile) return activeWorkspaceFile
    let targetFolder: WorkspaceFolder | null = null
    if (activeFolderId === ROOT_FOLDER_ID) {
      targetFolder = await createProjectFolder()
      if (!targetFolder) return null
    }
    return await createProjectFileRecord({ name: '电脑访问工作台', activate: true, folder: targetFolder })
  }

  const addComputerAccessRoot = async () => {
    const file = await ensureWorkspaceFileForAccess()
    if (!file) return
    const directory = await window.api?.localCacheAPI?.openDirectory?.()
    if (!directory?.success || !directory.path) return
    const roots = Array.from(new Set([...(file.allowedRoots || []), file.cacheRoot, directory.path].filter(Boolean)))
    updateWorkspaceFile({
      ...file,
      accessMode: file.accessMode === 'global' ? 'global' : 'scoped',
      allowedRoots: roots as string[],
      updatedAt: new Date().toISOString()
    })
  }

  const openActiveProjectDirectory = async () => {
    const targetPath = getWorkspaceAccessRoots(activeWorkspaceFile)[0]
    if (!targetPath) return
    const result = await window.api?.fsAPI?.openPath?.(targetPath)
    appendAudit({
      type: result?.success ? 'open_project_directory' : 'open_project_directory_failed',
      targetPath,
      success: !!result?.success,
      error: result?.error
    })
  }

  const setComputerAccessMode = async (mode: 'scoped' | 'global') => {
    const file = await ensureWorkspaceFileForAccess()
    if (!file) return
    if (
      mode === 'global' &&
      !window.confirm(
        '开启后可按你的任务访问全局电脑，包括读写文件和执行命令。\n\n确定开启？'
      )
    ) {
      return
    }
    const roots = Array.from(new Set([file.cacheRoot, ...(file.allowedRoots || [])].filter(Boolean)))
    updateWorkspaceFile({
      ...file,
      accessMode: mode,
      accessPermissions:
        mode === 'global'
          ? getAllWorkspacePermissions(true)
          : file.accessPermissions || getWorkspacePermissions(file),
      allowedRoots: roots as string[],
      updatedAt: new Date().toISOString()
    })
  }

  const toggleWorkspacePermission = async (key: string) => {
    const file = await ensureWorkspaceFileForAccess()
    updateWorkspaceFile({
      ...file,
      accessPermissions: {
        ...getWorkspacePermissions(file),
        [key]: !getWorkspacePermissions(file)[key]
      },
      updatedAt: new Date().toISOString()
    })
  }

  const updatePendingOperations = (next: WorkspacePendingOperation[]) => {
    const clipped = next.slice(0, 200)
    setPendingOperations(clipped)
    localStorage.setItem(WORKSPACE_PENDING_OPS_KEY, JSON.stringify(clipped))
    window.dispatchEvent(new CustomEvent(`${WORKSPACE_PENDING_OPS_KEY}:updated`, { detail: clipped }))
  }

  const appendAudit = (entry: Omit<WorkspaceAuditEntry, 'id' | 'at'>) => {
    const next = [
      {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: new Date().toISOString(),
        ...entry
      },
      ...auditLog
    ].slice(0, 200)
    setAuditLog(next)
    localStorage.setItem(WORKSPACE_AUDIT_LOG_KEY, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent(`${WORKSPACE_AUDIT_LOG_KEY}:updated`, { detail: next }))
  }

  const approveOperation = async (operation: WorkspacePendingOperation) => {
    let result: any = { success: false, error: '未知操作' }
    if (operation.operation === 'write_text_file') {
      result = await window.api?.fsAPI?.writeTextFile?.({
        filePath: operation.targetPath || '',
        content: operation.content || '',
        append: operation.append,
        createDirs: true
      })
    } else if (operation.operation === 'copy_path') {
      result = await window.api?.fsAPI?.copyPath?.({
        sourcePath: operation.sourcePath || '',
        targetPath: operation.targetPath || '',
        overwrite: operation.overwrite
      })
    } else if (operation.operation === 'move_path') {
      result = await window.api?.fsAPI?.movePath?.({
        sourcePath: operation.sourcePath || '',
        targetPath: operation.targetPath || '',
        overwrite: operation.overwrite
      })
    } else if (operation.operation === 'delete_path') {
      result = await window.api?.fsAPI?.deletePath?.({
        targetPath: operation.targetPath || '',
        recursive: operation.recursive
      })
    } else if (operation.operation === 'run_command') {
      result = await window.api?.fsAPI?.runCommand?.({
        command: operation.command || '',
        cwd: operation.cwd,
        timeoutMs: operation.timeoutMs
      })
    } else if (operation.operation === 'start_terminal') {
      result = await window.api?.terminalAPI?.start?.({
        command: operation.command,
        cwd: operation.cwd
      })
    }
    updatePendingOperations(
      pendingOperations.map((item) =>
        item.id === operation.id
          ? { ...item, status: result?.success ? 'approved' : 'failed', result }
          : item
      )
    )
    appendAudit({
      type: `approved_${operation.operation}`,
      targetPath: operation.targetPath,
      sourcePath: operation.sourcePath,
      command: operation.command,
      success: result?.success,
      error: result?.error
    })
    createWorkspaceTask(
      result?.success
        ? `已批准：${formatOperationName(operation.operation)}`
        : `批准后失败：${formatOperationName(operation.operation)}`,
      'local',
      result?.success ? 'done' : 'failed',
      formatOperationResultDetail(operation, result)
    )
  }

  const rejectOperation = (operation: WorkspacePendingOperation) => {
    updatePendingOperations(
      pendingOperations.map((item) =>
        item.id === operation.id ? { ...item, status: 'rejected' } : item
      )
    )
    appendAudit({
      type: `rejected_${operation.operation}`,
      targetPath: operation.targetPath,
      sourcePath: operation.sourcePath,
      command: operation.command,
      success: false
    })
    createWorkspaceTask(
      `已拒绝：${formatOperationName(operation.operation)}`,
      'local',
      'done',
      formatOperationResultDetail(operation, { success: false, error: '用户拒绝执行' })
    )
  }

  const startTerminalSession = async (command?: string) => {
    const cwd = getWorkspaceAccessRoots(activeWorkspaceFile)[0]
    const result = await window.api?.terminalAPI?.start?.({ cwd, command })
    if (!result?.success) {
      appendAudit({ type: 'terminal_start_failed', error: result?.error, success: false })
      return
    }
    appendAudit({ type: 'terminal_start', targetPath: cwd, success: true })
  }

  const sendTerminalInput = async (sessionId: string) => {
    if (!terminalInput.trim()) return
    await window.api?.terminalAPI?.input?.(sessionId, `${terminalInput}\n`)
    setTerminalInput('')
  }

  const stopTerminalSession = async (sessionId: string) => {
    await window.api?.terminalAPI?.stop?.(sessionId)
    appendAudit({ type: 'terminal_stop', success: true })
  }

  const rebuildWorkspaceIndex = async () => {
    const roots = getWorkspaceAccessRoots(activeWorkspaceFile)
    const items: WorkspaceIndexItem[] = []
    for (const root of roots) {
      const result: any = await window.api?.fsAPI?.listDirectory?.(root)
      if (!result?.files) continue
      items.push(...result.files)
      const childDirs = result.files.filter((file: any) => file.isDirectory).slice(0, 20)
      for (const dir of childDirs) {
        const childResult: any = await window.api?.fsAPI?.listDirectory?.(dir.path)
        if (childResult?.files) items.push(...childResult.files)
      }
    }
    const clipped = items.slice(0, 2000)
    setWorkspaceIndex(clipped)
    localStorage.setItem(WORKSPACE_INDEX_KEY, JSON.stringify(clipped))
    appendAudit({ type: 'workspace_index_rebuilt', success: true, targetPath: roots.join('; ') })
  }

  const updateWorkspaceTasks = (nextTasks: WorkspaceTaskItem[]) => {
    const clipped = nextTasks.slice(0, 100)
    setWorkspaceTasks(clipped)
    localStorage.setItem(WORKSPACE_TASKS_KEY, JSON.stringify(clipped))
    window.dispatchEvent(new CustomEvent(`${WORKSPACE_TASKS_KEY}:updated`, { detail: clipped }))
  }

  const createWorkspaceTask = (
    name: string,
    channel: WorkspaceTaskItem['channel'] = 'local',
    status: WorkspaceTaskItem['status'] = 'waiting',
    detail?: string,
    extra?: Partial<WorkspaceTaskItem>
  ) => {
    const next = [
      {
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        status,
        channel,
        detail,
        updatedAt: new Date().toISOString(),
        ...extra
      },
        ...workspaceTasks
      ].slice(0, 100)
    updateWorkspaceTasks(next)
    return next[0]
  }

  useEffect(() => {
    const cleanup = window.api?.on?.('feishu:incoming-message', (message: any) => {
      const content = String(message?.content || '').trim()
      if (!content) return
      const lowered = content.toLowerCase()
      const isRejected = /(拒绝|不通过|取消|不同意|驳回|reject|denied|cancel|no\b)/i.test(content)
      const isApproved = /(确认|同意|通过|批准|完成|可以|approve|approved|yes\b|ok\b)/i.test(content)
      if (!isApproved && !isRejected) return
      const storedTasks = readWorkspaceArray(WORKSPACE_TASKS_KEY) as WorkspaceTaskItem[]
      const openStatuses = new Set(['waiting', 'pending', 'running'])
      const matchedTask =
        storedTasks.find(
          (task) =>
            task.channel === 'feishu' &&
            openStatuses.has(task.status) &&
            (lowered.includes(task.id.toLowerCase()) ||
              lowered.includes(task.name.toLowerCase()) ||
              (task.detail ? lowered.includes(task.detail.toLowerCase().slice(0, 24)) : false))
        ) ||
        storedTasks.find((task) => task.channel === 'feishu' && openStatuses.has(task.status))
      if (!matchedTask) return
      const updatedAt = new Date().toISOString()
      const resultLine = `\n\n飞书回写：${isRejected ? '已拒绝' : '已确认'}\n消息：${content.slice(0, 300)}`
      updateWorkspaceTasks(
        storedTasks.map((task) =>
          task.id === matchedTask.id
            ? {
                ...task,
                status: isRejected ? 'failed' : 'done',
                detail: `${task.detail || ''}${resultLine}`,
                updatedAt
              }
            : task
        )
      )
      appendAudit({
        type: isRejected ? 'workspace_feishu_confirmation_rejected' : 'workspace_feishu_confirmation_approved',
        targetPath: matchedTask.name,
        success: !isRejected,
        error: isRejected ? content.slice(0, 300) : undefined
      })
    })
    return () => {
      if (typeof cleanup === 'function') cleanup()
    }
  }, [])

  useEffect(() => {
    const dispatchDueRetry = () => {
      if (workspaceSending || !chatFeatureRef?.current?.sendChatMessage) return

      const storedTasks = readWorkspaceArray(WORKSPACE_TASKS_KEY) as WorkspaceTaskItem[]
      const now = Date.now()
      const dueTask = storedTasks.find((task) => {
        if (task.channel !== 'automation' || task.status !== 'waiting') return false
        if (!task.retryAttempt || !task.nextRetryAt) return false
        const retryAt = new Date(task.nextRetryAt).getTime()
        return Number.isFinite(retryAt) && retryAt <= now && !retryExecutorIdsRef.current.has(task.id)
      })
      if (!dueTask) return

      retryExecutorIdsRef.current.add(dueTask.id)
      const runningAt = new Date().toISOString()
      updateWorkspaceTasks(
        storedTasks.map((task) =>
          task.id === dueTask.id ? { ...task, status: 'running', updatedAt: runningAt } : task
        )
      )
      appendAudit({
        type: 'workspace_automation_retry_running',
        targetPath: dueTask.name,
        success: true
      })

      void (async () => {
        try {
          const result = await sendToAssistant(dueTask.detail || dueTask.name, [])
          const failed = result?.isError === true
          const latestTasks = readWorkspaceArray(WORKSPACE_TASKS_KEY) as WorkspaceTaskItem[]
          updateWorkspaceTasks(
            latestTasks.map((task) =>
              task.id === dueTask.id
                ? {
                    ...task,
                    status: failed ? 'failed' : 'done',
                    updatedAt: new Date().toISOString()
                  }
                : task
            )
          )
          appendAudit({
            type: failed ? 'workspace_automation_retry_dispatch_failed' : 'workspace_automation_retry_dispatched',
            targetPath: dueTask.name,
            success: !failed,
            error: failed ? result?.content : undefined
          })
        } catch (error) {
          const latestTasks = readWorkspaceArray(WORKSPACE_TASKS_KEY) as WorkspaceTaskItem[]
          updateWorkspaceTasks(
            latestTasks.map((task) =>
              task.id === dueTask.id
                ? {
                    ...task,
                    status: 'failed',
                    updatedAt: new Date().toISOString()
                  }
                : task
            )
          )
          appendAudit({
            type: 'workspace_automation_retry_dispatch_failed',
            targetPath: dueTask.name,
            success: false,
            error: error instanceof Error ? error.message : String(error)
          })
        } finally {
          retryExecutorIdsRef.current.delete(dueTask.id)
        }
      })()
    }

    dispatchDueRetry()
    const timer = window.setInterval(dispatchDueRetry, 30_000)
    return () => window.clearInterval(timer)
  }, [workspaceSending, workspaceTasks])

  useEffect(() => {
    const onSkillExecuted = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {}
      const result = detail.result || {}
      const skillName = result.skillName || detail.skillName || '技能'
      const failed = Number(result.failed || 0)
      const total = Number(result.totalSteps || 0)
      const succeeded = Number(result.succeeded || 0)
      const hasError = !!result.error || failed > 0 || result.success === false
      const summary = total
        ? `${skillName}：${succeeded}/${total} 步成功`
        : `${skillName}：${hasError ? '执行失败' : '执行完成'}`
      createWorkspaceTask(
        summary,
        'skill',
        hasError ? 'failed' : 'done',
        hasError ? result.error || `${failed} 步失败` : `${succeeded}/${total || succeeded} 步完成`
      )
      appendAudit({
        type: hasError ? 'workspace_skill_failed' : 'workspace_skill_completed',
        targetPath: skillName,
        success: !hasError,
        error: result.error
      })
    }
    window.addEventListener('workspace:skill-executed', onSkillExecuted)
    return () => window.removeEventListener('workspace:skill-executed', onSkillExecuted)
  }, [auditLog, workspaceTasks])

  useEffect(() => {
    const onAutomationEvent = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail || {}
      const action = detail.action || '自动化'
      const name = detail.name || '自动化任务'
      const hasError = !!detail.error || detail.success === false
      createWorkspaceTask(
        `${action}：${name}`,
        'automation',
        hasError ? 'failed' : 'done',
        hasError ? detail.error || '自动化执行失败' : '自动化操作已写入工作台'
      )
      appendAudit({
        type: hasError ? 'workspace_automation_failed' : 'workspace_automation_completed',
        targetPath: name,
        success: !hasError,
        error: detail.error
      })
    }
    window.addEventListener('workspace:automation-event', onAutomationEvent)
    return () => window.removeEventListener('workspace:automation-event', onAutomationEvent)
  }, [auditLog, workspaceTasks])

  const saveReviewReports = (reports: WorkspaceReviewReport[]) => {
    const clipped = reports.slice(0, 50)
    setReviewReports(clipped)
    localStorage.setItem(WORKSPACE_REVIEW_REPORTS_KEY, JSON.stringify(clipped))
    window.dispatchEvent(new CustomEvent(`${WORKSPACE_REVIEW_REPORTS_KEY}:updated`, { detail: clipped }))
  }

  const runWorkspaceReviewSummary = async () => {
    const cwd = getWorkspaceAccessRoots(activeWorkspaceFile)[0]
    const now = new Date().toISOString()
    if (!cwd) {
      const report: WorkspaceReviewReport = {
        id: `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        status: 'failed',
        error: '当前工作台没有授权目录，无法审查改动。',
        createdAt: now
      }
      saveReviewReports([report, ...reviewReports])
      createWorkspaceTask('代码审查：缺少授权目录', 'review', 'failed', '请先选择工作台项目目录')
      return
    }

    const [status, stat, names, numstat] = await Promise.all([
      window.api?.fsAPI?.runCommand?.({ command: 'git status --short', cwd, timeoutMs: 30000 }),
      window.api?.fsAPI?.runCommand?.({ command: 'git diff --stat', cwd, timeoutMs: 30000 }),
      window.api?.fsAPI?.runCommand?.({ command: 'git diff --name-only', cwd, timeoutMs: 30000 }),
      window.api?.fsAPI?.runCommand?.({ command: 'git diff --numstat', cwd, timeoutMs: 30000 })
    ])
    const failed =
      status?.success === false ||
      stat?.success === false ||
      names?.success === false ||
      numstat?.success === false
    const reviewFiles = parseReviewFiles(status?.stdout || '', numstat?.stdout || '')
    const totalAdded = reviewFiles.reduce((sum, file) => sum + (file.added || 0), 0)
    const totalDeleted = reviewFiles.reduce((sum, file) => sum + (file.deleted || 0), 0)
    const previousReview = reviewReports.find((item) => item.cwd === cwd && item.status === 'done')
    const historyDelta = buildReviewHistoryDelta(reviewFiles, totalAdded, totalDeleted, previousReview)
    const diffSnippetResults = await Promise.all(
      reviewFiles
        .filter((file) => file.status !== '??')
        .slice(0, 8)
        .map(async (file) => {
          const result = await window.api?.fsAPI?.runCommand?.({
            command: `git diff --unified=3 HEAD -- ${quoteShellArg(file.path)}`,
            cwd,
            timeoutMs: 30000
          })
          const diff = String(result?.stdout || '').trim()
          const hunks = parseDiffHunks(diff)
          return diff
            ? { path: file.path, diff: diff.slice(0, 12000), hunkCount: hunks.length, hunks }
            : null
        })
    )
    const report: WorkspaceReviewReport = {
      id: `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      cwd,
      status: failed ? 'failed' : 'done',
      statusText: status?.stdout || status?.stderr || '',
      diffStat: stat?.stdout || stat?.stderr || '',
      changedFiles: String(names?.stdout || '')
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 30),
      files: reviewFiles.slice(0, 60),
      diffSnippets: diffSnippetResults.filter(Boolean) as WorkspaceReviewDiffSnippet[],
      totalAdded,
      totalDeleted,
      riskLevel: summarizeReviewRisk(reviewFiles),
      historyDelta,
      error: status?.error || stat?.error || names?.error || numstat?.error,
      createdAt: now
    }
    saveReviewReports([report, ...reviewReports])
    createWorkspaceTask(
      report.status === 'done' ? `代码审查：${report.changedFiles?.length || 0} 个改动文件` : '代码审查失败',
      'review',
      report.status === 'done' ? 'done' : 'failed',
      report.status === 'done'
        ? `新增 +${report.totalAdded || 0}，删除 -${report.totalDeleted || 0}，风险 ${formatReviewRisk(report.riskLevel)}${historyDelta ? `，新增文件 ${historyDelta.newFiles.length}，已消失 ${historyDelta.resolvedFiles.length}` : ''}`
        : report.error || 'git 审查命令失败'
    )
    appendAudit({
      type: report.status === 'done' ? 'workspace_review_summary' : 'workspace_review_failed',
      targetPath: cwd,
      success: report.status === 'done',
      error: report.error
    })
  }

  const saveBrowserTargets = (targets: WorkspaceBrowserTarget[]) => {
    const clipped = targets.slice(0, 100)
    setBrowserTargets(clipped)
    localStorage.setItem(WORKSPACE_BROWSER_TARGETS_KEY, JSON.stringify(clipped))
    window.dispatchEvent(new CustomEvent(`${WORKSPACE_BROWSER_TARGETS_KEY}:updated`, { detail: clipped }))
  }

  const normalizeBrowserUrl = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return ''
    if (/^https?:\/\/lingjingxinghe\.top(?::\d+)?(?:[/?#]|$)/i.test(trimmed)) {
      return trimmed.replace(/^https?:\/\/lingjingxinghe\.top/i, 'https://www.lingjingxinghe.top')
    }
    if (/^(https?:|file:)/i.test(trimmed)) return trimmed
    if (/^lingjingxinghe\.top(?::\d+)?(?:[/?#]|$)/i.test(trimmed)) {
      return `https://www.${trimmed}`
    }
    if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(trimmed)) {
      return `http://${trimmed}`
    }
    return `https://${trimmed}`
  }

  const openBrowserTarget = async (rawUrl = browserUrl, note = '手动打开') => {
    const url = normalizeBrowserUrl(rawUrl)
    if (!url) return
    const result = await window.api?.windowAPI?.openExternal?.(url)
    const now = new Date().toISOString()
    const target: WorkspaceBrowserTarget = {
      id: `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url,
      note,
      status: result?.success ? 'opened' : 'ready',
      fileId: activeWorkspaceFileId,
      createdAt: now,
      updatedAt: now
    }
    saveBrowserTargets([target, ...browserTargets])
    createWorkspaceTask(`浏览器验证：${url}`, 'browser', 'waiting', `打开外部浏览器：${url}`)
    appendAudit({
      type: result?.success ? 'browser_opened' : 'browser_open_failed',
      targetPath: url,
      success: !!result?.success,
      error: result?.error
    })
    setBrowserUrl('')
  }

  const inspectBrowserTarget = async (rawUrl = browserUrl, note = 'composer-url') => {
    const url = normalizeBrowserUrl(rawUrl)
    if (!url) return
    const now = new Date().toISOString()
    const result = await window.api?.windowAPI?.inspectUrl?.(url)
    const screenshot =
      result?.success && window.api?.windowAPI?.captureUrlScreenshot
        ? await window.api.windowAPI.captureUrlScreenshot(url)
        : null
    const dom =
      result?.success && window.api?.windowAPI?.inspectUrlDom
        ? await window.api.windowAPI.inspectUrlDom(url)
        : null
    const target: WorkspaceBrowserTarget = {
      id: `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url,
      note,
      status: result?.success ? 'done' : 'ready',
      httpStatus: result?.status,
      title: result?.title,
      contentType: result?.contentType,
      checkedAt: now,
      screenshotPath: screenshot?.success ? screenshot.screenshotPath : undefined,
      domSummary: dom?.success
        ? `${dom?.elements?.length || 0} 个可交互元素${dom?.heading ? `；${dom.heading}` : ''}`
        : undefined,
      error: result?.error || screenshot?.error || dom?.error,
      fileId: activeWorkspaceFileId,
      createdAt: now,
      updatedAt: now
    }
    saveBrowserTargets([target, ...browserTargets])
    createWorkspaceTask(
      result?.success
        ? `浏览器检查：${result.status || 'OK'} ${result.title || url}`
        : `浏览器检查失败：${url}`,
      'browser',
      result?.success ? 'done' : 'failed',
      result?.success
        ? `${result.status || 'OK'} · ${result.contentType || '页面'}${screenshot?.screenshotPath ? ` · 截图 ${screenshot.screenshotPath}` : ''}`
        : result?.error || '页面检查失败'
    )
    appendAudit({
      type: result?.success ? 'browser_url_inspected' : 'browser_url_inspect_failed',
      targetPath: url,
      success: !!result?.success,
      error: result?.error
    })
    setBrowserUrl('')
  }

  const startBrowserSessionTarget = async (rawUrl = browserUrl, note = 'composer-session') => {
    const url = normalizeBrowserUrl(rawUrl)
    if (!url) return
    const now = new Date().toISOString()
    const sessionProfile = createWorkspaceBrowserProfileId(activeWorkspaceFile, activeWorkspaceFolder)
    const result = await window.api?.windowAPI?.startBrowserSession?.({
      url,
      sessionId: sessionProfile,
      width: 1280,
      height: 900,
      persistProfile: true
    })
    const target: WorkspaceBrowserTarget = {
      id: `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: result?.url || url,
      note,
      status: result?.success ? 'done' : 'ready',
      title: result?.title,
      sessionId: result?.sessionId,
      sessionProfile: result?.sessionProfile || sessionProfile,
      sessionPersisted: result?.sessionPersisted,
      sessionSummary: result?.success
        ? `会话 ${result.sessionId} 已连接，可连续检查、点击、填写和截图${result.sessionPersisted ? '；登录态会在当前工作台复用' : ''}`
        : undefined,
      error: result?.error,
      fileId: activeWorkspaceFileId,
      createdAt: now,
      updatedAt: now
    }
    saveBrowserTargets([target, ...browserTargets])
    createWorkspaceTask(
      result?.success ? `浏览器会话：${result.title || url}` : `浏览器会话失败：${url}`,
      'browser',
      result?.success ? 'done' : 'failed',
      result?.success
        ? `会话 ${result.sessionId} 已连接${result.sessionPersisted ? '，登录态可复用' : ''}`
        : result?.error || '会话启动失败'
    )
    appendAudit({
      type: result?.success ? 'browser_session_started' : 'browser_session_start_failed',
      targetPath: url,
      success: !!result?.success,
      error: result?.error
    })
    setBrowserUrl('')
  }

  const importBrowserCookiesTarget = async () => {
    const picked = await window.api?.localCacheAPI?.openFiles?.({
      filters: [{ name: 'Cookies JSON', extensions: ['json'] }],
      multiple: false
    })
    const sourcePath = picked?.paths?.[0]
    if (!sourcePath) return

    const readResult = await window.api?.fsAPI?.readTextFile?.(sourcePath)
    let cookiesPayload: any = null
    try {
      cookiesPayload = JSON.parse(readResult?.content || '')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'JSON 解析失败'
      createWorkspaceTask('导入浏览器登录态失败', 'browser', 'failed', message)
      appendAudit({
        type: 'browser_cookies_import_failed',
        targetPath: sourcePath,
        success: false,
        error: message
      })
      return
    }

    const sessionProfile = createWorkspaceBrowserProfileId(activeWorkspaceFile, activeWorkspaceFolder)
    const result = await window.api?.windowAPI?.importBrowserCookies?.({
      sessionId: sessionProfile,
      cookies: cookiesPayload
    })
    const now = new Date().toISOString()
    const target: WorkspaceBrowserTarget = {
      id: `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: `cookies:${result?.sessionId || sessionProfile}`,
      note: '导入外部浏览器登录态',
      status: result?.success ? 'done' : 'failed',
      sessionId: result?.sessionId || sessionProfile,
      sessionProfile: result?.sessionProfile || result?.sessionId || sessionProfile,
      sessionPersisted: !!result?.success,
      sessionSummary: result?.success
        ? `已导入 ${result.imported || 0} 个 cookie${result.failed ? `，失败 ${result.failed} 个` : ''}`
        : undefined,
      error: result?.error,
      fileId: activeWorkspaceFileId,
      createdAt: now,
      updatedAt: now
    }
    saveBrowserTargets([target, ...browserTargets])
    createWorkspaceTask(
      '导入浏览器登录态',
      'browser',
      result?.success ? 'done' : 'failed',
      result?.success
        ? `导入 ${result.imported || 0} 个 cookie 到 ${target.sessionProfile}`
        : result?.error || '导入失败'
    )
    appendAudit({
      type: result?.success ? 'browser_cookies_imported' : 'browser_cookies_import_failed',
      targetPath: sourcePath,
      success: !!result?.success,
      error: result?.error
    })
  }

  const listExternalBrowserProfilesTarget = async () => {
    const result = await window.api?.windowAPI?.listBrowserProfiles?.()
    const profiles = Array.isArray(result?.profiles) ? result.profiles : []
    const now = new Date().toISOString()
    const summary = result?.success
      ? profiles.length
        ? profiles
            .slice(0, 5)
            .map((profile: any) => `${profile.browser} ${profile.name}`)
            .join('，')
        : '未发现常见浏览器 Profile'
      : result?.error || '读取浏览器 Profile 失败'
    const target: WorkspaceBrowserTarget = {
      id: `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: 'profiles:external-browser',
      note: '外部浏览器 Profile 发现',
      status: result?.success ? 'done' : 'failed',
      sessionSummary: result?.success
        ? `发现 ${profiles.length} 个 Profile：${summary}`
        : undefined,
      error: result?.error,
      fileId: activeWorkspaceFileId,
      createdAt: now,
      updatedAt: now
    }
    saveBrowserTargets([target, ...browserTargets])
    createWorkspaceTask(
      '发现外部浏览器 Profile',
      'browser',
      result?.success ? 'done' : 'failed',
      result?.success
        ? `发现 ${profiles.length} 个候选。可用“直读”导入 Chromium 系浏览器 cookie；失败时再用 cookies JSON 或工作台持久会话登录。\n${profiles
            .slice(0, 8)
            .map((profile: any) => `${profile.browser} ${profile.name}: ${profile.profilePath}`)
            .join('\n')}`
        : result?.error || '读取失败'
    )
    appendAudit({
      type: result?.success ? 'browser_profiles_listed' : 'browser_profiles_list_failed',
      targetPath: profiles[0]?.rootPath || 'external-browser',
      success: !!result?.success,
      error: result?.error
    })
  }

  const importExternalBrowserProfileCookiesTarget = async () => {
    const profileResult = await window.api?.windowAPI?.listBrowserProfiles?.()
    const profiles = (Array.isArray(profileResult?.profiles) ? profileResult.profiles : []).filter(
      (profile: any) => profile.browser !== 'Firefox' && profile.hasCookiesDb
    )
    if (!profileResult?.success || !profiles.length) {
      const message = profileResult?.error || '未发现可直读的 Chrome/Edge/Brave Profile'
      createWorkspaceTask('直读浏览器登录态失败', 'browser', 'failed', message)
      appendAudit({ type: 'browser_profile_cookies_import_failed', targetPath: 'external-browser', success: false, error: message })
      return
    }
    let profile = profiles[0]
    if (profiles.length > 1) {
      const choice = window.prompt(
        `选择要导入的浏览器 Profile 编号：\n${profiles
          .slice(0, 12)
          .map((item: any, index: number) => `${index + 1}. ${item.browser} ${item.name}\n${item.profilePath}`)
          .join('\n')}`,
        '1'
      )
      const index = Math.max(0, Math.min((Number(choice) || 1) - 1, profiles.length - 1))
      profile = profiles[index]
    }
    if (!profile?.profilePath) return

    const sessionProfile = createWorkspaceBrowserProfileId(activeWorkspaceFile, activeWorkspaceFolder)
    const result = await window.api?.windowAPI?.importBrowserProfileCookies?.({
      sessionId: sessionProfile,
      profilePath: profile.profilePath,
      limit: 1200
    })
    const now = new Date().toISOString()
    const target: WorkspaceBrowserTarget = {
      id: `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: `profile-cookies:${result?.sessionId || sessionProfile}`,
      note: '直读外部浏览器登录态',
      status: result?.success ? 'done' : 'failed',
      sessionId: result?.sessionId || sessionProfile,
      sessionProfile: result?.sessionProfile || result?.sessionId || sessionProfile,
      sessionPersisted: !!result?.success,
      sessionSummary: result?.success
        ? `从 ${profile.browser} ${profile.name} 导入 ${result.imported || 0} 个 cookie${result.failed ? `，失败 ${result.failed} 个` : ''}`
        : undefined,
      error: result?.error,
      fileId: activeWorkspaceFileId,
      createdAt: now,
      updatedAt: now
    }
    saveBrowserTargets([target, ...browserTargets])
    createWorkspaceTask(
      '直读浏览器登录态',
      'browser',
      result?.success ? 'done' : 'failed',
      result?.success
        ? `从 ${profile.browser} ${profile.name} 导入 ${result.imported || 0} 个 cookie 到 ${target.sessionProfile}`
        : result?.error || '导入失败'
    )
    appendAudit({
      type: result?.success ? 'browser_profile_cookies_imported' : 'browser_profile_cookies_import_failed',
      targetPath: profile.profilePath,
      success: !!result?.success,
      error: result?.error
    })
  }

  const captureBrowserTargetEvidence = async (targetId: string) => {
    const target = browserTargets.find((item) => item.id === targetId)
    if (!target) return
    const result: any = target.sessionId
      ? await window.api?.windowAPI?.captureBrowserSessionScreenshot?.({ sessionId: target.sessionId })
      : await window.api?.windowAPI?.captureUrlScreenshot?.(target.url)
    const now = new Date().toISOString()
    const success = !!result?.success
    const nextTarget: WorkspaceBrowserTarget = {
      ...target,
      url: result?.url || target.url,
      title: result?.title || target.title,
      screenshotPath: success ? result?.screenshotPath : target.screenshotPath,
      sessionSummary:
        success && target.sessionId
          ? `会话 ${target.sessionId} 已截图${result?.screenshotPath ? `：${result.screenshotPath}` : ''}`
          : target.sessionSummary,
      error: success ? undefined : result?.error || target.error,
      status: success ? 'done' : 'failed',
      updatedAt: now
    }
    saveBrowserTargets(browserTargets.map((item) => (item.id === targetId ? nextTarget : item)))
    createWorkspaceTask(
      success ? `浏览器截图：${target.title || target.url}` : `浏览器截图失败：${target.url}`,
      'browser',
      success ? 'done' : 'failed',
      success ? result?.screenshotPath || '截图已保存' : result?.error || '截图失败'
    )
    appendAudit({
      type: success ? 'browser_screenshot_captured' : 'browser_screenshot_failed',
      targetPath: target.url,
      success,
      error: result?.error
    })
  }

  const inspectBrowserTargetDom = async (targetId: string) => {
    const target = browserTargets.find((item) => item.id === targetId)
    if (!target) return
    const result: any = target.sessionId
      ? await window.api?.windowAPI?.inspectBrowserSessionDom?.({ sessionId: target.sessionId, limit: 24 })
      : await window.api?.windowAPI?.inspectUrlDom?.(target.url)
    const now = new Date().toISOString()
    const success = !!result?.success
    const summary = success
      ? `${result?.elements?.length || 0} 个可交互元素${result?.heading ? `；${result.heading}` : ''}`
      : target.domSummary
    const nextTarget: WorkspaceBrowserTarget = {
      ...target,
      url: result?.url || target.url,
      title: result?.title || target.title,
      domSummary: summary,
      sessionSummary:
        success && target.sessionId ? `会话 ${target.sessionId} 已读取 DOM 结构` : target.sessionSummary,
      error: success ? undefined : result?.error || target.error,
      status: success ? 'done' : 'failed',
      updatedAt: now
    }
    saveBrowserTargets(browserTargets.map((item) => (item.id === targetId ? nextTarget : item)))
    createWorkspaceTask(
      success ? `浏览器 DOM：${target.title || target.url}` : `浏览器 DOM 失败：${target.url}`,
      'browser',
      success ? 'done' : 'failed',
      success ? summary : result?.error || 'DOM 读取失败'
    )
    appendAudit({
      type: success ? 'browser_dom_inspected' : 'browser_dom_failed',
      targetPath: target.url,
      success,
      error: result?.error
    })
  }

  const inspectBrowserTargetConsole = async (targetId: string) => {
    const target = browserTargets.find((item) => item.id === targetId)
    if (!target) return
    const result: any = target.sessionId
      ? await window.api?.windowAPI?.inspectBrowserSessionConsole?.({
          sessionId: target.sessionId,
          limit: 80
        })
      : await window.api?.windowAPI?.inspectUrlConsole?.({
          url: target.url,
          limit: 80,
          width: 1280,
          height: 900
        })
    const now = new Date().toISOString()
    const success = !!result?.success
    const severeCount = Array.isArray(result?.severeMessages) ? result.severeMessages.length : 0
    const failureCount = Array.isArray(result?.loadFailures) ? result.loadFailures.length : 0
    const pageErrorCount = Array.isArray(result?.pageErrors) ? result.pageErrors.length : 0
    const crashCount = Array.isArray(result?.crashes) ? result.crashes.length : 0
    const summary = success
      ? target.sessionId
        ? `会话控制台：${severeCount} 个警告/错误，加载失败 ${failureCount} 个，崩溃 ${crashCount} 个`
        : `控制台：${severeCount} 个警告/错误，加载失败 ${failureCount} 个，页面错误 ${pageErrorCount} 个`
      : result?.error || target.consoleSummary || '控制台诊断失败'
    const nextTarget: WorkspaceBrowserTarget = {
      ...target,
      url: result?.finalUrl || result?.url || target.url,
      title: result?.title || target.title,
      consoleSummary: summary,
      sessionSummary:
        success && target.sessionId ? `会话 ${target.sessionId} 已读取控制台日志` : target.sessionSummary,
      error: success ? undefined : result?.error || target.error,
      action: 'console',
      status: success ? 'done' : 'failed',
      updatedAt: now
    }
    saveBrowserTargets(browserTargets.map((item) => (item.id === targetId ? nextTarget : item)))
    createWorkspaceTask(
      success ? `浏览器控制台：${target.title || target.url}` : `浏览器控制台失败：${target.url}`,
      'browser',
      success ? 'done' : 'failed',
      summary
    )
    appendAudit({
      type: success ? 'browser_console_inspected' : 'browser_console_failed',
      targetPath: target.url,
      success,
      error: result?.error
    })
  }

  const removeBrowserTarget = async (targetId: string, closeSession = false) => {
    const target = browserTargets.find((item) => item.id === targetId)
    if (closeSession && target?.sessionId) {
      await window.api?.windowAPI?.closeBrowserSession?.({ sessionId: target.sessionId })
    }
    const nextTargets = browserTargets.filter((item) => item.id !== targetId)
    saveBrowserTargets(nextTargets)
    appendAudit({
      type: closeSession ? 'browser_session_closed' : 'browser_target_removed',
      targetPath: target?.url,
      success: true
    })
  }

  const clearBrowserTargets = async () => {
    const sessions = browserTargets.filter((target) => target.sessionId)
    await Promise.all(
      sessions.map((target) =>
        window.api?.windowAPI?.closeBrowserSession?.({ sessionId: target.sessionId || '' })
      )
    )
    saveBrowserTargets([])
    appendAudit({
      type: 'browser_targets_cleared',
      success: true
    })
  }

  const installRecommendedWorkspaceSkills = () => {
    const count = installRecommendedSkills()
    createWorkspaceTask(
      `安装推荐技能：${count} 个`,
      'skill',
      'done',
      `${recommendedSkillSeeds.map((item) => item.name).join('、')}已同步`
    )
    appendAudit({
      type: 'workspace_recommended_skills_installed',
      targetPath: 'xinghe_skills',
      success: true
    })
    return count
  }

  const recordWorkspaceConnectorChange = (connector: WorkspaceConnector, connected: boolean) => {
    createWorkspaceTask(
      `${connected ? '启用' : '停用'}连接器：${connector.name}`,
      'skill',
      'done',
      `${connector.category} / ${connector.scopes.join('、')}`
    )
    appendAudit({
      type: connected ? 'workspace_connector_connected' : 'workspace_connector_disconnected',
      targetPath: connector.name,
      success: true
    })
  }

  const createAutomationTemplateTask = (item: WorkspaceCatalogItem) => {
    createWorkspaceTask(`自动化模板：${item.name}`, 'automation', 'waiting', item.detail || item.desc)
    appendAudit({
      type: 'workspace_automation_template_created',
      targetPath: item.name,
      success: true
    })
    setDraft(item.prompt || `按「${item.name}」模板执行：${item.desc}`)
    setActivePanel('overview')
  }

  const createAutomationTimer = (preset: (typeof automationTimerPresets)[number]) => {
    const result = create_timer_task({
      name: preset.name,
      intervalMinutes: preset.intervalMinutes,
      skillId: null,
      variables: {
        source: 'workspace',
        prompt: `按「${preset.name}」定时计划执行：${preset.desc}`
      }
    })
    const success = !!result?.success
    createWorkspaceTask(
      `定时计划：${preset.name}`,
      'automation',
      success ? 'done' : 'failed',
      success
        ? `每 ${preset.intervalMinutes} 分钟执行一次。${result.message || ''}`
        : result?.error || '定时计划创建失败'
    )
    appendAudit({
      type: success ? 'workspace_automation_timer_created' : 'workspace_automation_timer_failed',
      targetPath: preset.name,
      success,
      error: success ? undefined : result?.error
    })
    window.dispatchEvent(new CustomEvent('workspace:timers-updated', { detail: result }))
    return result
  }

  const cancelAutomationTimer = (timerId: string, timerName: string) => {
    const result = cancel_timer_task({ timerId })
    const success = !!result?.success
    createWorkspaceTask(
      `取消定时计划：${timerName}`,
      'automation',
      success ? 'done' : 'failed',
      success ? result.message || '定时计划已取消' : result?.error || '定时计划取消失败'
    )
    appendAudit({
      type: success ? 'workspace_automation_timer_cancelled' : 'workspace_automation_timer_cancel_failed',
      targetPath: timerName,
      success,
      error: success ? undefined : result?.error
    })
    window.dispatchEvent(new CustomEvent('workspace:timers-updated', { detail: result }))
    return result
  }

  const createFeishuConfirmationTask = () => {
    const targetName = activeWorkspaceFile?.name || activeWorkspaceFolder?.name || activeThread || '当前工作台'
    const taskId = `feishu-${Date.now().toString(36)}`
    const detail = `任务号：${taskId}\n等待手机端确认：${targetName}\n确认内容可包括生产完成、失败重试、审核意见、目录授权或云端同步。\n飞书回复包含“确认/通过/同意”会标记完成，包含“拒绝/取消/不通过”会标记失败。`
    createWorkspaceTask('飞书确认任务', 'feishu', 'waiting', detail, { id: taskId })
    appendAudit({
      type: 'workspace_feishu_confirmation_created',
      targetPath: targetName,
      success: true
    })
    setDraft(`创建飞书确认任务（任务号：${taskId}）：请把「${targetName}」当前需要我确认的事项整理成手机端消息，包含背景、需要确认的选项、风险和确认后要执行的动作。请让用户回复“确认 ${taskId}”或“拒绝 ${taskId}”。`)
    setActivePanel('overview')
  }

  const createBrowserReviewPrompt = (url?: string) => {
    const targetUrl = normalizeBrowserUrl(url || browserUrl)
    const prompt = targetUrl
      ? `打开并检查这个页面：${targetUrl}\n请对照当前工作台任务，检查布局、交互、加载状态、错误提示和移动端表现，给出问题清单并能修就修。`
      : '检查当前可访问的浏览器页面或本地预览，记录布局、交互、加载状态和错误提示，并给出修复建议。'
    setDraft(prompt)
    setActivePanel('overview')
  }

  const deleteProjectFolder = async (folderId: string, folderName: string) => {
    if (folderId === ROOT_FOLDER_ID) return
    if (
      !window.confirm(
        `删除「${folderName}」工作台项目？\n\n这只删除工作台记录和里面的工作台文件，不会删除你选择的本机文件夹。`
      )
    ) {
      return
    }

    const nextFolders = folders.filter((folder) => folder.id !== folderId)
    const nextFiles = workspaceFiles.filter((file) => file.folderId !== folderId)
    setFolders(nextFolders)
    setWorkspaceFiles(nextFiles)
    setSettingJSON(WORKSPACE_FOLDERS_KEY, nextFolders)
    setSettingJSON(WORKSPACE_FILES_KEY, nextFiles)
    window.dispatchEvent(
      new CustomEvent(WORKSPACE_UPDATED_EVENT, { detail: { folders: nextFolders, files: nextFiles } })
    )

    if (activeFolderId === folderId) setActiveFolderId(ROOT_FOLDER_ID)
    if (workspaceFiles.some((file) => file.folderId === folderId && file.id === activeWorkspaceFileId)) {
      setActiveWorkspaceFileId(null)
      setWorkspaceMessages([])
      publishWorkspaceAccessPolicy(null)
    }
    if (activeThread === folderName) setActiveThread('工作台')
  }

  const deleteProjectFile = async (file: WorkspaceFile, title: string) => {
    if (!file?.id) return
    if (!window.confirm(`删除「${title}」工作台文件？\n\n不会删除本机素材，也不会影响画布项目。`)) {
      return
    }

    const nextFiles = workspaceFiles.filter((item) => item.id !== file.id)
    setWorkspaceFiles(nextFiles)
    setSettingJSON(WORKSPACE_FILES_KEY, nextFiles)
    window.dispatchEvent(new CustomEvent(WORKSPACE_UPDATED_EVENT, { detail: { files: nextFiles } }))
    if (activeWorkspaceFileId === file.id) {
      setActiveWorkspaceFileId(null)
      setWorkspaceMessages([])
      publishWorkspaceAccessPolicy(null)
    }
    if (activeThread === title) setActiveThread('工作台')

    window.setTimeout(() => {
      window.api?.windowAPI?.focusFix?.()
    }, 100)
  }

  const openProjectFile = (file: WorkspaceFile, title: string) => {
    if (!file?.id) return
    const fileApprovalMode = normalizeWorkspaceApprovalMode(file.approvalMode, approvalMode)
    setActiveWorkspaceFileId(file.id)
    setActiveFolderId(file.folderId || ROOT_FOLDER_ID)
    setActiveThread(title)
    setActivePanel('overview')
    setWorkspaceMessages(file.messages || [])
    setApprovalModeState(fileApprovalMode)
    localStorage.setItem(WORKSPACE_APPROVAL_MODE_KEY, fileApprovalMode)
    publishWorkspaceAccessPolicy(file, fileApprovalMode)
  }

  const repairProjectFolderPath = async (folder: WorkspaceFolder | null | undefined) => {
    if (!folder?.id || folder.id === ROOT_FOLDER_ID) return
    const directory = await window.api?.localCacheAPI?.openDirectory?.(folder.localPath || undefined)
    if (!directory?.success || !directory.path) return
    const oldPath = folder.localPath || ''
    const newPath = directory.path
    const now = new Date().toISOString()
    const nextFolders = folders.map((item) => {
      if (item.id !== folder.id) return item
      const roots = new Set((item.allowedRoots || []).filter((root) => root && root !== oldPath))
      roots.add(newPath)
      return {
        ...item,
        name: getPathName(newPath),
        localPath: newPath,
        allowedRoots: Array.from(roots),
        updatedAt: now
      }
    })
    const nextFiles = workspaceFiles.map((file) => {
      if (file.folderId !== folder.id) return file
      const roots = new Set((file.allowedRoots || []).filter((root) => root && root !== oldPath))
      roots.add(newPath)
      return {
        ...file,
        cacheRoot: newPath,
        allowedRoots: Array.from(roots),
        updatedAt: now
      }
    })

    setFolders(nextFolders)
    setWorkspaceFiles(nextFiles)
    setSettingJSON(WORKSPACE_FOLDERS_KEY, nextFolders)
    setSettingJSON(WORKSPACE_FILES_KEY, nextFiles)
    window.dispatchEvent(new CustomEvent(WORKSPACE_UPDATED_EVENT, { detail: { folders: nextFolders, files: nextFiles } }))
    const activeFile = nextFiles.find((file) => file.id === activeWorkspaceFileId)
    if (activeFile) publishWorkspaceAccessPolicy(activeFile)
    if (activeFolderId === folder.id || activeThread === folder.name) {
      setActiveFolderId(folder.id)
      setActiveThread(getPathName(newPath))
    }
    createWorkspaceTask('修复项目目录', 'local', 'done', `${oldPath || folder.name} -> ${newPath}`)
    appendAudit({
      type: 'workspace_folder_rebound',
      sourcePath: oldPath,
      targetPath: newPath,
      success: true
    })
  }

  const exportWorkspaceHome = async () => {
    const directory = await window.api?.localCacheAPI?.openDirectory?.()
    if (!directory?.success || !directory.path) return
    const targetPath = joinWorkspacePath(directory.path, WORKSPACE_EXPORT_FILE_NAME)
    const bundle = {
      schema: 'xinghe-workspace-home-v1',
      exportedAt: new Date().toISOString(),
      folders,
      files: workspaceFiles,
      tasks: workspaceTasks,
      auditLog,
      browserTargets,
      reviewReports
    }
    const result = await window.api?.fsAPI?.writeTextFile?.({
      filePath: targetPath,
      content: JSON.stringify(bundle, null, 2),
      createDirs: true
    })
    createWorkspaceTask(
      result?.success ? '导出工作台项目' : '导出工作台失败',
      'local',
      result?.success ? 'done' : 'failed',
      result?.success ? targetPath : result?.error || '导出失败'
    )
    appendAudit({
      type: result?.success ? 'workspace_exported' : 'workspace_export_failed',
      targetPath,
      success: !!result?.success,
      error: result?.error
    })
  }

  const importWorkspaceHome = async () => {
    const directory = await window.api?.localCacheAPI?.openDirectory?.()
    if (!directory?.success || !directory.path) return
    const sourcePath = joinWorkspacePath(directory.path, WORKSPACE_EXPORT_FILE_NAME)
    const result = await window.api?.fsAPI?.readTextFile?.(sourcePath)
    if (!result?.success || !result.content) {
      createWorkspaceTask('导入工作台失败', 'local', 'failed', result?.error || `未找到 ${WORKSPACE_EXPORT_FILE_NAME}`)
      appendAudit({
        type: 'workspace_import_failed',
        targetPath: sourcePath,
        success: false,
        error: result?.error || `未找到 ${WORKSPACE_EXPORT_FILE_NAME}`
      })
      return
    }

    let bundle: any = null
    try {
      bundle = JSON.parse(result.content)
    } catch (error) {
      const message = error instanceof Error ? error.message : '导入文件解析失败'
      createWorkspaceTask('导入工作台失败', 'local', 'failed', message)
      appendAudit({ type: 'workspace_import_failed', targetPath: sourcePath, success: false, error: message })
      return
    }

    const importedFolders = Array.isArray(bundle?.folders) ? bundle.folders : []
    const importedFiles = Array.isArray(bundle?.files) ? bundle.files : []
    if (!importedFolders.length && !importedFiles.length) {
      createWorkspaceTask('导入工作台失败', 'local', 'failed', '导入文件里没有工作台项目')
      appendAudit({ type: 'workspace_import_failed', targetPath: sourcePath, success: false, error: '空工作台数据' })
      return
    }

    if (!window.confirm(`导入 ${importedFolders.length} 个项目文件夹、${importedFiles.length} 个工作台文件？\n\n同 ID 记录会以导入文件为准，本机素材不会被删除。`)) {
      return
    }

    let nextFolders = mergeWorkspaceRecords(folders, importedFolders)
    let nextFiles = mergeWorkspaceRecords(workspaceFiles, importedFiles)
    const nextTasks = mergeWorkspaceRecords(workspaceTasks, Array.isArray(bundle?.tasks) ? bundle.tasks : [])
    const importedAudit = Array.isArray(bundle?.auditLog) ? bundle.auditLog : []
    const nextBrowserTargets = mergeWorkspaceRecords(
      browserTargets,
      Array.isArray(bundle?.browserTargets) ? bundle.browserTargets : []
    )
    const nextReviewReports = mergeWorkspaceRecords(
      reviewReports,
      Array.isArray(bundle?.reviewReports) ? bundle.reviewReports : []
    )
    const importedLocalPaths = Array.from(
      new Set(
        importedFolders
          .map((folder: WorkspaceFolder) => folder?.localPath)
          .filter((path: unknown): path is string => typeof path === 'string' && path.trim().length > 0)
      )
    ) as string[]
    const directoryChecks = await Promise.all(
      importedLocalPaths.map(async (localPath) => {
        const check = await window.api?.fsAPI?.listDirectory?.(localPath)
        return { localPath, ok: !!check?.success }
      })
    )
    let missingLocalPaths: string[] = directoryChecks.filter((item) => !item.ok).map((item) => item.localPath)
    const reboundDirectories: Array<{ oldPath: string; newPath: string; folderIds: string[] }> = []
    if (
      missingLocalPaths.length &&
      window.confirm(
        `检测到 ${missingLocalPaths.length} 个导入项目目录不可访问。\n\n是否现在逐个选择新的本机目录？`
      )
    ) {
      for (const missingPath of missingLocalPaths) {
        const affectedFolders = nextFolders.filter((folder: WorkspaceFolder) => folder.localPath === missingPath)
        if (!affectedFolders.length) continue
        const directory = await window.api?.localCacheAPI?.openDirectory?.(missingPath)
        if (!directory?.success || !directory.path) continue
        const newPath = String(directory.path)
        const now = new Date().toISOString()
        const affectedFolderIds = new Set(affectedFolders.map((folder: WorkspaceFolder) => folder.id))
        nextFolders = nextFolders.map((folder: WorkspaceFolder) => {
          if (!affectedFolderIds.has(folder.id)) return folder
          const roots = new Set((folder.allowedRoots || []).filter((root) => root && root !== missingPath))
          roots.add(newPath)
          return {
            ...folder,
            name: getPathName(newPath),
            localPath: newPath,
            allowedRoots: Array.from(roots),
            updatedAt: now
          }
        })
        nextFiles = nextFiles.map((file: WorkspaceFile) => {
          if (!affectedFolderIds.has(file.folderId || '')) return file
          const roots = new Set((file.allowedRoots || []).filter((root) => root && root !== missingPath))
          roots.add(newPath)
          return {
            ...file,
            cacheRoot: file.cacheRoot === missingPath || !file.cacheRoot ? newPath : file.cacheRoot,
            allowedRoots: Array.from(roots),
            updatedAt: now
          }
        })
        reboundDirectories.push({ oldPath: missingPath, newPath, folderIds: Array.from(affectedFolderIds) })
      }
      const reboundOldPaths = new Set(reboundDirectories.map((item) => item.oldPath))
      missingLocalPaths = missingLocalPaths.filter((localPath) => !reboundOldPaths.has(localPath))
    }
    const directoryWarningTask = missingLocalPaths.length
      ? {
          id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: `导入目录待修复：${missingLocalPaths.length} 个`,
          status: 'waiting' as const,
          channel: 'local' as const,
          detail: `以下本机目录不存在或暂时不可访问，请在侧栏项目文件夹右侧使用重新绑定：\n${missingLocalPaths.join('\n')}`,
          updatedAt: new Date().toISOString()
        }
      : null
    const reboundTask = reboundDirectories.length
      ? {
          id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: `导入目录已重绑：${reboundDirectories.length} 个`,
          status: 'done' as const,
          channel: 'local' as const,
          detail: reboundDirectories.map((item) => `${item.oldPath} -> ${item.newPath}`).join('\n'),
          updatedAt: new Date().toISOString()
        }
      : null
    const auditEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      type: 'workspace_imported',
      targetPath: sourcePath,
      success: true
    }
    const directoryWarningAudit = missingLocalPaths.length
      ? {
          id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          at: new Date().toISOString(),
          type: 'workspace_import_missing_directories',
          targetPath: missingLocalPaths.join('; '),
          success: false,
          error: '导入的本机目录不存在或暂时不可访问'
        }
      : null
    const reboundAudits = reboundDirectories.map((item) => ({
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      type: 'workspace_import_directory_rebound',
      sourcePath: item.oldPath,
      targetPath: item.newPath,
      success: true
    }))
    const nextAudit = [
      ...(directoryWarningAudit ? [directoryWarningAudit] : []),
      ...reboundAudits,
      auditEntry,
      ...mergeWorkspaceRecords(auditLog, importedAudit)
    ].slice(0, 200)
    const mergedTasks = [
      ...(directoryWarningTask ? [directoryWarningTask] : []),
      ...(reboundTask ? [reboundTask] : []),
      ...nextTasks
    ].slice(0, 100)

    setFolders(nextFolders)
    setWorkspaceFiles(nextFiles)
    setWorkspaceTasks(mergedTasks)
    setAuditLog(nextAudit)
    setBrowserTargets(nextBrowserTargets.slice(0, 50))
    setReviewReports(nextReviewReports.slice(0, 50))
    setSettingJSON(WORKSPACE_FOLDERS_KEY, nextFolders)
    setSettingJSON(WORKSPACE_FILES_KEY, nextFiles)
    localStorage.setItem(WORKSPACE_TASKS_KEY, JSON.stringify(mergedTasks))
    localStorage.setItem(WORKSPACE_AUDIT_LOG_KEY, JSON.stringify(nextAudit))
    localStorage.setItem(WORKSPACE_BROWSER_TARGETS_KEY, JSON.stringify(nextBrowserTargets.slice(0, 50)))
    localStorage.setItem(WORKSPACE_REVIEW_REPORTS_KEY, JSON.stringify(nextReviewReports.slice(0, 50)))
    window.dispatchEvent(new CustomEvent(WORKSPACE_UPDATED_EVENT, { detail: { folders: nextFolders, files: nextFiles } }))
    window.dispatchEvent(new CustomEvent(`${WORKSPACE_TASKS_KEY}:updated`, { detail: mergedTasks }))
    window.dispatchEvent(new CustomEvent(`${WORKSPACE_AUDIT_LOG_KEY}:updated`, { detail: nextAudit }))
    window.dispatchEvent(new CustomEvent(`${WORKSPACE_BROWSER_TARGETS_KEY}:updated`, { detail: nextBrowserTargets.slice(0, 50) }))
    window.dispatchEvent(new CustomEvent(`${WORKSPACE_REVIEW_REPORTS_KEY}:updated`, { detail: nextReviewReports.slice(0, 50) }))
  }

  const runPrimaryAction = (id: string) => {
    if (id === 'new-folder') {
      createProjectFolder()
      return
    }
    if (id === 'new-file') {
      createProjectFile()
      return
    }
    if (id === 'production-desk') {
      void openProductionDeskPanel()
      return
    }
    if (id === 'plugins') {
      setActivePanel('plugins')
      return
    }
    if (id === 'automation') {
      setActivePanel('automation')
      return
    }
    if (id === 'feishu') {
      setSkillPanelOpen(false)
      setActivePanel('feishu')
    }
  }

  return (
    <section className="relative flex h-full w-full overflow-hidden bg-[#0b0f14] text-[#d7dde6]">
      <aside className="flex h-full w-[300px] shrink-0 flex-col border-r border-white/8 bg-[#080c11]">
        <div className="flex h-10 items-center px-4 text-white/50">
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md transition hover:bg-white/[0.07] hover:text-white"
            title="收起侧边栏"
            aria-label="收起侧边栏"
          >
            <PanelRight size={15} />
          </button>
        </div>

        <nav className="space-y-1 px-3 py-3">
          {primaryActions.map(({ id, label, icon: Icon, title }) => (
            <button
              key={id}
              type="button"
              title={title}
              onClick={() => runPrimaryAction(id)}
              className="flex h-8 w-full items-center gap-3 rounded-md px-2 text-left text-sm text-white/74 transition hover:bg-white/[0.07] hover:text-white"
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <SectionTitle>置顶</SectionTitle>
          <div className="px-2 py-2 text-sm text-white/32">暂无置顶</div>

          <SectionTitle>项目</SectionTitle>
          {projectGroups.length ? (
            projectGroups.map((workspace) => (
              <div key={workspace.id} className="mb-3">
                <div className="group/folder mb-1 flex h-8 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveFolderId(workspace.id)
                      setActiveThread(workspace.name)
                      setActivePanel('overview')
                    }}
                    title={workspace.localPath || workspace.name}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-sm transition hover:bg-white/[0.07] hover:text-white ${
                      activeWorkspaceFolder?.id === workspace.id
                        ? 'bg-white/[0.075] text-white/86'
                        : 'text-white/68'
                    }`}
                  >
                    <Folder size={15} className="shrink-0" />
                    <span className="truncate">{workspace.name}</span>
                    {workspace.localPath ? (
                      <HardDrive size={12} className="ml-auto shrink-0 text-cyan-200/45" />
                    ) : null}
                  </button>
                  {workspace.id !== ROOT_FOLDER_ID ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void repairProjectFolderPath(workspace)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/24 opacity-0 transition hover:bg-cyan-300/10 hover:text-cyan-100/72 group-hover/folder:opacity-100"
                        title="重新绑定本机目录"
                        aria-label={`重新绑定${workspace.name}目录`}
                      >
                        <Wrench size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteProjectFolder(workspace.id, workspace.name)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/28 opacity-0 transition hover:bg-rose-500/12 hover:text-rose-300 group-hover/folder:opacity-100"
                        title="删除文件夹"
                        aria-label={`删除${workspace.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  ) : null}
                </div>
                <div className="space-y-1 pl-5">
                  {workspace.threads.length ? (
                    workspace.threads.map((thread) => (
                      <ThreadButton
                        key={thread.file.id}
                        title={thread.title}
                        time={thread.time}
                        active={
                          activeWorkspaceFileId === thread.file.id || activeThread === thread.title
                        }
                        onClick={() => openProjectFile(thread.file, thread.title)}
                        onDelete={() => deleteProjectFile(thread.file, thread.title)}
                      />
                    ))
                  ) : (
                    <div className="px-2 py-1 text-sm text-white/32">暂无工作台文件</div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="px-2 py-2 text-sm text-white/32">暂无工作台项目</div>
          )}

          <SectionTitle>对话</SectionTitle>
          <div className="px-2 py-2 text-sm text-white/32">暂无聊天</div>
        </div>

        <div className="border-t border-white/8 px-3 py-3">
          <button
            type="button"
            onClick={() => {
              setSkillPanelOpen(false)
              setSettingsOpen(true)
            }}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-white/60 transition hover:bg-white/[0.07] hover:text-white"
          >
            <Settings2 size={15} />
            设置
          </button>
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center border-b border-white/6 px-5">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white/86">
              {getPanelTitle(activePanel, activeThread)}
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-white/34">
              <span className="truncate">{activeWorkspaceFolder?.name || '工作台项目'}</span>
              {activeWorkspaceFile ? (
                <>
                  <span className="text-white/18">/</span>
                  <span className="truncate text-white/46">{activeWorkspaceFile.name || '未命名工作台文件'}</span>
                </>
              ) : null}
              <span className="text-white/18">·</span>
              {activeWorkspaceFolder?.localPath || activeWorkspaceFile?.cacheRoot ? (
                <span
                  className="truncate text-cyan-100/42"
                  title={activeWorkspaceFolder?.localPath || activeWorkspaceFile?.cacheRoot || ''}
                >
                  {getPathName(activeWorkspaceFolder?.localPath || activeWorkspaceFile?.cacheRoot || '')}
                </span>
              ) : (
                <span className="text-amber-100/38">未选择本机目录</span>
              )}
            </div>
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-[900px] flex-1 flex-col overflow-y-auto px-6 pb-5 pt-10">
          {activePanel === 'overview' && (
            <OverviewPanel
              activeThread={activeThread}
              messages={workspaceMessages}
              isSending={workspaceSending}
              chatModels={chatModels}
              selectedModel={activeChatModel}
              onModelChange={setSelectedChatModel}
              planMode={planMode}
              goalMode={goalMode}
              onPlanModeChange={setPlanMode}
              onGoalModeChange={setGoalMode}
              attachments={workspaceAttachments}
              onAttachFiles={addWorkspaceFiles}
              onRemoveAttachment={removeWorkspaceAttachment}
              onOpenPlugins={() => setActivePanel('plugins')}
              draft={draft}
              setDraft={setDraft}
              sendToAssistant={sendToAssistant}
              createNode={createNode}
              setCloudAssetsOpen={setCloudAssetsOpen}
              activeWorkspaceFile={activeWorkspaceFile}
              approvalMode={approvalMode}
              setApprovalMode={setApprovalMode}
              addComputerAccessRoot={addComputerAccessRoot}
              openActiveProjectDirectory={openActiveProjectDirectory}
              setComputerAccessMode={setComputerAccessMode}
              toggleWorkspacePermission={toggleWorkspacePermission}
              saveActiveFolderAccessDefaults={saveActiveFolderAccessDefaults}
              applyActiveFolderDefaultsToFiles={applyActiveFolderDefaultsToFiles}
              indexQuery={indexQuery}
              setIndexQuery={setIndexQuery}
              indexResults={indexResults}
              rebuildWorkspaceIndex={rebuildWorkspaceIndex}
              pendingOperations={pendingOperations}
              approveOperation={approveOperation}
              rejectOperation={rejectOperation}
              browserUrl={browserUrl}
              setBrowserUrl={setBrowserUrl}
              browserTargets={browserTargets}
              openBrowserTarget={openBrowserTarget}
              inspectBrowserTarget={inspectBrowserTarget}
              startBrowserSessionTarget={startBrowserSessionTarget}
              importBrowserCookiesTarget={importBrowserCookiesTarget}
              listExternalBrowserProfilesTarget={listExternalBrowserProfilesTarget}
              importExternalBrowserProfileCookiesTarget={importExternalBrowserProfileCookiesTarget}
              removeBrowserTarget={removeBrowserTarget}
              createBrowserReviewPrompt={createBrowserReviewPrompt}
            />
          )}
          {activePanel === 'plugins' && (
            <PluginsPanel
              setSkillPanelOpen={setSkillPanelOpen}
              onInstallRecommendedSkills={installRecommendedWorkspaceSkills}
              onConnectorChange={recordWorkspaceConnectorChange}
            />
          )}
          {activePanel === 'automation' && (
            <AutomationPanel
              onCreateTemplate={createAutomationTemplateTask}
              onCreateTimer={createAutomationTimer}
              onCancelTimer={cancelAutomationTimer}
              onReplayTask={(task) => {
                setDraft(
                  [
                    `继续处理这个自动化记录：${task.name}`,
                    task.detail ? `\n记录详情：\n${task.detail}` : '',
                    `\n当前状态：${formatTaskStatus(task.status)}`
                  ]
                    .filter(Boolean)
                    .join('\n')
                )
                setActivePanel('overview')
              }}
              onRetryTask={(task) => {
                const attempt = (task.retryAttempt || 0) + 1
                const delayMinutes = Math.min(60, Math.max(5, attempt * 5))
                const nextRetryAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString()
                const detail = [
                  `重试这个失败的自动化任务：${task.name}`,
                  `尝试次数：第 ${attempt} 次`,
                  `退避时间：${delayMinutes} 分钟`,
                  task.detail ? `\n失败详情：\n${task.detail}` : '',
                  '\n请先判断是否可安全重试；如果需要访问电脑文件、浏览器或生产队列，按当前工作台权限执行。'
                ]
                  .filter(Boolean)
                  .join('\n')
                createWorkspaceTask(`重试自动化：${task.name}`, 'automation', 'waiting', detail, {
                  retryOf: task.retryOf || task.id,
                  retryAttempt: attempt,
                  retryDelayMinutes: delayMinutes,
                  nextRetryAt
                })
                appendAudit({
                  type: 'workspace_automation_retry_created',
                  targetPath: task.name,
                  success: true
                })
                setDraft(detail)
                setActivePanel('overview')
              }}
              tasks={workspaceTasks}
            />
          )}
          {activePanel === 'feishu' && (
            <FeishuPanel setSettingsOpen={setSettingsOpen} setSkillPanelOpen={setSkillPanelOpen} />
          )}
        </div>
      </main>

      {rightPanelOpen ? (
        <aside
          className="pointer-events-auto absolute z-40 hidden overflow-hidden rounded-[18px] border border-white/[0.12] bg-[#1a1f26]/92 shadow-[0_18px_54px_rgba(0,0,0,0.48),0_0_0_1px_rgba(255,255,255,0.035)_inset] backdrop-blur-2xl xl:flex xl:flex-col"
          style={{
            left: rightPanelFrame.x,
            top: rightPanelFrame.y,
            width: rightPanelFrame.width,
            height: rightPanelFrame.height
          }}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-3 py-2.5">
            <button
              type="button"
              onMouseDown={(event) => startRightPanelDrag('move', event)}
              className="min-w-0 flex-1 cursor-grab text-left active:cursor-grabbing"
              title="拖动移动面板"
            >
              <h2 className="truncate text-sm font-semibold text-white/72">
                {rightPanelMode === 'production' ? '制片台' : '工作台'}
              </h2>
            </button>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  setRightPanelMode((mode) => (mode === 'production' ? 'workspace' : 'production'))
                }
                className="flex h-6 w-6 items-center justify-center rounded-md text-white/36 transition hover:bg-white/[0.06] hover:text-white/70"
                title={rightPanelMode === 'production' ? '切到工作台' : '切到制片台'}
              >
                <SlidersHorizontal size={14} />
              </button>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="flex h-6 w-6 items-center justify-center rounded-md text-white/36 transition hover:bg-white/[0.06] hover:text-white/70"
                title="设置"
              >
                <Settings2 size={14} />
              </button>
              <button
                type="button"
                onClick={() => setRightPanelOpen(false)}
                className="flex h-6 w-6 items-center justify-center rounded-md text-white/36 transition hover:bg-white/[0.06] hover:text-white/70"
                title="收起右侧栏"
              >
                <PanelRight size={14} />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <ProjectFilesPanel
              root={visibleProjectRoot}
              files={visibleProjectFiles}
              loading={visibleProjectFilesLoading}
              error={visibleProjectFilesError}
              onRefresh={refreshVisibleProjectFiles}
            />
            {rightPanelMode === 'production' ? (
              <ProductionDesk
                activeTopicId={activeWorkspaceFile?.productionTopicId}
                onOpenTopic={(topicId) => void ensureProductionTopic(topicId as ProductionTopicId)}
              />
            ) : (
              <>
                <CollapsiblePanel
                  title="进度"
                  open={progressOpen}
                  onToggle={() => setProgressOpen(!progressOpen)}
                >
                  <ProgressList
                    isSending={workspaceSending}
                    pendingOperations={pendingOperations}
                    approveOperation={approveOperation}
                    rejectOperation={rejectOperation}
                    auditLog={auditLog}
                    materialRefs={activeWorkspaceFile?.materialRefs || []}
                    allMaterialRefs={workspaceMaterialRefs}
                    browserTargets={browserTargets}
                    reviewReports={reviewReports}
                    inspectBrowserTarget={inspectBrowserTarget}
                    startBrowserSessionTarget={startBrowserSessionTarget}
                    captureBrowserTargetEvidence={captureBrowserTargetEvidence}
                    inspectBrowserTargetDom={inspectBrowserTargetDom}
                    inspectBrowserTargetConsole={inspectBrowserTargetConsole}
                    removeBrowserTarget={removeBrowserTarget}
                    clearBrowserTargets={clearBrowserTargets}
                    setDraft={setDraft}
                  />
                </CollapsiblePanel>

                <CollapsiblePanel
                  title="任务"
                  open={tasksOpen}
                  onToggle={() => setTasksOpen(!tasksOpen)}
                >
                  <TaskList
                    tasks={workspaceTasks}
                    onCreate={createFeishuConfirmationTask}
                    onReview={() => void runWorkspaceReviewSummary()}
                  />
                </CollapsiblePanel>
              </>
            )}
          </div>
          <button
            type="button"
            onMouseDown={(event) => startRightPanelDrag('resize', event)}
            className="absolute bottom-1 right-1 h-4 w-4 cursor-nwse-resize rounded-sm text-white/24 transition hover:bg-white/[0.08] hover:text-white/50"
            title="拖动调整大小"
            aria-label="拖动调整右侧浮窗大小"
          >
            <span className="absolute bottom-1 right-1 h-2 w-2 border-b border-r border-current" />
          </button>
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => setRightPanelOpen(true)}
          className="pointer-events-auto absolute z-40 hidden h-10 w-10 items-center justify-center rounded-full border border-white/[0.12] bg-[#1a1f26]/92 text-white/56 shadow-xl backdrop-blur-2xl transition hover:bg-white/[0.08] hover:text-white xl:flex"
          style={{
            left: Math.min(
              rightPanelFrame.x + rightPanelFrame.width - 40,
              typeof window === 'undefined' ? rightPanelFrame.x : window.innerWidth - 52
            ),
            top: rightPanelFrame.y
          }}
          title="展开右侧栏"
        >
          <PanelRight size={16} />
        </button>
      )}

      {commandPaletteOpen ? (
        <CommandPalette
          onClose={() => setCommandPaletteOpen(false)}
          actions={[
            { label: '新建工作台项目', hint: '新对话', run: () => void createProjectFolder() },
            { label: '添加工作台文件', hint: '添加新对话', run: () => void createProjectFile() },
            { label: '打开制片台', hint: '生产工作区', run: () => void openProductionDeskPanel() },
            { label: '打开插件中心', hint: 'Skills / Plugins', run: () => setActivePanel('plugins') },
            { label: '打开自动化', hint: '任务模板', run: () => setActivePanel('automation') },
            { label: '飞书直连', hint: '手机协同', run: () => setActivePanel('feishu') },
            { label: '选择本机目录', hint: '电脑访问', run: () => void addComputerAccessRoot() },
            { label: '打开当前项目目录', hint: '本机文件夹', run: () => void openActiveProjectDirectory() },
            {
              label: '重新绑定当前项目目录',
              hint: activeWorkspaceFolder?.localPath || '修复目录',
              run: () => void repairProjectFolderPath(activeWorkspaceFolder)
            },
            { label: '导出工作台项目', hint: WORKSPACE_EXPORT_FILE_NAME, run: () => void exportWorkspaceHome() },
            { label: '导入工作台项目', hint: WORKSPACE_EXPORT_FILE_NAME, run: () => void importWorkspaceHome() },
            { label: '扫描工作区索引', hint: '搜索文件', run: () => void rebuildWorkspaceIndex() },
            { label: '审查当前改动', hint: 'git status / diff', run: () => void runWorkspaceReviewSummary() },
            {
              label: approvalMode === 'auto' ? '切回请求批准' : '开启完全访问',
              hint: '权限',
              run: () => setApprovalMode(approvalMode === 'auto' ? 'request' : 'auto')
            },
            {
              label: '保存当前权限为项目默认',
              hint: '新文件继承',
              run: saveActiveFolderAccessDefaults
            },
            {
              label: '套用项目默认权限',
              hint: '当前项目文件',
              run: applyActiveFolderDefaultsToFiles
            },
            {
              label: '创建浏览器检查任务',
              hint: 'URL / 页面反馈',
              run: () => void inspectBrowserTarget(browserUrl)
            }
          ]}
        />
      ) : null}
    </section>
  )
}

function OverviewPanel({
  activeThread,
  messages,
  isSending,
  chatModels,
  selectedModel,
  onModelChange,
  planMode,
  goalMode,
  onPlanModeChange,
  onGoalModeChange,
  attachments,
  onAttachFiles,
  onRemoveAttachment,
  onOpenPlugins,
  draft,
  setDraft,
  sendToAssistant,
  createNode,
  setCloudAssetsOpen,
  activeWorkspaceFile,
  approvalMode,
  setApprovalMode,
  addComputerAccessRoot,
  openActiveProjectDirectory,
  setComputerAccessMode,
  toggleWorkspacePermission,
  saveActiveFolderAccessDefaults,
  applyActiveFolderDefaultsToFiles,
  indexQuery,
  setIndexQuery,
  indexResults,
  rebuildWorkspaceIndex,
  pendingOperations,
  approveOperation,
  rejectOperation,
  browserUrl,
  setBrowserUrl,
  browserTargets,
  openBrowserTarget,
  inspectBrowserTarget,
  startBrowserSessionTarget,
  importBrowserCookiesTarget,
  listExternalBrowserProfilesTarget,
  importExternalBrowserProfileCookiesTarget,
  removeBrowserTarget,
  createBrowserReviewPrompt
}: {
  activeThread: string
  messages: WorkspaceMessage[]
  isSending: boolean
  chatModels: any[]
  selectedModel: string
  onModelChange: (value: string) => void
  planMode: boolean
  goalMode: boolean
  onPlanModeChange: (value: boolean) => void
  onGoalModeChange: (value: boolean) => void
  attachments: WorkspaceAttachment[]
  onAttachFiles: (files: FileList | File[]) => void
  onRemoveAttachment: (id: string) => void
  onOpenPlugins: () => void
  draft: string
  setDraft: (value: string) => void
  sendToAssistant: (text?: string) => void
  createNode: (type: string) => void
  setCloudAssetsOpen: (open: boolean) => void
  activeWorkspaceFile: WorkspaceFile | null
  approvalMode: 'request' | 'risky' | 'auto'
  setApprovalMode: (mode: 'request' | 'risky' | 'auto') => void
  addComputerAccessRoot: () => void
  openActiveProjectDirectory: () => void
  setComputerAccessMode: (mode: 'scoped' | 'global') => void
  toggleWorkspacePermission: (key: string) => void
  saveActiveFolderAccessDefaults: () => void
  applyActiveFolderDefaultsToFiles: () => void
  indexQuery: string
  setIndexQuery: (value: string) => void
  indexResults: WorkspaceIndexItem[]
  rebuildWorkspaceIndex: () => void
  pendingOperations: WorkspacePendingOperation[]
  approveOperation: (operation: WorkspacePendingOperation) => void
  rejectOperation: (operation: WorkspacePendingOperation) => void
  browserUrl: string
  setBrowserUrl: (value: string) => void
  browserTargets: WorkspaceBrowserTarget[]
  openBrowserTarget: (url?: string, note?: string) => void
  inspectBrowserTarget: (url?: string, note?: string) => void
  startBrowserSessionTarget: (url?: string, note?: string) => void
  importBrowserCookiesTarget: () => void
  listExternalBrowserProfilesTarget: () => void
  importExternalBrowserProfileCookiesTarget: () => void
  removeBrowserTarget: (targetId: string, closeSession?: boolean) => void
  createBrowserReviewPrompt: (url?: string) => void
}) {
  const [previewAttachment, setPreviewAttachment] = useState<WorkspaceAttachment | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const copyMessage = async (message: WorkspaceMessage) => {
    await navigator.clipboard?.writeText(message.content || '')
    setCopiedMessageId(message.id)
    window.setTimeout(() => setCopiedMessageId(null), 1600)
  }

  if (messages.length > 0) {
    return (
      <>
        <div className="relative flex min-h-full w-full flex-1 flex-col">
          <div className="mx-auto flex w-full max-w-[840px] flex-1 flex-col">
            <div className="flex-1 space-y-7 pb-44 pt-3">
              {messages.map((message, index) =>
                message.role === 'user' ? (
                  <div key={message.id} className="flex justify-end">
                    <div className="group/message max-w-[72%] rounded-2xl bg-white/[0.075] px-4 py-3 text-sm leading-6 text-white/82 shadow-xl shadow-black/10">
                      <div className="whitespace-pre-wrap">{message.content}</div>
                      {message.attachments?.length ? (
                        <AttachmentStrip
                          attachments={message.attachments}
                          onRemove={null}
                          onPreview={setPreviewAttachment}
                        />
                      ) : null}
                      <div className="mt-2 flex justify-end opacity-0 transition group-hover/message:opacity-100">
                        <button
                          type="button"
                          onClick={() => void copyMessage(message)}
                          className="flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-white/30 transition hover:bg-white/[0.06] hover:text-white/70"
                        >
                          {copiedMessageId === message.id ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                          <span>{copiedMessageId === message.id ? '已复制' : '复制'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <article
                    key={message.id}
                    className={`${index === 0 ? '' : 'border-t border-white/[0.055]'} pt-5`}
                  >
                    <div className="mb-4 flex items-center justify-between gap-3 text-xs text-white/36">
                      <button
                        type="button"
                        className="flex items-center gap-1.5 rounded px-1 py-0.5 text-left transition hover:bg-white/[0.045] hover:text-white/58"
                      >
                        <span>已处理 {formatElapsed(message.elapsedMs)}</span>
                        <span className="text-white/22">›</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void copyMessage(message)}
                        className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-white/30 transition hover:bg-white/[0.06] hover:text-white/70"
                      >
                        {copiedMessageId === message.id ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                        <span>{copiedMessageId === message.id ? '已复制' : '复制'}</span>
                      </button>
                    </div>
                    <MarkdownMessage content={message.content} isError={message.isError} />
                    <WorkspaceToolCallTrace toolCalls={message.toolCalls} />
                  </article>
                )
              )}
            {isSending ? (
              <article className="border-t border-white/[0.055] pt-5">
                <WorkspaceSendingSteps />
              </article>
            ) : null}
            </div>

            <div className="sticky bottom-5 z-30 mt-6 flex justify-center px-2">
              <WorkspaceComposer
                draft={draft}
                setDraft={setDraft}
                sendToAssistant={sendToAssistant}
                createNode={createNode}
                setCloudAssetsOpen={setCloudAssetsOpen}
                chatModels={chatModels}
                selectedModel={selectedModel}
                onModelChange={onModelChange}
                planMode={planMode}
                goalMode={goalMode}
                onPlanModeChange={onPlanModeChange}
                onGoalModeChange={onGoalModeChange}
                attachments={attachments}
                onAttachFiles={onAttachFiles}
                onRemoveAttachment={onRemoveAttachment}
                onOpenPlugins={onOpenPlugins}
                disabled={isSending}
                activeWorkspaceFile={activeWorkspaceFile}
                approvalMode={approvalMode}
                setApprovalMode={setApprovalMode}
                addComputerAccessRoot={addComputerAccessRoot}
                openActiveProjectDirectory={openActiveProjectDirectory}
                setComputerAccessMode={setComputerAccessMode}
                toggleWorkspacePermission={toggleWorkspacePermission}
                saveActiveFolderAccessDefaults={saveActiveFolderAccessDefaults}
                applyActiveFolderDefaultsToFiles={applyActiveFolderDefaultsToFiles}
                indexQuery={indexQuery}
                setIndexQuery={setIndexQuery}
                indexResults={indexResults}
                rebuildWorkspaceIndex={rebuildWorkspaceIndex}
                pendingOperations={pendingOperations}
                approveOperation={approveOperation}
                rejectOperation={rejectOperation}
                browserUrl={browserUrl}
                setBrowserUrl={setBrowserUrl}
                browserTargets={browserTargets}
                openBrowserTarget={openBrowserTarget}
                inspectBrowserTarget={inspectBrowserTarget}
                startBrowserSessionTarget={startBrowserSessionTarget}
                importBrowserCookiesTarget={importBrowserCookiesTarget}
                listExternalBrowserProfilesTarget={listExternalBrowserProfilesTarget}
                importExternalBrowserProfileCookiesTarget={importExternalBrowserProfileCookiesTarget}
                removeBrowserTarget={removeBrowserTarget}
                createBrowserReviewPrompt={createBrowserReviewPrompt}
              />
            </div>
          </div>
        </div>
        {previewAttachment ? (
          <AttachmentPreview attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
        ) : null}
      </>
    )
  }

  return (
    <div className="relative flex min-h-full flex-1 flex-col items-center justify-center px-6 pb-[12vh]">
      <h1 className="relative z-10 mb-7 text-center text-[22px] font-semibold leading-8 text-white/78">
        我们要在 {activeThread || '工作台'} 里做什么？
      </h1>

      <WorkspaceComposer
        draft={draft}
        setDraft={setDraft}
        sendToAssistant={sendToAssistant}
        createNode={createNode}
        setCloudAssetsOpen={setCloudAssetsOpen}
        chatModels={chatModels}
        selectedModel={selectedModel}
        onModelChange={onModelChange}
        planMode={planMode}
        goalMode={goalMode}
        onPlanModeChange={onPlanModeChange}
        onGoalModeChange={onGoalModeChange}
        attachments={attachments}
        onAttachFiles={onAttachFiles}
        onRemoveAttachment={onRemoveAttachment}
        onOpenPlugins={onOpenPlugins}
        disabled={isSending}
        activeWorkspaceFile={activeWorkspaceFile}
        approvalMode={approvalMode}
        setApprovalMode={setApprovalMode}
        addComputerAccessRoot={addComputerAccessRoot}
        openActiveProjectDirectory={openActiveProjectDirectory}
        setComputerAccessMode={setComputerAccessMode}
        toggleWorkspacePermission={toggleWorkspacePermission}
        saveActiveFolderAccessDefaults={saveActiveFolderAccessDefaults}
        applyActiveFolderDefaultsToFiles={applyActiveFolderDefaultsToFiles}
        indexQuery={indexQuery}
        setIndexQuery={setIndexQuery}
        indexResults={indexResults}
        rebuildWorkspaceIndex={rebuildWorkspaceIndex}
        pendingOperations={pendingOperations}
        approveOperation={approveOperation}
        rejectOperation={rejectOperation}
        browserUrl={browserUrl}
        setBrowserUrl={setBrowserUrl}
        browserTargets={browserTargets}
        openBrowserTarget={openBrowserTarget}
        inspectBrowserTarget={inspectBrowserTarget}
        startBrowserSessionTarget={startBrowserSessionTarget}
        importBrowserCookiesTarget={importBrowserCookiesTarget}
        listExternalBrowserProfilesTarget={listExternalBrowserProfilesTarget}
        importExternalBrowserProfileCookiesTarget={importExternalBrowserProfileCookiesTarget}
        removeBrowserTarget={removeBrowserTarget}
        createBrowserReviewPrompt={createBrowserReviewPrompt}
      />
    </div>
  )
}

function WorkspaceComposer({
  draft,
  setDraft,
  sendToAssistant,
  createNode,
  setCloudAssetsOpen,
  chatModels,
  selectedModel,
  onModelChange,
  planMode,
  goalMode,
  onPlanModeChange,
  onGoalModeChange,
  attachments,
  onAttachFiles,
  onRemoveAttachment,
  onOpenPlugins,
  disabled,
  activeWorkspaceFile,
  approvalMode,
  setApprovalMode,
  addComputerAccessRoot,
  openActiveProjectDirectory,
  setComputerAccessMode,
  toggleWorkspacePermission,
  saveActiveFolderAccessDefaults,
  applyActiveFolderDefaultsToFiles,
  indexQuery,
  setIndexQuery,
  indexResults,
  rebuildWorkspaceIndex,
  pendingOperations,
  approveOperation,
  rejectOperation,
  browserUrl,
  setBrowserUrl,
  browserTargets,
  openBrowserTarget,
  inspectBrowserTarget,
  startBrowserSessionTarget,
  importBrowserCookiesTarget,
  listExternalBrowserProfilesTarget,
  importExternalBrowserProfileCookiesTarget,
  removeBrowserTarget,
  createBrowserReviewPrompt
}: {
  draft: string
  setDraft: (value: string) => void
  sendToAssistant: (text?: string) => void
  createNode: (type: string) => void
  setCloudAssetsOpen: (open: boolean) => void
  chatModels: any[]
  selectedModel: string
  onModelChange: (value: string) => void
  planMode: boolean
  goalMode: boolean
  onPlanModeChange: (value: boolean) => void
  onGoalModeChange: (value: boolean) => void
  attachments: WorkspaceAttachment[]
  onAttachFiles: (files: FileList | File[]) => void
  onRemoveAttachment: (id: string) => void
  onOpenPlugins: () => void
  disabled?: boolean
  activeWorkspaceFile: WorkspaceFile | null
  approvalMode: 'request' | 'risky' | 'auto'
  setApprovalMode: (mode: 'request' | 'risky' | 'auto') => void
  addComputerAccessRoot: () => void
  openActiveProjectDirectory: () => void
  setComputerAccessMode: (mode: 'scoped' | 'global') => void
  toggleWorkspacePermission: (key: string) => void
  saveActiveFolderAccessDefaults: () => void
  applyActiveFolderDefaultsToFiles: () => void
  indexQuery: string
  setIndexQuery: (value: string) => void
  indexResults: WorkspaceIndexItem[]
  rebuildWorkspaceIndex: () => void
  pendingOperations: WorkspacePendingOperation[]
  approveOperation: (operation: WorkspacePendingOperation) => void
  rejectOperation: (operation: WorkspacePendingOperation) => void
  browserUrl: string
  setBrowserUrl: (value: string) => void
  browserTargets: WorkspaceBrowserTarget[]
  openBrowserTarget: (url?: string, note?: string) => void
  inspectBrowserTarget: (url?: string, note?: string) => void
  startBrowserSessionTarget: (url?: string, note?: string) => void
  importBrowserCookiesTarget: () => void
  listExternalBrowserProfilesTarget: () => void
  importExternalBrowserProfileCookiesTarget: () => void
  removeBrowserTarget: (targetId: string, closeSession?: boolean) => void
  createBrowserReviewPrompt: (url?: string) => void
}) {
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [accessMenuOpen, setAccessMenuOpen] = useState(false)
  const [previewAttachment, setPreviewAttachment] = useState<WorkspaceAttachment | null>(null)
  const attachmentInputRef = useRef<HTMLInputElement | null>(null)
  const speech = useSpeechRecognitionInput({
    value: draft,
    onChange: setDraft,
    disabled
  })
  const selectedConfig =
    chatModels.find((config) => config.id === selectedModel) || chatModels[0] || null
  const selectedModelLabel =
    selectedConfig?.modelName || selectedConfig?.name || selectedConfig?.id || '选择模型'

  return (
    <div
      className="relative z-30 w-full max-w-[620px] self-center overflow-visible rounded-[18px] border border-white/[0.14] bg-[#20252d]/90 p-2.5 shadow-[0_20px_64px_rgba(0,0,0,0.52),0_0_0_1px_rgba(255,255,255,0.03)_inset] backdrop-blur-2xl"
      onPaste={(event) => {
        const files = Array.from(event.clipboardData?.files || [])
        if (!files.length) return
        event.preventDefault()
        void onAttachFiles(files)
      }}
      onDragOver={(event) => {
        event.preventDefault()
      }}
      onDrop={(event) => {
        const files = Array.from(event.dataTransfer?.files || [])
        if (!files.length) return
        event.preventDefault()
        void onAttachFiles(files)
      }}
    >
      {attachments.length ? (
        <AttachmentStrip
          attachments={attachments}
          onRemove={onRemoveAttachment}
          onPreview={setPreviewAttachment}
        />
      ) : null}
      <textarea
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            sendToAssistant()
          }
        }}
        className="h-[58px] w-full resize-none bg-transparent px-1 text-sm leading-6 text-white outline-none placeholder:text-white/30 disabled:opacity-60"
        placeholder="输入任务，或粘贴图片、音频、视频、文件..."
      />
      {draft.trim().startsWith('/') ? (
        <div className="mb-2 grid gap-1 rounded-lg border border-white/[0.08] bg-black/10 p-1.5">
          {slashCommands
            .filter((item) =>
              `${item.label} ${item.desc}`.toLowerCase().includes(draft.trim().toLowerCase())
            )
            .slice(0, 5)
            .map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => setDraft(item.prompt)}
                className="flex h-8 items-center justify-between rounded-md px-2 text-left transition hover:bg-white/[0.06]"
              >
                <span className="text-xs font-medium text-white/72">{item.label}</span>
                <span className="text-xs text-white/38">{item.desc}</span>
              </button>
            ))}
        </div>
      ) : null}
      <div className="flex h-9 items-center justify-between border-t border-white/[0.07] pt-2.5">
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-white/45">
          <div className="relative">
            <button
              type="button"
              onClick={() => setAttachMenuOpen((open) => !open)}
              className="flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-white/[0.07] hover:text-white"
              title="添加和工具"
            >
              <Paperclip size={13} />
            </button>
            {attachMenuOpen ? (
              <div className="absolute bottom-10 left-0 z-30 w-44 rounded-lg border border-white/[0.1] bg-[#171c23] p-1.5 text-xs shadow-2xl shadow-black/40">
                <button
                  type="button"
                  onClick={() => attachmentInputRef.current?.click()}
                  className="flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-white/70 transition hover:bg-white/[0.07] hover:text-white"
                >
                  <Paperclip size={13} />
                  添加照片和文件
                </button>
                <input
                  ref={attachmentInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept="image/*,audio/*,video/*,.txt,.md,.json,.csv,.srt,.pdf,.doc,.docx,.xls,.xlsx"
                  onChange={(event) => {
                    if (event.target.files) void onAttachFiles(event.target.files)
                    event.target.value = ''
                    setAttachMenuOpen(false)
                  }}
                />
                <MenuToggle
                  label="计划模式"
                  checked={planMode}
                  onChange={() => onPlanModeChange(!planMode)}
                />
                <MenuToggle
                  label="追求目标"
                  checked={goalMode}
                  onChange={() => onGoalModeChange(!goalMode)}
                />
                <button
                  type="button"
                  onClick={() => {
                    setAttachMenuOpen(false)
                    onOpenPlugins()
                  }}
                  className="flex h-8 w-full items-center justify-between rounded-md px-2.5 text-left text-white/70 transition hover:bg-white/[0.07] hover:text-white"
                >
                  <span className="flex items-center gap-2">
                    <Puzzle size={13} />
                    插件
                  </span>
                  <span className="text-white/30">›</span>
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={speech.toggle}
            disabled={disabled || speech.isProcessing || !speech.supported}
            className={`flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.08] transition disabled:cursor-not-allowed disabled:opacity-40 ${
              speech.isListening || speech.isProcessing
                ? 'bg-cyan-300/18 text-cyan-100 shadow-[0_0_0_3px_rgba(125,211,252,0.13)]'
                : 'bg-white/[0.035] text-white/55 hover:bg-white/[0.07] hover:text-white'
            }`}
            title={getSpeechInputTitle(speech)}
            aria-label={getSpeechInputTitle(speech)}
          >
            <Mic size={14} />
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setModelMenuOpen((open) => !open)}
              className="flex h-8 max-w-[178px] items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.045] px-3 text-xs text-white/68 outline-none transition hover:bg-white/[0.075] hover:text-white"
              title="切换文本模型"
            >
              <span className="truncate">{selectedModelLabel}</span>
              <span className="shrink-0 text-[10px] text-white/38">▾</span>
            </button>
            {modelMenuOpen ? (
              <div className="absolute bottom-10 right-0 z-30 max-h-60 min-w-[190px] overflow-y-auto rounded-lg border border-white/[0.1] bg-[#171c23] p-1.5 shadow-2xl shadow-black/40">
                {chatModels.length ? (
                  chatModels.map((model) => {
                    const label = model.modelName || model.name || model.id
                    const active = model.id === selectedConfig?.id
                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => {
                          onModelChange(model.id)
                          setModelMenuOpen(false)
                        }}
                        className={`flex h-8 w-full items-center justify-between gap-3 rounded-md px-2.5 text-left text-xs transition ${
                          active
                            ? 'bg-white/[0.11] text-white'
                            : 'text-white/62 hover:bg-white/[0.07] hover:text-white'
                        }`}
                      >
                        <span className="min-w-0 truncate">{label}</span>
                        {active ? <span className="shrink-0 text-cyan-200/70">●</span> : null}
                      </button>
                    )
                  })
                ) : (
                  <div className="px-2.5 py-2 text-xs text-white/38">暂无文本模型</div>
                )}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => sendToAssistant()}
            disabled={disabled || (!draft.trim() && attachments.length === 0)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-950 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
            aria-label="发送"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
      <WorkspaceQuickControls
        activeWorkspaceFile={activeWorkspaceFile}
        approvalMode={approvalMode}
        setApprovalMode={setApprovalMode}
        addComputerAccessRoot={addComputerAccessRoot}
        openActiveProjectDirectory={openActiveProjectDirectory}
        setComputerAccessMode={setComputerAccessMode}
        toggleWorkspacePermission={toggleWorkspacePermission}
        saveActiveFolderAccessDefaults={saveActiveFolderAccessDefaults}
        applyActiveFolderDefaultsToFiles={applyActiveFolderDefaultsToFiles}
        indexQuery={indexQuery}
        setIndexQuery={setIndexQuery}
        indexResults={indexResults}
        rebuildWorkspaceIndex={rebuildWorkspaceIndex}
        pendingOperations={pendingOperations}
        approveOperation={approveOperation}
        rejectOperation={rejectOperation}
        browserUrl={browserUrl}
        setBrowserUrl={setBrowserUrl}
        browserTargets={browserTargets}
        openBrowserTarget={openBrowserTarget}
        inspectBrowserTarget={inspectBrowserTarget}
        startBrowserSessionTarget={startBrowserSessionTarget}
        importBrowserCookiesTarget={importBrowserCookiesTarget}
        listExternalBrowserProfilesTarget={listExternalBrowserProfilesTarget}
        importExternalBrowserProfileCookiesTarget={importExternalBrowserProfileCookiesTarget}
        removeBrowserTarget={removeBrowserTarget}
        createBrowserReviewPrompt={createBrowserReviewPrompt}
        open={accessMenuOpen}
        setOpen={setAccessMenuOpen}
      />
      {previewAttachment ? (
        <AttachmentPreview attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
      ) : null}
    </div>
  )
}

function WorkspaceQuickControls({
  activeWorkspaceFile,
  approvalMode,
  setApprovalMode,
  addComputerAccessRoot,
  openActiveProjectDirectory,
  setComputerAccessMode,
  toggleWorkspacePermission,
  saveActiveFolderAccessDefaults,
  applyActiveFolderDefaultsToFiles,
  indexQuery,
  setIndexQuery,
  indexResults,
  rebuildWorkspaceIndex,
  pendingOperations,
  approveOperation,
  rejectOperation,
  browserUrl,
  setBrowserUrl,
  browserTargets,
  openBrowserTarget,
  inspectBrowserTarget,
  startBrowserSessionTarget,
  importBrowserCookiesTarget,
  listExternalBrowserProfilesTarget,
  importExternalBrowserProfileCookiesTarget,
  removeBrowserTarget,
  createBrowserReviewPrompt,
  open,
  setOpen
}: {
  activeWorkspaceFile: WorkspaceFile | null
  approvalMode: 'request' | 'risky' | 'auto'
  setApprovalMode: (mode: 'request' | 'risky' | 'auto') => void
  addComputerAccessRoot: () => void
  openActiveProjectDirectory: () => void
  setComputerAccessMode: (mode: 'scoped' | 'global') => void
  toggleWorkspacePermission: (key: string) => void
  saveActiveFolderAccessDefaults: () => void
  applyActiveFolderDefaultsToFiles: () => void
  indexQuery: string
  setIndexQuery: (value: string) => void
  indexResults: WorkspaceIndexItem[]
  rebuildWorkspaceIndex: () => void
  pendingOperations: WorkspacePendingOperation[]
  approveOperation: (operation: WorkspacePendingOperation) => void
  rejectOperation: (operation: WorkspacePendingOperation) => void
  browserUrl: string
  setBrowserUrl: (value: string) => void
  browserTargets: WorkspaceBrowserTarget[]
  openBrowserTarget: (url?: string, note?: string) => void
  inspectBrowserTarget: (url?: string, note?: string) => void
  startBrowserSessionTarget: (url?: string, note?: string) => void
  importBrowserCookiesTarget: () => void
  listExternalBrowserProfilesTarget: () => void
  importExternalBrowserProfileCookiesTarget: () => void
  removeBrowserTarget: (targetId: string, closeSession?: boolean) => void
  createBrowserReviewPrompt: (url?: string) => void
  open: boolean
  setOpen: (value: boolean) => void
}) {
  const roots = getWorkspaceAccessRoots(activeWorkspaceFile)
  const permissions = getWorkspacePermissions(activeWorkspaceFile)
  const pendingItems = pendingOperations.filter((item) => item.status === 'pending').slice(0, 3)
  const approvalLabel =
    approvalMode === 'auto' ? '完全访问' : approvalMode === 'risky' ? '帮我批准' : '请求批准'

  return (
    <div className="relative mt-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-white/[0.07] bg-black/[0.18] px-2 py-1.5 text-xs text-white/50 shadow-inner shadow-black/20">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-7 items-center gap-1.5 rounded-md px-2 text-amber-300/90 transition hover:bg-white/[0.06] hover:text-amber-200"
      >
        <ShieldCheck size={13} />
        <span>{approvalLabel}</span>
        <span className="text-[10px] text-white/32">⌄</span>
      </button>
      <button
        type="button"
        onClick={addComputerAccessRoot}
        className="flex h-7 items-center gap-1.5 rounded-md px-2 transition hover:bg-white/[0.06] hover:text-white/78"
      >
        <Folder size={13} />
        <span>{roots.length ? `${roots.length} 个目录` : '选择目录'}</span>
      </button>
      {roots.length ? (
        <button
          type="button"
          onClick={openActiveProjectDirectory}
          className="flex h-7 items-center gap-1.5 rounded-md px-2 transition hover:bg-white/[0.06] hover:text-white/78"
        >
          <ExternalLink size={12} />
          <span>打开</span>
        </button>
      ) : null}
      <button
        type="button"
        onClick={() =>
          setComputerAccessMode(activeWorkspaceFile?.accessMode === 'global' ? 'scoped' : 'global')
        }
        className={`flex h-7 items-center gap-1.5 rounded-md px-2 transition hover:bg-white/[0.06] ${
          activeWorkspaceFile?.accessMode === 'global' ? 'text-cyan-200/85' : 'hover:text-white/78'
        }`}
      >
        <HardDrive size={13} />
        <span>{activeWorkspaceFile?.accessMode === 'global' ? '全局电脑' : '目录范围'}</span>
      </button>
      <div className="ml-auto flex h-7 min-w-[180px] items-center gap-1.5 rounded-md bg-white/[0.045] px-2">
        <Search size={12} className="shrink-0 text-white/32" />
        <input
          value={indexQuery}
          onChange={(event) => setIndexQuery(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-xs text-white/70 outline-none placeholder:text-white/28"
          placeholder="搜索目录..."
        />
        <button
          type="button"
          onClick={rebuildWorkspaceIndex}
          className="shrink-0 text-[11px] text-white/36 transition hover:text-white/75"
        >
          扫描
        </button>
      </div>

      <div className="flex h-7 min-w-[240px] flex-1 items-center gap-1.5 rounded-md bg-white/[0.045] px-2">
        <Globe2 size={12} className="shrink-0 text-white/32" />
        <input
          value={browserUrl}
          onChange={(event) => setBrowserUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void inspectBrowserTarget(browserUrl, 'composer-url')
          }}
          className="min-w-0 flex-1 bg-transparent text-xs text-white/70 outline-none placeholder:text-white/28"
          placeholder="输入 URL 或 localhost..."
        />
        <button
          type="button"
          onClick={() => openBrowserTarget(browserUrl, 'composer-url')}
          className="shrink-0 text-[11px] text-white/36 transition hover:text-white/75"
        >
          打开
        </button>
        <button
          type="button"
          onClick={() => inspectBrowserTarget(browserUrl, 'composer-url')}
          className="shrink-0 text-[11px] text-cyan-200/58 transition hover:text-cyan-100"
        >
          检查
        </button>
        <button
          type="button"
          onClick={() => startBrowserSessionTarget(browserUrl, 'composer-session')}
          className="shrink-0 text-[11px] text-cyan-100/52 transition hover:text-cyan-50"
        >
          会话
        </button>
        <button
          type="button"
          onClick={importBrowserCookiesTarget}
          className="shrink-0 text-[11px] text-cyan-100/52 transition hover:text-cyan-50"
        >
          导入
        </button>
        <button
          type="button"
          onClick={listExternalBrowserProfilesTarget}
          className="shrink-0 text-[11px] text-white/34 transition hover:text-white/72"
        >
          Profiles
        </button>
        <button
          type="button"
          onClick={importExternalBrowserProfileCookiesTarget}
          className="shrink-0 text-[11px] text-cyan-100/52 transition hover:text-cyan-50"
        >
          直读
        </button>
      </div>

      {open ? (
        <div className="absolute bottom-9 left-0 z-30 w-[360px] rounded-lg border border-white/[0.1] bg-[#171c23] p-2 shadow-2xl shadow-black/45">
          <div className="mb-1 px-2 py-1 text-xs text-white/44">审批方式</div>
          {[
            ['request', '请求批准', '关键操作先问我'],
            ['risky', '帮我批准', '只拦高风险'],
            ['auto', '完全访问', '按任务直接执行']
          ].map(([mode, title, desc]) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setApprovalMode(mode as 'request' | 'risky' | 'auto')
                setOpen(false)
              }}
              className={`flex w-full gap-2 rounded-md px-2 py-2 text-left transition ${
                approvalMode === mode ? 'bg-white/[0.08]' : 'hover:bg-white/[0.055]'
              }`}
            >
              <ShieldCheck size={14} className="mt-0.5 shrink-0 text-white/42" />
              <span>
                <span className="block text-xs font-medium text-white/78">{title}</span>
                <span className="block text-[11px] leading-4 text-white/38">{desc}</span>
              </span>
            </button>
          ))}
          <div className="mt-2 grid grid-cols-4 gap-1 border-t border-white/[0.06] pt-2">
            {[
              ['read', '读'],
              ['write', '写'],
              ['delete', '删'],
              ['command', '命令']
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleWorkspacePermission(key)}
                className={`h-7 rounded-md text-[11px] transition ${
                  permissions[key]
                    ? 'bg-cyan-300/12 text-cyan-100/80'
                    : 'bg-white/[0.04] text-white/34'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1 border-t border-white/[0.06] pt-2">
            <button
              type="button"
              onClick={() => {
                saveActiveFolderAccessDefaults()
                setOpen(false)
              }}
              className="h-7 rounded-md bg-white/[0.04] text-[11px] text-white/56 transition hover:bg-white/[0.08] hover:text-white/82"
            >
              设为默认
            </button>
            <button
              type="button"
              onClick={() => {
                applyActiveFolderDefaultsToFiles()
                setOpen(false)
              }}
              className="h-7 rounded-md bg-white/[0.04] text-[11px] text-white/56 transition hover:bg-white/[0.08] hover:text-white/82"
            >
              套用项目
            </button>
          </div>
          {pendingItems.length ? (
            <div className="mt-2 space-y-1 border-t border-white/[0.06] pt-2">
              <div className="px-2 py-1 text-[11px] text-white/38">待批准操作</div>
              {pendingItems.map((operation) => (
                <div key={operation.id} className="rounded-md bg-white/[0.04] p-2">
                  <div className="truncate text-[11px] text-white/68">
                    {formatOperationName(operation.operation)}
                  </div>
                  <div className="truncate text-[10px] text-white/34">
                    {operation.targetPath || operation.command || operation.sourcePath}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-amber-100/48">
                    {formatOperationRiskReason(operation.operation)}
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => approveOperation(operation)}
                      className="h-6 flex-1 rounded bg-emerald-400/12 text-[11px] text-emerald-100/80 hover:bg-emerald-400/18"
                    >
                      通过
                    </button>
                    <button
                      type="button"
                      onClick={() => rejectOperation(operation)}
                      className="h-6 flex-1 rounded bg-rose-400/12 text-[11px] text-rose-100/80 hover:bg-rose-400/18"
                    >
                      拒绝
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {indexQuery.trim() && indexResults.length ? (
            <div className="mt-2 max-h-32 overflow-y-auto border-t border-white/[0.06] pt-2">
              {indexResults.slice(0, 6).map((item) => (
                <div key={item.path} className="truncate px-2 py-1 text-[11px] text-white/42">
                  {item.path}
                </div>
              ))}
            </div>
          ) : null}
          {browserTargets.length ? (
            <div className="mt-2 max-h-32 overflow-y-auto border-t border-white/[0.06] pt-2">
              <div className="px-2 py-1 text-[11px] text-white/38">最近浏览器目标</div>
              {browserTargets.slice(0, 4).map((target) => (
                <div
                  key={target.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded transition hover:bg-white/[0.05]"
                >
                  <button
                    type="button"
                    onClick={() => openBrowserTarget(target.url, 'recent-target')}
                    className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-2 py-1.5 text-left text-[11px] text-white/42 transition hover:text-white/68"
                  >
                    <ExternalLink size={11} className="shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate">{target.title || target.url}</span>
                      <span className="block truncate text-[10px] text-white/28">
                        {target.formSummary ||
                          target.annotationSummary ||
                          target.sessionSummary ||
                          target.viewportSummary ||
                          target.domSummary ||
                          target.action ||
                          target.url}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                        target.error
                          ? 'bg-rose-400/10 text-rose-200/70'
                          : target.httpStatus
                            ? 'bg-cyan-300/10 text-cyan-100/68'
                            : 'bg-white/[0.05] text-white/28'
                      }`}
                    >
                      {target.error
                        ? '失败'
                        : target.screenshotPath
                          ? `截图 ${target.httpStatus || ''}`.trim()
                          : target.httpStatus || target.status}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeBrowserTarget(target.id, !!target.sessionId)}
                    className="mr-1 flex h-6 w-6 items-center justify-center rounded text-white/24 transition hover:bg-rose-400/10 hover:text-rose-200/70"
                    title={target.sessionId ? '关闭会话并移除记录' : '移除记录'}
                    aria-label="移除浏览器记录"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function AttachmentStrip({
  attachments,
  onRemove,
  onPreview,
  compact = false
}: {
  attachments: WorkspaceAttachment[]
  onRemove: ((id: string) => void) | null
  onPreview?: (attachment: WorkspaceAttachment) => void
  compact?: boolean
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${compact ? 'mt-2' : 'mb-2'}`}>
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          onClick={() => onPreview?.(attachment)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            onPreview?.(attachment)
          }}
          className={`group/attachment relative overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.045] text-left text-white/62 transition hover:border-white/18 hover:bg-white/[0.07] ${
            compact ? 'h-9 max-w-[220px] px-2' : 'h-[72px] w-[138px]'
          }`}
          title={attachment.path || attachment.name}
        >
          {compact ? (
            <span className="flex h-full items-center gap-1.5 text-[11px]">
              <Paperclip size={12} className="shrink-0 text-cyan-200/70" />
              <span className="truncate">{attachment.name}</span>
              {attachment.summary ? (
                <span className="shrink-0 text-white/32">{attachment.summary}</span>
              ) : null}
            </span>
          ) : (
            <AttachmentThumb attachment={attachment} />
          )}
          {onRemove ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onRemove(attachment.id)
              }}
              className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white/60 opacity-0 transition hover:text-white group-hover/attachment:opacity-100"
              aria-label={`移除${attachment.name}`}
            >
              <X size={12} />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function AttachmentThumb({ attachment }: { attachment: WorkspaceAttachment }) {
  const source = attachment.content || attachment.cachedUrl || ''
  if (attachment.isImage && source) {
    return (
      <>
        <img src={source} alt={attachment.name} className="h-full w-full object-cover" />
        <AttachmentThumbLabel attachment={attachment} />
      </>
    )
  }
  if (attachment.isVideo && source) {
    return (
      <>
        <video src={source} className="h-full w-full object-cover" muted preload="metadata" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <Video size={18} className="text-white/85" />
        </div>
        <AttachmentThumbLabel attachment={attachment} />
      </>
    )
  }
  if (attachment.isAudio) {
    return (
      <div className="flex h-full flex-col justify-between p-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-cyan-300/12 text-cyan-100">
          <FileText size={15} />
        </div>
        <AttachmentThumbLabel attachment={attachment} plain />
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col justify-between p-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white/[0.07] text-white/62">
        <Paperclip size={15} />
      </div>
      <AttachmentThumbLabel attachment={attachment} plain />
    </div>
  )
}

function AttachmentThumbLabel({
  attachment,
  plain = false
}: {
  attachment: WorkspaceAttachment
  plain?: boolean
}) {
  const source = attachment.content || attachment.cachedUrl || ''
  return (
    <div
      className={`absolute inset-x-0 bottom-0 px-2 py-1.5 ${
        plain ? '' : 'bg-gradient-to-t from-black/75 to-transparent'
      }`}
    >
      <div className="truncate text-[11px] font-medium text-white/86">{attachment.name}</div>
      {attachment.summary ? <div className="text-[10px] text-white/45">{attachment.summary}</div> : null}
    </div>
  )
}

function AttachmentPreview({
  attachment,
  onClose
}: {
  attachment: WorkspaceAttachment
  onClose: () => void
}) {
  const source = attachment.content || attachment.cachedUrl || ''
  return (
    <div className="fixed inset-0 z-[100002] flex items-center justify-center bg-black/72 p-8">
      <div className="relative max-h-full max-w-5xl overflow-hidden rounded-xl border border-white/10 bg-[#11161d] shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white/70 transition hover:text-white"
          aria-label="关闭预览"
        >
          <X size={14} />
        </button>
        <div className="max-h-[78vh] max-w-[82vw] p-4">
          {attachment.isImage && source ? (
            <img src={source} alt={attachment.name} className="max-h-[70vh] max-w-full object-contain" />
          ) : attachment.isVideo && source ? (
            <video src={source} className="max-h-[70vh] max-w-full" controls autoPlay />
          ) : attachment.isAudio && source ? (
            <div className="w-[520px] max-w-[70vw] p-5">
              <div className="mb-4 text-sm font-semibold text-white/82">{attachment.name}</div>
              <audio src={source} controls className="w-full" />
            </div>
          ) : attachment.isPDF && source ? (
            <div className="h-[72vh] w-[76vw] max-w-5xl overflow-hidden rounded-lg bg-black/20">
              <iframe src={source} title={attachment.name} className="h-full w-full border-0" />
            </div>
          ) : attachment.textContent || (attachment.content && !attachment.content.startsWith('data:')) ? (
            <div className="w-[720px] max-w-[74vw] p-5">
              <div className="mb-2 text-sm font-semibold text-white/82">{attachment.name}</div>
              <div className="mb-3 text-xs text-white/40">{attachment.summary || attachment.type}</div>
              <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-black/24 p-3 text-xs leading-5 text-white/64">
                {createTextAttachmentContext(attachment.textContent || attachment.content, 12000)}
              </pre>
            </div>
          ) : (
            <div className="w-[520px] max-w-[70vw] p-5">
              <div className="mb-2 text-sm font-semibold text-white/82">{attachment.name}</div>
              <div className="text-xs text-white/48">{attachment.summary || attachment.type}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MenuToggle({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="flex h-8 w-full items-center justify-between rounded-md px-2.5 text-left text-white/70 transition hover:bg-white/[0.07] hover:text-white"
    >
      <span>{label}</span>
      <span
        className={`relative h-4 w-7 rounded-full transition ${
          checked ? 'bg-white/85' : 'bg-white/18'
        }`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full transition ${
            checked ? 'left-3.5 bg-slate-950' : 'left-0.5 bg-white/75'
          }`}
        />
      </span>
    </button>
  )
}
function PluginsPanel({
  setSkillPanelOpen,
  onInstallRecommendedSkills,
  onConnectorChange
}: {
  setSkillPanelOpen: (open: boolean) => void
  onInstallRecommendedSkills: () => number
  onConnectorChange: (connector: WorkspaceConnector, connected: boolean) => void
}) {
  const [installedCount, setInstalledCount] = useState<number | null>(null)
  const [connectors, setConnectors] = useState<WorkspaceConnector[]>(() => readWorkspaceConnectors())
  const [localSkills, setLocalSkills] = useState<Array<{ id: string; name: string; description?: string; steps?: any[] }>>(
    () => readLocalWorkspaceSkills()
  )
  useEffect(() => {
    const refresh = () => {
      setLocalSkills(readLocalWorkspaceSkills())
      setConnectors(readWorkspaceConnectors())
    }
    window.addEventListener('workspace:skill-executed', refresh)
    window.addEventListener('workspace:connector-updated', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('workspace:skill-executed', refresh)
      window.removeEventListener('workspace:connector-updated', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])
  const connectedConnectors = connectors.filter((item) => item.status === 'connected')
  const toggleConnector = (connector: WorkspaceConnector) => {
    const connected = connector.status !== 'connected'
    const nextConnector = {
      ...connector,
      status: connected ? 'connected' : 'available',
      connectedAt: connected ? new Date().toISOString() : undefined
    } as WorkspaceConnector
    const next = connectors.map((item) => (item.id === connector.id ? nextConnector : item))
    setConnectors(next)
    writeWorkspaceConnectors(next)
    onConnectorChange(nextConnector, connected)
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white/88">插件</h1>
        <p className="mt-1 text-xl text-white/44">在常用工具中使用星河</p>
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between border-b border-white/8 pb-3">
          <h2 className="text-sm font-semibold text-white/78">已连接</h2>
          <button
            type="button"
            onClick={() => setSkillPanelOpen(true)}
            className="rounded-full bg-white/[0.06] px-3 py-1.5 text-xs text-white/64 transition hover:bg-white/[0.1] hover:text-white"
          >
            管理
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          {(connectedConnectors.length ? connectedConnectors : connectors.slice(0, 3)).map((item) => (
            <PluginIcon key={item.name} {...item} />
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white/78">连接器</h2>
            <p className="mt-1 text-xs text-white/38">按项目授权外部工具，连接状态会进入工作台上下文。</p>
          </div>
          <span className="text-xs text-white/34">{connectedConnectors.length}/{connectors.length} 已启用</span>
        </div>
        <div className="divide-y divide-white/7">
          {connectors.map((connector) => {
            const Icon = getConnectorIcon(connector.id)
            const connected = connector.status === 'connected'
            return (
              <div key={connector.id} className="flex items-center gap-3 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-white/62">
                  <Icon size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-white/78">{connector.name}</span>
                    <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/42">
                      {connector.category}
                    </span>
                  </div>
                  <div className="mt-0.5 line-clamp-1 text-xs text-white/36">{connector.description}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {connector.scopes.slice(0, 4).map((scope) => (
                      <span key={scope} className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] text-white/32">
                        {scope}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleConnector(connector)}
                  className={`rounded-full px-3 py-1.5 text-xs transition ${
                    connected
                      ? 'bg-emerald-300/12 text-emerald-100/70 hover:bg-emerald-300/18'
                      : 'bg-white/[0.06] text-white/56 hover:bg-white/[0.1] hover:text-white'
                  }`}
                >
                  {connected ? '已启用' : '启用'}
                </button>
              </div>
            )
          })}
        </div>
      </section>

      <section className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white/78">推荐 Skill</h2>
            <p className="mt-1 text-xs text-white/38">浏览器验收、发布前检查、素材入库检查</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setInstalledCount(onInstallRecommendedSkills())
              setLocalSkills(readLocalWorkspaceSkills())
            }}
            className="rounded-full bg-white/[0.08] px-3 py-1.5 text-xs text-white/70 transition hover:bg-white/[0.14] hover:text-white"
          >
            安装推荐
          </button>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {recommendedSkillSeeds.map((skill) => (
            <div key={skill.name} className="rounded-lg border border-white/[0.06] bg-black/10 p-3">
              <div className="text-sm font-medium text-white/76">{skill.name}</div>
              <div className="mt-1 line-clamp-2 text-xs leading-5 text-white/38">{skill.description}</div>
            </div>
          ))}
        </div>
        {installedCount !== null ? (
          <div className="mt-3 text-xs text-emerald-200/68">已同步 {installedCount} 个 Skill 到本地库</div>
        ) : null}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between border-b border-white/8 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-white/78">本地 Skill</h2>
            <p className="mt-1 text-xs text-white/34">{localSkills.length ? `${localSkills.length} 个可用` : '暂无本地 Skill'}</p>
          </div>
          <button
            type="button"
            onClick={() => setSkillPanelOpen(true)}
            className="rounded-full bg-white/[0.06] px-3 py-1.5 text-xs text-white/64 transition hover:bg-white/[0.1] hover:text-white"
          >
            打开管理
          </button>
        </div>
        {localSkills.length ? (
          <div className="divide-y divide-white/7">
            {localSkills.slice(0, 8).map((skill) => (
              <div key={skill.id} className="flex items-center gap-3 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-white/62">
                  <Puzzle size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white/76">{skill.name}</div>
                  <div className="mt-0.5 truncate text-xs text-white/34">
                    {skill.description || `${skill.steps?.length || 0} 个步骤`}
                  </div>
                </div>
                <span className="shrink-0 text-[11px] text-cyan-100/48">可用</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-white/[0.08] px-3 py-6 text-center text-sm text-white/32">
            可以安装推荐 Skill，或在管理面板创建自定义 Skill。
          </div>
        )}
      </section>

      <PluginList
        title="Featured"
        items={featuredPlugins}
        onAction={() => setSkillPanelOpen(true)}
      />
    </div>
  )
}

function AutomationPanel({
  onCreateTemplate,
  onCreateTimer,
  onCancelTimer,
  onReplayTask,
  onRetryTask,
  tasks
}: {
  onCreateTemplate: (item: WorkspaceCatalogItem) => void
  onCreateTimer: (preset: (typeof automationTimerPresets)[number]) => any
  onCancelTimer: (timerId: string, timerName: string) => any
  onReplayTask: (task: WorkspaceTaskItem) => void
  onRetryTask: (task: WorkspaceTaskItem) => void
  tasks: WorkspaceTaskItem[]
}) {
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | WorkspaceTaskItem['status']>('all')
  const [timerRefreshKey, setTimerRefreshKey] = useState(0)
  const automationTasks = tasks.filter((task) => task.channel === 'automation')
  const visibleAutomationTasks = automationTasks
    .filter((task) => statusFilter === 'all' || task.status === statusFilter)
    .slice(0, 24)
  const timerData = useMemo(() => list_timer_tasks(), [timerRefreshKey])
  const timers = Array.isArray(timerData?.timers) ? timerData.timers : []
  const statusCounts = automationTasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.status] = (acc[task.status] || 0) + 1
    return acc
  }, {})
  useEffect(() => {
    const refreshTimers = () => setTimerRefreshKey((value) => value + 1)
    window.addEventListener('workspace:timers-updated', refreshTimers)
    window.addEventListener('storage', refreshTimers)
    return () => {
      window.removeEventListener('workspace:timers-updated', refreshTimers)
      window.removeEventListener('storage', refreshTimers)
    }
  }, [])
  const copyTask = async (task: WorkspaceTaskItem) => {
    await navigator.clipboard?.writeText(
      [
        task.name,
        `状态：${formatTaskStatus(task.status)}`,
        `时间：${formatRelativeTime(task.updatedAt)}前更新`,
        task.detail ? `详情：\n${task.detail}` : ''
      ]
        .filter(Boolean)
        .join('\n')
    )
    setCopiedTaskId(task.id)
    window.setTimeout(() => setCopiedTaskId(null), 1600)
  }
  const handleCreateTimer = (preset: (typeof automationTimerPresets)[number]) => {
    onCreateTimer(preset)
    setTimerRefreshKey((value) => value + 1)
  }
  const handleCancelTimer = (timer: any) => {
    onCancelTimer(timer.id, timer.name)
    setTimerRefreshKey((value) => value + 1)
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white/88">自动化</h1>
        <p className="mt-1 text-xl text-white/44">让后台任务按规则自己推进</p>
      </div>

      <PluginList
        title="任务模板"
        items={automationItems}
        actionLabel="启用"
        onAction={onCreateTemplate}
      />

      <div>
        <div className="mb-3 flex items-center justify-between border-b border-white/[0.08] pb-3">
          <h2 className="text-sm font-semibold text-white/78">定时计划</h2>
          <span className="text-xs text-white/32">{timers.length} 个</span>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {automationTimerPresets.map((preset) => {
            const installed = timers.some((timer: any) => timer.name === preset.name)
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleCreateTimer(preset)}
                disabled={installed}
                className={`rounded-lg border px-3 py-2 text-left transition ${
                  installed
                    ? 'border-cyan-300/[0.12] bg-cyan-300/[0.05] text-cyan-100/45'
                    : 'border-white/[0.06] bg-white/[0.025] text-white/60 hover:border-white/[0.13] hover:bg-white/[0.055] hover:text-white/82'
                }`}
              >
                <div className="flex items-center gap-2 text-sm">
                  <Workflow size={14} className="shrink-0 text-cyan-200/55" />
                  <span className="min-w-0 flex-1 truncate">{preset.name}</span>
                  <span className="shrink-0 text-[11px] text-white/32">
                    {installed ? '已启用' : `${preset.intervalMinutes} 分`}
                  </span>
                </div>
                <div className="mt-1 text-xs leading-5 text-white/36">{preset.desc}</div>
              </button>
            )
          })}
        </div>
        {timers.length ? (
          <div className="mt-3 space-y-1.5">
            {timers.map((timer: any) => (
              <div key={timer.id} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-black/10 px-3 py-2">
                <span className={`h-2 w-2 rounded-full ${timer.enabled ? 'bg-emerald-300' : 'bg-white/20'}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-white/70">{timer.name}</div>
                  <div className="truncate text-xs text-white/32">
                    每 {timer.intervalMinutes} 分钟 · 已运行 {timer.runCount || 0} 次 · {timer.lastRun || '从未执行'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCancelTimer(timer)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-white/30 transition hover:bg-rose-400/[0.1] hover:text-rose-200"
                  aria-label={`取消${timer.name}`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between border-b border-white/[0.08] pb-3">
          <h2 className="text-sm font-semibold text-white/78">运行历史</h2>
          <span className="text-xs text-white/32">{automationTasks.length} 条</span>
        </div>
        {automationTasks.length ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {[
                ['all', `全部 ${automationTasks.length}`],
                ['waiting', `等待 ${statusCounts.waiting || 0}`],
                ['running', `运行 ${statusCounts.running || 0}`],
                ['done', `完成 ${statusCounts.done || 0}`],
                ['failed', `失败 ${statusCounts.failed || 0}`]
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value as 'all' | WorkspaceTaskItem['status'])}
                  className={`h-7 rounded-md px-2 text-xs transition ${
                    statusFilter === value
                      ? 'bg-cyan-300/[0.12] text-cyan-100/80'
                      : 'bg-white/[0.04] text-white/40 hover:bg-white/[0.07] hover:text-white/70'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              {visibleAutomationTasks.map((task) => {
                const isOpen = expandedTaskId === task.id
                return (
                  <div key={task.id} className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setExpandedTaskId(isOpen ? null : task.id)}
                      className="flex w-full items-center gap-2 text-left text-sm"
                    >
                      <Workflow size={14} className="shrink-0 text-cyan-200/55" />
                      <span className="min-w-0 flex-1 truncate text-white/72">{task.name}</span>
                      <span className="shrink-0 text-xs text-white/34">{formatTaskStatus(task.status)}</span>
                    </button>
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-white/38">
                      {task.detail || '暂无详情'}
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-white/26">
                      <span>{formatRelativeTime(task.updatedAt)}前更新</span>
                      <span>{isOpen ? '收起' : '展开'}</span>
                    </div>
                    {isOpen ? (
                      <div className="mt-2 border-t border-white/[0.055] pt-2">
                        <AutomationTaskSteps task={task} />
                        {task.retryOf || task.retryAttempt || task.nextRetryAt ? (
                          <div className="mb-2 rounded-md border border-amber-200/10 bg-amber-300/[0.045] px-2 py-1.5 text-[11px] leading-5 text-amber-100/58">
                            <div>重试来源：{task.retryOf ? '已有失败记录' : '当前记录'}</div>
                            <div>
                              第 {task.retryAttempt || 1} 次尝试
                              {task.retryDelayMinutes ? ` · 退避 ${task.retryDelayMinutes} 分钟` : ''}
                              {task.nextRetryAt ? ` · ${formatRetryTime(task.nextRetryAt)}` : ''}
                            </div>
                          </div>
                        ) : null}
                        <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-md bg-black/18 p-2 text-[11px] leading-5 text-white/48">
                          {task.detail || '暂无详情'}
                        </pre>
                        <div className="mt-2 flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => void copyTask(task)}
                            className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-white/36 transition hover:bg-white/[0.06] hover:text-white/70"
                          >
                            {copiedTaskId === task.id ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                            <span>{copiedTaskId === task.id ? '已复制' : '复制'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onReplayTask(task)}
                            className="h-7 rounded-md bg-cyan-300/[0.1] px-2 text-xs text-cyan-100/72 transition hover:bg-cyan-300/[0.16] hover:text-cyan-50"
                          >
                            继续处理
                          </button>
                          {task.status === 'failed' ? (
                            <button
                              type="button"
                              onClick={() => onRetryTask(task)}
                              className="h-7 rounded-md bg-amber-300/[0.12] px-2 text-xs text-amber-100/80 transition hover:bg-amber-300/[0.18] hover:text-amber-50"
                            >
                              重试
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
            {visibleAutomationTasks.length < automationTasks.filter((task) => statusFilter === 'all' || task.status === statusFilter).length ? (
              <div className="rounded-md border border-dashed border-white/[0.07] px-3 py-2 text-xs text-white/32">
                仅显示最近 24 条，更多记录仍保存在工作台任务里。
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-white/[0.08] px-3 py-6 text-center text-sm text-white/32">
            暂无自动化记录
          </div>
        )}
      </div>
    </div>
  )
}

function AutomationTaskSteps({ task }: { task: WorkspaceTaskItem }) {
  const steps = [
    {
      label: '记录创建',
      detail: formatRelativeTime(task.updatedAt) + '前更新',
      state: 'done'
    },
    {
      label:
        task.status === 'running'
          ? '正在执行'
          : task.status === 'waiting' || task.status === 'pending'
            ? '等待处理'
            : '执行结束',
      detail: formatTaskStatus(task.status),
      state: task.status === 'failed' ? 'failed' : task.status === 'done' ? 'done' : 'pending'
    },
    {
      label: task.status === 'failed' ? '等待重试' : task.status === 'done' ? '结果可回放' : '等待下一步',
      detail:
        task.retryAttempt
          ? `第 ${task.retryAttempt} 次尝试${task.nextRetryAt ? `，${formatRetryTime(task.nextRetryAt)}` : ''}`
          : task.status === 'failed'
          ? '可生成重试请求'
          : task.status === 'done'
            ? '可复制或继续处理'
            : '可回填到对话框继续推进',
      state: task.status === 'failed' ? 'failed' : task.status === 'done' ? 'done' : 'pending'
    }
  ] as const

  return (
    <div className="mb-2 grid gap-1.5 rounded-md bg-white/[0.025] p-2">
      {steps.map((step, index) => (
        <div key={`${task.id}-${step.label}`} className="flex items-start gap-2 text-[11px] leading-5">
          <div className="flex flex-col items-center">
            <span
              className={`mt-1 h-2 w-2 rounded-full ${
                step.state === 'failed'
                  ? 'bg-rose-300'
                  : step.state === 'done'
                    ? 'bg-emerald-300'
                    : 'bg-white/24'
              }`}
            />
            {index < steps.length - 1 ? <span className="mt-1 h-5 w-px bg-white/[0.08]" /> : null}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-white/58">{step.label}</div>
            <div className="text-white/28">{step.detail}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function FeishuPanel({
  setSettingsOpen,
  setSkillPanelOpen
}: {
  setSettingsOpen: (open: boolean) => void
  setSkillPanelOpen: (open: boolean) => void
}) {
  const [status, setStatus] = useState<any>(null)
  const [chats, setChats] = useState<Array<{ chat_id?: string; name?: string; description?: string }>>([])
  const [selectedChatId, setSelectedChatId] = useState('')
  const [messageText, setMessageText] = useState('星河工作台测试消息：飞书直连已可用。')
  const [resultText, setResultText] = useState('')

  const refreshFeishu = async () => {
    const statusResult = await window.api?.invoke?.('feishu:get-status')
    setStatus(statusResult || null)
    const chatResult = await window.api?.invoke?.('feishu:list-chats')
    const items = Array.isArray(chatResult?.items) ? chatResult.items : []
    setChats(items)
    if (!selectedChatId && items[0]?.chat_id) setSelectedChatId(items[0].chat_id)
  }

  useEffect(() => {
    void refreshFeishu()
  }, [])

  const testFeishuConnection = async () => {
    const result = await window.api?.invoke?.('feishu:test-connection')
    setResultText(result?.success ? '连接测试通过' : result?.error || '连接测试失败')
    await refreshFeishu()
  }

  const pushFeishuMessage = async () => {
    if (!selectedChatId || !messageText.trim()) return
    const result = await window.api?.invoke?.('feishu:push-message', {
      chatId: selectedChatId,
      text: messageText.trim()
    })
    setResultText(result?.success ? '消息已发送到飞书' : result?.error || '消息发送失败')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white/88">飞书直连</h1>
        <p className="mt-1 text-xl text-white/44">移动端只保留通知、审核和轻量指令</p>
      </div>

      <div className="rounded-xl border border-white/8 bg-white/[0.035] p-5">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-slate-950">
          <Smartphone size={24} />
        </div>
        <div className="text-sm font-semibold text-white/82">连接飞书机器人</div>
        <p className="mt-2 max-w-[560px] text-sm leading-6 text-white/48">
          飞书接收生产完成、失败重试、审核请求和云端同步提醒。用户在手机上确认后，结果回写到对应工作台文件。
        </p>
        <button
          type="button"
          onClick={() => {
            setSkillPanelOpen(false)
            setSettingsOpen(true)
            window.setTimeout(() => {
              window.dispatchEvent(new CustomEvent('open-settings-tab', { detail: 'feishu' }))
            }, 0)
          }}
          className="mt-5 rounded-full bg-white/[0.08] px-4 py-2 text-sm text-white/76 transition hover:bg-white/[0.14] hover:text-white"
        >
          配置直连
        </button>
      </div>

      <div className="rounded-xl border border-white/8 bg-white/[0.025] p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white/82">连接状态</div>
            <div className="mt-1 text-xs text-white/38">
              {status?.enabled ? '已启用' : '未启用'} · {status?.running ? '网关运行中' : '网关未运行'}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void refreshFeishu()}
              className="rounded-full bg-white/[0.06] px-3 py-1.5 text-xs text-white/64 transition hover:bg-white/[0.1] hover:text-white"
            >
              刷新
            </button>
            <button
              type="button"
              onClick={() => void testFeishuConnection()}
              className="rounded-full bg-white/[0.08] px-3 py-1.5 text-xs text-white/74 transition hover:bg-white/[0.14] hover:text-white"
            >
              测试
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
          <select
            value={selectedChatId}
            onChange={(event) => setSelectedChatId(event.target.value)}
            className="h-10 rounded-lg border border-white/[0.08] bg-[#11161c] px-3 text-sm text-white/72 outline-none"
          >
            <option value="">选择飞书群</option>
            {chats.map((chat) => (
              <option key={chat.chat_id || chat.name} value={chat.chat_id || ''}>
                {chat.name || chat.chat_id || '未命名群'}
              </option>
            ))}
          </select>
          <input
            value={messageText}
            onChange={(event) => setMessageText(event.target.value)}
            className="h-10 rounded-lg border border-white/[0.08] bg-[#11161c] px-3 text-sm text-white/72 outline-none placeholder:text-white/28"
            placeholder="发送一条工作台测试消息..."
          />
          <button
            type="button"
            onClick={() => void pushFeishuMessage()}
            className="rounded-lg bg-white px-4 text-sm font-medium text-slate-950 transition hover:bg-cyan-100"
          >
            发送
          </button>
        </div>
        {resultText ? <div className="mt-3 text-xs text-white/44">{resultText}</div> : null}
        {!chats.length ? (
          <div className="mt-3 text-xs text-white/32">暂无可选飞书群；请先在设置里完成机器人配置并测试连接。</div>
        ) : null}
      </div>
    </div>
  )
}

function PluginList({
  title,
  items,
  actionLabel = '连接',
  onAction
}: {
  title: string
  items: WorkspaceCatalogItem[]
  actionLabel?: string
  onAction?: (item: WorkspaceCatalogItem) => void
}) {
  return (
    <section>
      <h2 className="border-b border-white/8 pb-3 text-sm font-semibold text-white/78">{title}</h2>
      <div className="divide-y divide-white/7">
        {items.map((item) => {
          const { name, desc, icon: Icon } = item
          return (
          <div key={name} className="flex items-center gap-4 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-slate-950">
              <Icon size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-white/78">{name}</div>
              <div className="mt-1 truncate text-sm text-white/38">{desc}</div>
            </div>
            <button
              type="button"
              onClick={() => onAction?.(item)}
              className="rounded-full bg-white/[0.06] px-3 py-1.5 text-sm text-white/74 transition hover:bg-white/[0.1] hover:text-white"
            >
              {actionLabel}
            </button>
          </div>
          )
        })}
      </div>
    </section>
  )
}

function PluginIcon({
  id,
  name,
  status
}: {
  id?: string
  name: string
  status?: string
}) {
  const Icon = getConnectorIcon(id || name)
  return (
    <div className="group relative">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-slate-950">
        <Icon size={20} />
      </div>
      <div className="pointer-events-none absolute left-0 top-12 z-20 hidden min-w-32 rounded-md border border-white/8 bg-[#161b22] px-2 py-1 text-xs text-white/64 shadow-xl group-hover:block">
        {name} · {status === 'connected' ? '已启用' : '待启用'}
      </div>
    </div>
  )
}

function getConnectorIcon(id?: string): LucideIcon {
  const key = String(id || '').toLowerCase()
  if (key.includes('feishu') || key.includes('飞书')) return Smartphone
  if (key.includes('git')) return GitBranch
  if (key.includes('figma')) return Puzzle
  if (key.includes('browser') || key.includes('浏览器')) return Globe2
  if (key.includes('asset') || key.includes('素材')) return Cloud
  return Puzzle
}

function SectionTitle({ children }: { children: string }) {
  return <div className="px-2 pb-1 pt-4 text-xs font-medium text-white/32">{children}</div>
}

function ThreadButton({
  title,
  time,
  active,
  onClick,
  onDelete
}: {
  title: string
  time?: string
  active?: boolean
  onClick: () => void
  onDelete?: () => void
}) {
  return (
    <div
      className={`group/thread flex min-h-8 w-full items-center rounded-md transition ${
        active
          ? 'bg-white/[0.09] text-white'
          : 'text-white/58 hover:bg-white/[0.06] hover:text-white'
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2 text-left text-sm"
      >
        <span className="min-w-0 truncate">{title}</span>
        {time ? <span className="shrink-0 text-xs text-white/32">{time}</span> : null}
      </button>
      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/26 opacity-0 transition hover:bg-rose-500/12 hover:text-rose-300 group-hover/thread:opacity-100"
          title="删除工作台文件"
          aria-label={`删除${title}`}
        >
          <Trash2 size={13} />
        </button>
      ) : null}
    </div>
  )
}

function CommandPalette({
  actions,
  onClose
}: {
  actions: Array<{ label: string; hint?: string; run: () => void }>
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const filtered = actions.filter((action) =>
    `${action.label} ${action.hint || ''}`.toLowerCase().includes(query.trim().toLowerCase())
  )
  const selectedAction = filtered[selectedIndex] || filtered[0]

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (selectedIndex >= filtered.length) setSelectedIndex(Math.max(0, filtered.length - 1))
  }, [filtered.length, selectedIndex])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 pt-[14vh]" onClick={onClose}>
      <div
        className="w-[520px] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border border-white/[0.12] bg-[#11161d] shadow-2xl shadow-black/50"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex h-12 items-center gap-2 border-b border-white/[0.08] px-4">
          <Command size={16} className="text-white/38" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onClose()
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setSelectedIndex((index) => (filtered.length ? (index + 1) % filtered.length : 0))
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setSelectedIndex((index) => (filtered.length ? (index - 1 + filtered.length) % filtered.length : 0))
              }
              if (event.key === 'Enter' && selectedAction) {
                selectedAction.run()
                onClose()
              }
            }}
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
            placeholder="搜索命令..."
          />
          <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/34">Esc</span>
        </div>
        <div className="max-h-[360px] overflow-y-auto p-1.5">
          {filtered.map((action, index) => (
            <button
              key={`${action.label}-${action.hint || ''}`}
              type="button"
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => {
                action.run()
                onClose()
              }}
              className={`flex h-10 w-full items-center justify-between rounded-lg px-3 text-left transition ${
                index === selectedIndex ? 'bg-white/[0.09]' : 'hover:bg-white/[0.07]'
              }`}
            >
              <span className="text-sm text-white/78">{action.label}</span>
              {action.hint ? <span className="text-xs text-white/32">{action.hint}</span> : null}
            </button>
          ))}
          {!filtered.length ? (
            <div className="px-3 py-8 text-center text-sm text-white/36">没有匹配命令</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function MarkdownMessage({ content, isError }: { content: string; isError?: boolean }) {
  const { html, headings } = useMemo(() => {
    if (isError) return { html: '', headings: [] as Array<{ id: string; level: number; text: string }> }
    const headingItems: Array<{ id: string; level: number; text: string }> = []
    const seed = Math.abs(hashString(content || '')).toString(36)
    const processed = (content || '').replace(/^(#{1,3})\s+(.+)$/gm, (match, marks: string, title: string) => {
      const text = title.replace(/[`*_#[\]]/g, '').trim()
      if (!text) return match
      const id = `workspace-heading-${seed}-${headingItems.length}`
      headingItems.push({ id, level: marks.length, text })
      return `${marks} <span id="${id}"></span>${title}`
    })
    return { html: marked.parse(processed || ''), headings: headingItems }
  }, [content, isError])

  if (isError) {
    return <div className="whitespace-pre-wrap text-sm leading-7 text-rose-200/82">{content}</div>
  }

  return (
    <div>
      {headings.length > 1 ? (
        <div className="mb-4 rounded-lg border border-white/[0.06] bg-white/[0.025] p-2">
          <div className="mb-1 px-1 text-[11px] text-white/36">目录</div>
          <div className="flex flex-wrap gap-1">
            {headings.slice(0, 8).map((heading) => (
              <button
                key={heading.id}
                type="button"
                onClick={() => document.getElementById(heading.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="rounded-md px-2 py-1 text-left text-[11px] text-white/44 transition hover:bg-white/[0.06] hover:text-white/72"
              >
                {heading.level > 1 ? '· ' : ''}
                {heading.text}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div
        className="markdown-body text-sm leading-7 text-white/78"
        dangerouslySetInnerHTML={{ __html: html as string }}
      />
    </div>
  )
}

function WorkspaceToolCallTrace({
  toolCalls
}: {
  toolCalls?: Array<{ name?: string; success?: boolean; error?: string }>
}) {
  if (!toolCalls?.length) return null
  const failedCount = toolCalls.filter((tool) => tool.success === false).length
  return (
    <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.025] p-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-medium text-white/56">操作记录</span>
        <span className={failedCount ? 'text-rose-200/60' : 'text-emerald-200/58'}>
          {toolCalls.length} 个操作{failedCount ? ` / ${failedCount} 个失败` : ''}
        </span>
      </div>
      <div className="space-y-1.5">
        {toolCalls.slice(0, 12).map((tool, index) => (
          <div
            key={`${tool.name || 'tool'}-${index}`}
            className="flex items-start gap-2 rounded-md bg-black/12 px-2 py-1.5 text-xs"
          >
            {tool.success === false ? (
              <X size={13} className="mt-0.5 shrink-0 text-rose-200/65" />
            ) : (
              <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-200/62" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-white/60">{formatToolCallName(tool.name)}</div>
              {tool.error ? <div className="mt-0.5 line-clamp-2 text-white/32">{tool.error}</div> : null}
            </div>
          </div>
        ))}
      </div>
      {toolCalls.length > 12 ? (
        <div className="mt-2 text-[11px] text-white/30">还有 {toolCalls.length - 12} 个操作已折叠</div>
      ) : null}
    </div>
  )
}

function WorkspaceSendingSteps() {
  const [open, setOpen] = useState(false)
  const steps = [
    '整理当前工作台上下文',
    '读取附件、目录和素材引用',
    '检查电脑访问与审批方式',
    '调用当前模型处理任务',
    '等待结果写回对话'
  ]

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2 text-xs text-white/42">
          <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-200/80" />
          <span>正在处理</span>
        </div>
        <span className={`text-[10px] text-white/30 transition ${open ? 'rotate-180' : ''}`}>⌄</span>
      </button>
      {open ? (
        <div className="mt-3 space-y-1.5">
          {steps.map((step, index) => (
            <div key={step} className="flex items-center gap-2 text-[11px] leading-5 text-white/40">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  index < 3 ? 'bg-emerald-300/70' : index === 3 ? 'bg-cyan-200/70' : 'bg-white/22'
                }`}
              />
              <span>{step}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function hashString(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index++) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }
  return hash
}

function ProjectFilesPanel({
  root,
  files,
  loading,
  error,
  onRefresh
}: {
  root: string
  files: WorkspaceVisibleFile[]
  loading: boolean
  error: string
  onRefresh: () => void
}) {
  const images = files.filter((file) => file.kind === 'image')
  const videos = files.filter((file) => file.kind === 'video')
  const textFiles = files.filter((file) => file.kind === 'text')
  const folders = files.filter((file) => file.kind === 'folder')
  const audioFiles = files.filter((file) => file.kind === 'audio')
  const others = files.filter((file) => file.kind === 'other')

  return (
    <section className="mb-4 rounded-lg border border-white/8 bg-white/[0.025] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-white/64">项目文件</div>
          <div className="mt-0.5 truncate text-[10px] text-white/30" title={root || '未绑定目录'}>
            {root || '未绑定目录'}
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/36 transition hover:bg-white/[0.06] hover:text-white/70"
          title="刷新文件"
        >
          <RefreshCcw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {!root ? (
        <div className="rounded-md border border-dashed border-white/10 px-3 py-4 text-center text-xs text-white/36">
          选择或新建项目目录后会显示文件
        </div>
      ) : error ? (
        <div className="rounded-md border border-amber-300/15 bg-amber-300/[0.05] px-3 py-2 text-xs text-amber-100/62">
          {error}
        </div>
      ) : files.length === 0 && !loading ? (
        <div className="rounded-md border border-dashed border-white/10 px-3 py-4 text-center text-xs text-white/36">
          目录里暂无文件
        </div>
      ) : (
        <div className="space-y-3">
          <FileThumbGrid title="图片" files={images} type="image" />
          <FileThumbGrid title="视频" files={videos} type="video" />
          <FileList title="文本" files={textFiles} icon={FileText} />
          <FileList title="文件夹" files={folders} icon={Folder} />
          <FileList title="音频" files={audioFiles} icon={Video} />
          <FileList title="其他" files={others} icon={Database} />
        </div>
      )}
    </section>
  )
}

function FileThumbGrid({
  title,
  files,
  type
}: {
  title: string
  files: WorkspaceVisibleFile[]
  type: 'image' | 'video'
}) {
  if (!files.length) return null
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-medium text-white/44">
        {title} · {files.length}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2">
        {files.slice(0, 48).map((file) => (
          <button
            type="button"
            key={file.path}
            onClick={() => void window.api?.fsAPI?.openPath?.(file.path)}
            className="group overflow-hidden rounded-md border border-white/8 bg-black/18 text-left transition hover:border-cyan-200/24"
            title={file.path}
          >
            <div className="aspect-square bg-black/24">
              {type === 'image' ? (
                <ThumbnailImage src={file.path} alt={file.name} className="h-full w-full object-cover" />
              ) : (
                <VideoThumbnail src={file.path} className="h-full w-full object-cover" />
              )}
            </div>
            <div className="truncate px-1.5 py-1 text-[10px] text-white/52 group-hover:text-white/72">
              {file.name}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function FileList({
  title,
  files,
  icon: Icon
}: {
  title: string
  files: WorkspaceVisibleFile[]
  icon: LucideIcon
}) {
  if (!files.length) return null
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-medium text-white/44">
        {title} · {files.length}
      </div>
      <div className="space-y-1">
        {files.slice(0, 40).map((file) => (
          <button
            type="button"
            key={file.path}
            onClick={() => void window.api?.fsAPI?.openPath?.(file.path)}
            className="flex w-full items-center gap-2 rounded-md border border-white/6 bg-white/[0.025] px-2 py-1.5 text-left transition hover:bg-white/[0.055]"
            title={file.path}
          >
            <Icon size={13} className="shrink-0 text-white/38" />
            <span className="min-w-0 flex-1 truncate text-xs text-white/64">{file.name}</span>
            {!file.isDirectory && file.size ? (
              <span className="shrink-0 text-[10px] text-white/30">{formatFileSize(file.size)}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  )
}

function CollapsiblePanel({
  title,
  open,
  onToggle,
  children
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <section className="border-t border-white/8 py-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between text-left text-xs font-medium text-white/52 transition hover:text-white/78"
      >
        <span>{title}</span>
        <span className={`text-[10px] text-white/30 transition ${open ? 'rotate-180' : ''}`}>⌄</span>
      </button>
      {open ? <div className="mt-3 space-y-2">{children}</div> : null}
    </section>
  )
}

function ProgressList({
  isSending,
  pendingOperations,
  approveOperation,
  rejectOperation,
  auditLog,
  materialRefs,
  allMaterialRefs,
  browserTargets,
  reviewReports,
  inspectBrowserTarget,
  startBrowserSessionTarget,
  captureBrowserTargetEvidence,
  inspectBrowserTargetDom,
  inspectBrowserTargetConsole,
  removeBrowserTarget,
  clearBrowserTargets,
  setDraft
}: {
  isSending: boolean
  pendingOperations: WorkspacePendingOperation[]
  approveOperation: (operation: WorkspacePendingOperation) => void
  rejectOperation: (operation: WorkspacePendingOperation) => void
  auditLog: WorkspaceAuditEntry[]
  materialRefs: WorkspaceAttachment[]
  allMaterialRefs: WorkspaceMaterialRef[]
  browserTargets: WorkspaceBrowserTarget[]
  reviewReports: WorkspaceReviewReport[]
  inspectBrowserTarget: (url?: string, note?: string) => void
  startBrowserSessionTarget: (url?: string, note?: string) => void
  captureBrowserTargetEvidence: (targetId: string) => void
  inspectBrowserTargetDom: (targetId: string) => void
  inspectBrowserTargetConsole: (targetId: string) => void
  removeBrowserTarget: (targetId: string, closeSession?: boolean) => void
  clearBrowserTargets: () => void
  setDraft: (value: string) => void
}) {
  const pendingCount = pendingOperations.filter((item) => item.status === 'pending').length
  const pendingApprovalItems = pendingOperations.filter((item) => item.status === 'pending').slice(0, 4)
  const recentOperationItems = pendingOperations
    .filter((item) => item.status && item.status !== 'pending')
    .slice(0, 4)
  const latestAudit = auditLog.slice(0, 3)
  const latestBrowser = browserTargets[0]
  const latestReview = reviewReports[0]
  const materialKey = (material: WorkspaceAttachment) => material.path || material.cachedUrl || material.id || material.name
  const currentMaterialKeys = new Set(materialRefs.map(materialKey))
  const workspaceMaterialKeys = new Set<string>()
  const mergedMaterials = [
    ...materialRefs,
    ...allMaterialRefs.filter((material) => {
      const key = materialKey(material)
      if (currentMaterialKeys.has(key) || workspaceMaterialKeys.has(key)) return false
      workspaceMaterialKeys.add(key)
      return true
    })
  ]
  const latestMaterials = mergedMaterials.slice(0, 6)
  const currentMaterialCount = materialRefs.length
  const workspaceMaterialCount = allMaterialRefs.length
  const materialSummary = currentMaterialCount
    ? `${currentMaterialCount} 个当前素材，${workspaceMaterialCount} 个工作台素材`
    : workspaceMaterialCount
      ? `${workspaceMaterialCount} 个工作台素材`
      : '暂无素材关联'
  const [copiedReviewId, setCopiedReviewId] = useState<string | null>(null)
  const [copiedDiffId, setCopiedDiffId] = useState<string | null>(null)
  const [copiedBrowserId, setCopiedBrowserId] = useState<string | null>(null)
  const [copiedMaterialId, setCopiedMaterialId] = useState<string | null>(null)
  const [copiedOperationId, setCopiedOperationId] = useState<string | null>(null)
  const [copiedHunkKey, setCopiedHunkKey] = useState<string | null>(null)
  const [expandedReviewPath, setExpandedReviewPath] = useState<string | null>(null)
  const [reviewDiffsOpen, setReviewDiffsOpen] = useState(false)
  const [reviewPrNumber, setReviewPrNumber] = useState(() => localStorage.getItem(WORKSPACE_REVIEW_PR_KEY) || '')
  const [activePublishKey, setActivePublishKey] = useState<string | null>(null)
  const [hunkPublishDraft, setHunkPublishDraft] = useState('')
  const [publishingHunkKey, setPublishingHunkKey] = useState<string | null>(null)
  const [hunkPublishMessage, setHunkPublishMessage] = useState('')
  const [browserHistoryOpen, setBrowserHistoryOpen] = useState(false)
  const [materialsOpen, setMaterialsOpen] = useState(false)
  const [auditOpen, setAuditOpen] = useState(false)
  const [previewAttachment, setPreviewAttachment] = useState<WorkspaceAttachment | null>(null)
  const copyLatestReview = async () => {
    if (!latestReview) return
    await navigator.clipboard?.writeText(buildReviewCopyText(latestReview))
    setCopiedReviewId(latestReview.id)
    window.setTimeout(() => setCopiedReviewId(null), 1800)
  }
  const copyLatestDiffSnippets = async () => {
    if (!latestReview?.diffSnippets?.length) return
    const text = latestReview.diffSnippets
      .map((snippet) => `## ${snippet.path}\n\n\`\`\`diff\n${snippet.diff}\n\`\`\``)
      .join('\n\n')
    await navigator.clipboard?.writeText(text)
    setCopiedDiffId(latestReview.id)
    window.setTimeout(() => setCopiedDiffId(null), 1800)
  }
  const copyHunkCommentDraft = async (path: string, hunk: WorkspaceReviewDiffHunk, index: number) => {
    const key = `${path}-${index}`
    const text = [
      `文件：${path}`,
      `Hunk：${hunk.header}`,
      '',
      '请基于这段 diff 写一条行内审查意见：说明问题、影响和建议改法。',
      '',
      '```diff',
      hunk.body,
      '```'
    ].join('\n')
    await navigator.clipboard?.writeText(text)
    setCopiedHunkKey(key)
    window.setTimeout(() => setCopiedHunkKey(null), 1800)
  }
  const startHunkPublish = (path: string, hunk: WorkspaceReviewDiffHunk, index: number) => {
    const key = `${path}-${index}`
    setActivePublishKey((current) => (current === key ? null : key))
    setHunkPublishDraft(buildHunkReviewDraft(path, hunk))
    setHunkPublishMessage('')
  }
  const publishHunkComment = async (path: string, hunk: WorkspaceReviewDiffHunk, index: number) => {
    const key = `${path}-${index}`
    const prNumber = reviewPrNumber.trim()
    const body = hunkPublishDraft.trim()
    const line = getHunkReviewLine(hunk)
    if (!latestReview?.cwd) {
      setHunkPublishMessage('没有可用的工作目录，先跑一次审查。')
      return
    }
    if (!prNumber) {
      setHunkPublishMessage('先填写 PR 号。')
      return
    }
    if (!body) {
      setHunkPublishMessage('评论内容不能为空。')
      return
    }
    if (!line) {
      setHunkPublishMessage('这个 hunk 没解析到可评论的新文件行号。')
      return
    }
    localStorage.setItem(WORKSPACE_REVIEW_PR_KEY, prNumber)
    setPublishingHunkKey(key)
    setHunkPublishMessage('正在回写...')
    try {
      const result = await (post_github_pr_comment as any)({
        cwd: latestReview.cwd,
        prNumber,
        path,
        line,
        side: 'RIGHT',
        body
      })
      const ok = !!(result as any)?.success
      setHunkPublishMessage(ok ? `已回写到 PR #${prNumber} 第 ${line} 行。` : String((result as any)?.error || '回写失败'))
      if (ok) {
        setActivePublishKey(null)
        setHunkPublishDraft('')
      }
    } catch (error) {
      setHunkPublishMessage(error instanceof Error ? error.message : '回写失败')
    } finally {
      setPublishingHunkKey(null)
    }
  }
  const copyBrowserScreenshotPath = async () => {
    if (!latestBrowser?.screenshotPath) return
    await navigator.clipboard?.writeText(latestBrowser.screenshotPath)
    setCopiedBrowserId(latestBrowser.id)
    window.setTimeout(() => setCopiedBrowserId(null), 1800)
  }
  const copyMaterialPath = async (material: WorkspaceAttachment) => {
    const value = material.path || material.cachedUrl || material.name
    await navigator.clipboard?.writeText(value)
    setCopiedMaterialId(material.id)
    window.setTimeout(() => setCopiedMaterialId(null), 1800)
  }
  const copyOperationResult = async (operation: WorkspacePendingOperation) => {
    await navigator.clipboard?.writeText(
      formatOperationResultDetail(operation, operation.result || { success: operation.status === 'approved' })
    )
    setCopiedOperationId(operation.id)
    window.setTimeout(() => setCopiedOperationId(null), 1800)
  }
  const openMaterialLocation = async (material: WorkspaceAttachment) => {
    const targetPath = material.path
    if (!targetPath) return
    const result = await window.api?.localCacheAPI?.showItemInFolder?.(targetPath)
    if (!result?.success) {
      await window.api?.fsAPI?.openPath?.(targetPath)
    }
  }
  const useMaterialInDraft = (material: WorkspaceAttachment) => {
    const line = `引用素材：${material.name}${material.path ? `\n路径：${material.path}` : ''}`
    setDraft(line)
  }
  const items = [
    {
      label: isSending ? '正在处理当前任务' : '等待新任务',
      active: isSending
    },
    {
      label: pendingCount ? `${pendingCount} 个操作等待批准` : '没有待批准操作',
      active: pendingCount > 0
    },
    {
      label: materialSummary,
      active: workspaceMaterialCount > 0
    },
    {
      label: browserTargets.length ? `${browserTargets.length} 个浏览器目标` : '暂无浏览器目标',
      active: browserTargets.length > 0
    },
    {
      label: latestReview
        ? `最近审查：${latestReview.status === 'done' ? `${latestReview.changedFiles?.length || 0} 个文件` : '失败'}`
        : '暂无代码审查',
      active: !!latestReview
    }
  ]

  return (
    <>
      {items.map((item) => (
        <div key={item.label} className="flex gap-2 rounded-md px-1 py-1.5 text-xs text-white/58">
          <CheckCircle2
            size={14}
            className={`mt-0.5 shrink-0 ${item.active ? 'text-cyan-200/70' : 'text-white/26'}`}
          />
          <span>{item.label}</span>
        </div>
      ))}
      {pendingApprovalItems.length ? (
        <div className="mt-2 rounded-md border border-amber-200/12 bg-amber-300/[0.045] p-2">
          <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-amber-100/58">
            <span>待批准操作</span>
            <span className="text-[10px] text-white/28">{pendingCount} 个</span>
          </div>
          <div className="space-y-1.5">
            {pendingApprovalItems.map((operation) => (
              <div key={operation.id} className="rounded border border-white/[0.055] bg-black/10 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/68">
                    {formatOperationName(operation.operation)}
                  </div>
                  <span className="shrink-0 text-[10px] text-white/26">{formatRelativeTime(operation.at)}</span>
                </div>
                <div className="mt-1 truncate text-[10px] text-white/34">
                  {operation.targetPath || operation.command || operation.sourcePath || '未指定目标'}
                </div>
                <div className="mt-1 line-clamp-2 text-[10px] leading-4 text-amber-100/46">
                  {formatOperationRiskReason(operation.operation)}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() => approveOperation(operation)}
                    className="rounded bg-emerald-400/12 px-1.5 py-1 text-emerald-100/78 transition hover:bg-emerald-400/18 hover:text-emerald-50"
                  >
                    通过
                  </button>
                  <button
                    type="button"
                    onClick={() => rejectOperation(operation)}
                    className="rounded bg-rose-400/12 px-1.5 py-1 text-rose-100/78 transition hover:bg-rose-400/18 hover:text-rose-50"
                  >
                    拒绝
                  </button>
                </div>
              </div>
            ))}
          </div>
          {pendingCount > pendingApprovalItems.length ? (
            <div className="mt-1 px-1 text-[10px] text-white/26">
              还有 {pendingCount - pendingApprovalItems.length} 个操作在队列中
            </div>
          ) : null}
        </div>
      ) : null}
      {recentOperationItems.length ? (
        <div className="mt-2 rounded-md border border-white/[0.07] bg-white/[0.025] p-2">
          <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-white/48">
            <span>最近操作结果</span>
            <span className="text-[10px] text-white/28">{recentOperationItems.length} 条</span>
          </div>
          <div className="space-y-1.5">
            {recentOperationItems.map((operation) => (
              <div key={operation.id} className="rounded border border-white/[0.055] bg-black/10 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/68">
                    {formatOperationName(operation.operation)}
                  </div>
                  <span
                    className={`shrink-0 text-[10px] ${
                      operation.status === 'approved'
                        ? 'text-emerald-200/58'
                        : operation.status === 'rejected'
                          ? 'text-amber-100/58'
                          : 'text-rose-200/58'
                    }`}
                  >
                    {formatOperationStatus(operation.status)}
                  </span>
                </div>
                <div className="mt-1 line-clamp-2 text-[10px] leading-4 text-white/34">
                  {formatOperationResultDetail(
                    operation,
                    operation.result || { success: operation.status === 'approved', error: operation.status === 'rejected' ? '用户拒绝执行' : undefined }
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-white/24">{formatRelativeTime(operation.at)}</span>
                  <button
                    type="button"
                    onClick={() => void copyOperationResult(operation)}
                    className="rounded px-1.5 py-0.5 text-[10px] text-white/30 transition hover:bg-white/[0.06] hover:text-white/70"
                  >
                    {copiedOperationId === operation.id ? '已复制' : '复制结果'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {latestMaterials.length ? (
        <div className="mt-2 rounded-md border border-white/[0.07] bg-white/[0.03] p-2">
          <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-white/48">
            <span>最近产物</span>
            <span className="truncate text-[10px] text-white/30">
              {currentMaterialCount ? '当前 + 工作台' : '跨工作台'}
            </span>
            <button
              type="button"
              onClick={() => setMaterialsOpen(!materialsOpen)}
              className="rounded px-1.5 py-0.5 text-[10px] text-white/34 transition hover:bg-white/[0.06] hover:text-white/70"
            >
              {materialsOpen ? '收起' : '展开'}
            </button>
          </div>
          <div className="space-y-1.5">
            {(materialsOpen ? latestMaterials : latestMaterials.slice(0, 3)).map((material, index) => (
              <div
                key={`${materialKey(material)}-${'sourceFileId' in material ? material.sourceFileId || '' : ''}-${index}`}
                className="rounded border border-white/[0.055] bg-black/10 p-1.5"
              >
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewAttachment(material)}
                    className="relative h-12 w-14 shrink-0 overflow-hidden rounded-md border border-white/[0.06] bg-white/[0.045]"
                    title="预览"
                  >
                    <AttachmentThumb attachment={material} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-medium text-white/62">{material.name}</div>
                    <div className="mt-0.5 truncate text-[10px] text-white/30">
                      {formatMaterialKind(material)}{material.summary ? ` · ${material.summary}` : ''}
                    </div>
                    <div className="mt-1 truncate text-[10px] text-white/24">
                      {material.path || material.cachedUrl || '未落盘'}
                    </div>
                    {'sourceFileName' in material && material.sourceFileName ? (
                      <div className="mt-0.5 truncate text-[10px] text-cyan-100/35">
                        来源：{(material as any).sourceFolderName || '工作台项目'} / {material.sourceFileName}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() => useMaterialInDraft(material)}
                    className="rounded bg-white/[0.045] px-1.5 py-1 text-white/42 transition hover:bg-white/[0.075] hover:text-white/72"
                  >
                    引用
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyMaterialPath(material)}
                    className="rounded bg-white/[0.045] px-1.5 py-1 text-white/42 transition hover:bg-white/[0.075] hover:text-white/72"
                  >
                    {copiedMaterialId === material.id ? '已复制' : '复制'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void openMaterialLocation(material)}
                    disabled={!material.path}
                    className="rounded bg-white/[0.045] px-1.5 py-1 text-white/42 transition hover:bg-white/[0.075] hover:text-white/72 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    位置
                  </button>
                </div>
              </div>
            ))}
          </div>
          {mergedMaterials.length > latestMaterials.length ? (
            <div className="mt-1 px-1 text-[10px] text-white/26">还有 {mergedMaterials.length - latestMaterials.length} 个素材</div>
          ) : null}
        </div>
      ) : null}
      {auditLog.length ? (
        <div className="mt-2 rounded-md border border-white/[0.06] bg-white/[0.025] p-2">
          <div className="flex items-center justify-between gap-2 text-[11px] text-white/46">
            <span>操作审计</span>
            <button
              type="button"
              onClick={() => setAuditOpen(!auditOpen)}
              className="rounded px-1.5 py-0.5 text-[10px] text-white/34 transition hover:bg-white/[0.06] hover:text-white/70"
            >
              {auditOpen ? '收起' : '展开'}
            </button>
          </div>
          <div className="mt-1 space-y-1">
            {(auditOpen ? auditLog.slice(0, 10) : latestAudit).map((entry) => (
              <div key={entry.id} className="rounded bg-black/10 px-2 py-1">
                <div className="flex items-center gap-2 text-[11px]">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      entry.success === false ? 'bg-rose-300/80' : 'bg-cyan-200/65'
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate text-white/52">{formatAuditLabel(entry.type)}</span>
                  <span className="shrink-0 text-[10px] text-white/26">{formatRelativeTime(entry.at)}</span>
                </div>
                {auditOpen ? (
                  <div className="mt-0.5 space-y-0.5 pl-3.5 text-[10px]">
                    <div className="truncate text-white/28">{formatAuditTarget(entry)}</div>
                    {formatAuditRiskReason(entry) ? (
                      <div className="line-clamp-2 leading-4 text-amber-100/42">{formatAuditRiskReason(entry)}</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {auditOpen && auditLog.length > 10 ? (
            <div className="mt-1 px-1 text-[10px] text-white/26">还有 {auditLog.length - 10} 条未显示</div>
          ) : null}
        </div>
      ) : null}
      {latestBrowser ? (
        <div className="mt-2 rounded-md border border-white/[0.07] bg-white/[0.03] p-2">
          <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-white/48">
            <span>浏览器证据</span>
            <div className="flex items-center gap-2">
              {browserTargets.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setBrowserHistoryOpen(!browserHistoryOpen)}
                  className="rounded px-1.5 py-0.5 text-[10px] text-white/34 transition hover:bg-white/[0.06] hover:text-white/70"
                >
                  历史
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => clearBrowserTargets()}
                className="rounded px-1.5 py-0.5 text-[10px] text-white/34 transition hover:bg-white/[0.06] hover:text-white/70"
              >
                清空
              </button>
              <span>{formatRelativeTime(latestBrowser.updatedAt || latestBrowser.createdAt)}</span>
            </div>
          </div>
          <div className="truncate text-[12px] font-medium text-white/68">
            {latestBrowser.title || latestBrowser.url}
          </div>
          <div className="mt-1 truncate text-[10px] text-white/30">{latestBrowser.url}</div>
          <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
            <div
              className={`rounded px-2 py-1 ${
                latestBrowser.error ? 'bg-rose-400/10 text-rose-100/70' : 'bg-cyan-300/10 text-cyan-100/68'
              }`}
            >
              {formatBrowserEvidenceStatus(latestBrowser)}
            </div>
            <button
              type="button"
              onClick={() => inspectBrowserTarget(latestBrowser.url, 'progress-panel')}
              className="rounded bg-white/[0.045] px-2 py-1 text-white/45 transition hover:bg-white/[0.075] hover:text-white/78"
            >
              复查
            </button>
            <button
              type="button"
              onClick={() => startBrowserSessionTarget(latestBrowser.url, 'progress-preview-session')}
              className="rounded bg-white/[0.045] px-2 py-1 text-white/45 transition hover:bg-white/[0.075] hover:text-white/78"
            >
              预览
            </button>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-1 text-[10px]">
            {latestBrowser.sessionId ? (
              <button
                type="button"
                onClick={() => removeBrowserTarget(latestBrowser.id, true)}
                className="rounded bg-white/[0.045] px-2 py-1 text-white/42 transition hover:bg-rose-400/10 hover:text-rose-100/72"
              >
                关闭会话
              </button>
            ) : (
              <button
                type="button"
                onClick={() => removeBrowserTarget(latestBrowser.id)}
                className="rounded bg-white/[0.045] px-2 py-1 text-white/42 transition hover:bg-white/[0.075] hover:text-white/72"
              >
                移除记录
              </button>
            )}
            <button
              type="button"
              onClick={() => void copyBrowserScreenshotPath()}
              disabled={!latestBrowser.screenshotPath}
              className="rounded bg-white/[0.045] px-2 py-1 text-white/42 transition hover:bg-white/[0.075] hover:text-white/72 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {copiedBrowserId === latestBrowser.id ? '已复制' : '复制截图'}
            </button>
          </div>
          <div className="mt-1 grid grid-cols-3 gap-1 text-[10px]">
            <button
              type="button"
              onClick={() => void captureBrowserTargetEvidence(latestBrowser.id)}
              className="rounded bg-white/[0.045] px-2 py-1 text-white/42 transition hover:bg-white/[0.075] hover:text-white/72"
            >
              截图
            </button>
            <button
              type="button"
              onClick={() => void inspectBrowserTargetDom(latestBrowser.id)}
              className="rounded bg-white/[0.045] px-2 py-1 text-white/42 transition hover:bg-white/[0.075] hover:text-white/72"
            >
              DOM
            </button>
            <button
              type="button"
              onClick={() => void inspectBrowserTargetConsole(latestBrowser.id)}
              className="rounded bg-white/[0.045] px-2 py-1 text-white/42 transition hover:bg-white/[0.075] hover:text-white/72"
            >
              控制台
            </button>
          </div>
          <div className="mt-2 space-y-1 text-[10px] leading-4 text-white/38">
            {[
              latestBrowser.sessionPersisted
                ? `登录态复用：${latestBrowser.sessionProfile || latestBrowser.sessionId}`
                : latestBrowser.sessionId
                  ? '临时浏览器会话'
                  : '',
              latestBrowser.sessionSummary,
              latestBrowser.viewportSummary,
              latestBrowser.domSummary,
              latestBrowser.annotationSummary,
              latestBrowser.formSummary,
              latestBrowser.consoleSummary,
              latestBrowser.screenshotPath ? `截图：${latestBrowser.screenshotPath}` : ''
            ]
              .filter(Boolean)
              .slice(0, 3)
              .map((summary, index) => (
                <div key={`${latestBrowser.id}-${index}`} className="max-h-8 overflow-hidden rounded bg-black/10 px-2 py-1">
                  {summary}
                </div>
              ))}
          </div>
          {browserHistoryOpen && browserTargets.length > 1 ? (
            <div className="mt-2 space-y-1 border-t border-white/[0.06] pt-2">
              {browserTargets.slice(1, 6).map((target) => (
                <div
                  key={target.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 rounded bg-black/10 px-2 py-1"
                >
                  <button
                    type="button"
                    onClick={() => inspectBrowserTarget(target.url, 'progress-history')}
                    className="min-w-0 text-left text-[10px] text-white/42 transition hover:text-white/75"
                  >
                    <span className="block truncate">{target.title || target.url}</span>
                    <span className="block truncate text-white/26">{formatBrowserEvidenceStatus(target)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => inspectBrowserTarget(target.url, 'progress-history')}
                    className="rounded px-1.5 py-0.5 text-[10px] text-cyan-100/52 transition hover:bg-white/[0.06] hover:text-cyan-50"
                  >
                    查
                  </button>
                  <button
                    type="button"
                    onClick={() => removeBrowserTarget(target.id, !!target.sessionId)}
                    className="rounded px-1.5 py-0.5 text-[10px] text-white/28 transition hover:bg-rose-400/10 hover:text-rose-100/70"
                  >
                    移除
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {latestReview ? (
        <div className="mt-2 rounded-md border border-white/[0.07] bg-white/[0.03] p-2">
          <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-white/48">
            <span>审查摘要</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void copyLatestReview()}
                className="rounded px-1.5 py-0.5 text-[10px] text-white/38 transition hover:bg-white/[0.06] hover:text-white/72"
              >
                {copiedReviewId === latestReview.id ? '已复制' : '复制'}
              </button>
              <span>{formatRelativeTime(latestReview.createdAt)}</span>
            </div>
          </div>
          {latestReview.error ? (
            <div className="text-[11px] leading-5 text-rose-200/70">{latestReview.error}</div>
          ) : latestReview.files?.length ? (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-1 text-center text-[10px]">
                <div className="rounded bg-white/[0.045] px-1.5 py-1">
                  <div className="text-white/34">文件</div>
                  <div className="mt-0.5 text-white/72">{latestReview.files.length}</div>
                </div>
                <div className="rounded bg-emerald-300/10 px-1.5 py-1">
                  <div className="text-emerald-100/42">新增</div>
                  <div className="mt-0.5 text-emerald-100/78">+{latestReview.totalAdded || 0}</div>
                </div>
                <div className="rounded bg-rose-300/10 px-1.5 py-1">
                  <div className="text-rose-100/42">删除</div>
                  <div className="mt-0.5 text-rose-100/78">-{latestReview.totalDeleted || 0}</div>
                </div>
              </div>
              <div className="flex items-center justify-between rounded bg-white/[0.035] px-2 py-1 text-[11px]">
                <span className="text-white/38">风险</span>
                <span
                  className={`font-medium ${
                    latestReview.riskLevel === 'high'
                      ? 'text-rose-200/80'
                      : latestReview.riskLevel === 'medium'
                        ? 'text-amber-200/80'
                        : 'text-cyan-100/72'
                  }`}
                >
                  {formatReviewRisk(latestReview.riskLevel)}
                </span>
              </div>
              {latestReview.historyDelta ? (
                <div className="rounded border border-white/[0.055] bg-black/10 p-2">
                  <div className="mb-1 flex items-center justify-between text-[10px] text-white/34">
                    <span>与上轮对比</span>
                    <span>
                      {latestReview.historyDelta.previousAt
                        ? formatRelativeTime(latestReview.historyDelta.previousAt)
                        : '上轮'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center text-[10px]">
                    <div className="rounded bg-white/[0.04] px-1 py-1">
                      <div className="text-white/30">新增</div>
                      <div className="text-white/70">{latestReview.historyDelta.newFiles.length}</div>
                    </div>
                    <div className="rounded bg-white/[0.04] px-1 py-1">
                      <div className="text-white/30">已消失</div>
                      <div className="text-white/70">{latestReview.historyDelta.resolvedFiles.length}</div>
                    </div>
                    <div className="rounded bg-white/[0.04] px-1 py-1">
                      <div className="text-white/30">仍在改</div>
                      <div className="text-white/70">{latestReview.historyDelta.unchangedFiles.length}</div>
                    </div>
                  </div>
                  <div className="mt-1 flex items-center justify-between rounded bg-white/[0.035] px-2 py-1 text-[10px]">
                    <span className="text-white/30">增删变化</span>
                    <span className="text-white/58">
                      {formatSignedNumber(latestReview.historyDelta.addedDelta)} / {formatSignedNumber(latestReview.historyDelta.deletedDelta)}
                    </span>
                  </div>
                  {latestReview.historyDelta.newFiles.length ? (
                    <div className="mt-1 truncate text-[10px] text-emerald-100/52">
                      新增：{latestReview.historyDelta.newFiles.slice(0, 3).join('，')}
                    </div>
                  ) : null}
                  {latestReview.historyDelta.resolvedFiles.length ? (
                    <div className="mt-1 truncate text-[10px] text-cyan-100/48">
                      已消失：{latestReview.historyDelta.resolvedFiles.slice(0, 3).join('，')}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="max-h-36 space-y-1 overflow-auto">
                {latestReview.files.slice(0, 6).map((file) => (
                  <div
                    key={`${file.path}-${file.status || ''}`}
                    className="rounded border border-white/[0.055] bg-black/10 px-2 py-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          file.risk === 'high'
                            ? 'bg-rose-300/80'
                            : file.risk === 'medium'
                              ? 'bg-amber-200/80'
                              : 'bg-cyan-200/60'
                        }`}
                      />
                      <span className="min-w-0 flex-1 truncate text-[11px] text-white/58">
                        {file.path}
                      </span>
                      {file.status ? (
                        <span className="shrink-0 text-[10px] text-white/28">{file.status}</span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex gap-2 pl-3.5 text-[10px]">
                      <span className="text-emerald-100/55">+{file.added || 0}</span>
                      <span className="text-rose-100/55">-{file.deleted || 0}</span>
                    </div>
                  </div>
                ))}
              </div>
              {latestReview.files.length > 6 ? (
                <div className="px-1 text-[10px] text-white/30">
                  还有 {latestReview.files.length - 6} 个文件未显示
                </div>
              ) : null}
              {latestReview.diffSnippets?.length ? (
                <div className="space-y-1 border-t border-white/[0.06] pt-2">
                  <div className="flex items-center justify-between px-1 text-[10px] text-white/34">
                    <span>Diff 片段</span>
                    <div className="flex items-center gap-1">
                      <label className="flex items-center gap-1 text-white/30">
                        <span>PR</span>
                        <input
                          value={reviewPrNumber}
                          onChange={(event) => {
                            setReviewPrNumber(event.target.value)
                            localStorage.setItem(WORKSPACE_REVIEW_PR_KEY, event.target.value)
                          }}
                          placeholder="#"
                          className="h-5 w-12 rounded border border-white/[0.08] bg-black/20 px-1 text-[10px] text-white/68 outline-none transition placeholder:text-white/24 focus:border-cyan-200/30"
                        />
                      </label>
                      {latestReview.diffSnippets.length > 3 ? (
                        <button
                          type="button"
                          onClick={() => setReviewDiffsOpen((value) => !value)}
                          className="rounded px-1.5 py-0.5 text-white/34 transition hover:bg-white/[0.06] hover:text-white/70"
                        >
                          {reviewDiffsOpen ? '收起' : `全部 ${latestReview.diffSnippets.length}`}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void copyLatestDiffSnippets()}
                        className="rounded px-1.5 py-0.5 text-white/34 transition hover:bg-white/[0.06] hover:text-white/70"
                      >
                        {copiedDiffId === latestReview.id ? '已复制' : '复制 diff'}
                      </button>
                    </div>
                  </div>
                  {(reviewDiffsOpen ? latestReview.diffSnippets : latestReview.diffSnippets.slice(0, 3)).map((snippet) => {
                    const isOpen = expandedReviewPath === snippet.path
                    return (
                      <div key={snippet.path} className="rounded border border-white/[0.055] bg-black/10">
                        <button
                          type="button"
                          onClick={() => setExpandedReviewPath(isOpen ? null : snippet.path)}
                          className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-[11px] text-white/52 transition hover:bg-white/[0.035] hover:text-white/72"
                        >
                          <span className="min-w-0 flex-1 truncate">{snippet.path}</span>
                          <span className="shrink-0 text-[10px] text-white/28">
                            {snippet.hunkCount ? `${snippet.hunkCount} hunks` : isOpen ? '收起' : '展开'}
                          </span>
                        </button>
                        {isOpen ? (
                          snippet.hunks?.length ? (
                            <div className="max-h-60 space-y-1 overflow-auto border-t border-white/[0.055] p-1.5">
                              {snippet.hunks.map((hunk, index) => (
                                <div key={`${snippet.path}-${hunk.header}-${index}`} className="rounded bg-white/[0.025]">
                                  <div className="flex items-center gap-2 border-b border-white/[0.045] px-2 py-1 text-[10px]">
                                    <span className="min-w-0 flex-1 truncate text-cyan-100/58">
                                      {index + 1}. {hunk.header}
                                    </span>
                                    <span className="shrink-0 text-white/24">
                                      L{getHunkReviewLine(hunk) || '-'}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => void copyHunkCommentDraft(snippet.path, hunk, index)}
                                      className="shrink-0 rounded px-1.5 py-0.5 text-white/30 transition hover:bg-white/[0.06] hover:text-white/70"
                                    >
                                      {copiedHunkKey === `${snippet.path}-${index}` ? '已复制' : '评论'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => startHunkPublish(snippet.path, hunk, index)}
                                      className="shrink-0 rounded px-1.5 py-0.5 text-cyan-100/42 transition hover:bg-cyan-300/10 hover:text-cyan-50"
                                    >
                                      回写
                                    </button>
                                  </div>
                                  {activePublishKey === `${snippet.path}-${index}` ? (
                                    <div className="space-y-1 border-b border-white/[0.045] p-2">
                                      <textarea
                                        value={hunkPublishDraft}
                                        onChange={(event) => setHunkPublishDraft(event.target.value)}
                                        className="min-h-20 w-full resize-y rounded-md border border-white/[0.08] bg-black/20 px-2 py-1.5 text-[10px] leading-4 text-white/68 outline-none transition placeholder:text-white/24 focus:border-cyan-200/30"
                                      />
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="min-w-0 flex-1 truncate text-[10px] text-white/32">
                                          {hunkPublishMessage || '确认后会写到 GitHub PR 行内评论'}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => void publishHunkComment(snippet.path, hunk, index)}
                                          disabled={publishingHunkKey === `${snippet.path}-${index}`}
                                          className="shrink-0 rounded bg-cyan-300/12 px-2 py-1 text-[10px] text-cyan-50/80 transition hover:bg-cyan-300/18 disabled:cursor-not-allowed disabled:opacity-45"
                                        >
                                          {publishingHunkKey === `${snippet.path}-${index}` ? '发送中' : '发送'}
                                        </button>
                                      </div>
                                    </div>
                                  ) : null}
                                  <pre className="max-h-36 overflow-auto px-2 py-1.5 text-[10px] leading-4 text-white/46">
                                    {hunk.body || '(空 hunk)'}
                                  </pre>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <pre className="max-h-40 overflow-auto border-t border-white/[0.055] px-2 py-1.5 text-[10px] leading-4 text-white/46">
                              {snippet.diff}
                            </pre>
                          )
                        ) : null}
                      </div>
                    )
                  })}
                  {!reviewDiffsOpen && latestReview.diffSnippets.length > 3 ? (
                    <button
                      type="button"
                      onClick={() => setReviewDiffsOpen(true)}
                      className="w-full rounded border border-dashed border-white/[0.055] px-2 py-1.5 text-left text-[10px] text-white/30 transition hover:border-white/[0.1] hover:text-white/58"
                    >
                      还有 {latestReview.diffSnippets.length - 3} 个 diff 文件，展开查看全部 hunk
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : latestReview.diffStat ? (
            <pre className="max-h-28 overflow-auto whitespace-pre-wrap text-[10px] leading-4 text-white/42">
              {latestReview.diffStat}
            </pre>
          ) : (
            <div className="text-[11px] text-white/34">没有未提交 diff</div>
          )}
        </div>
      ) : null}
      {previewAttachment ? (
        <AttachmentPreview attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
      ) : null}
    </>
  )
}

function TaskList({
  tasks,
  onCreate,
  onReview
}: {
  tasks: WorkspaceTaskItem[]
  onCreate: () => void
  onReview: () => void
}) {
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={onCreate}
          className="h-8 rounded-md bg-white/[0.055] text-xs text-white/62 transition hover:bg-white/[0.09] hover:text-white"
        >
          新建任务
        </button>
        <button
          type="button"
          onClick={onReview}
          className="h-8 rounded-md bg-cyan-300/[0.08] text-xs text-cyan-100/70 transition hover:bg-cyan-300/[0.13] hover:text-cyan-50"
        >
          审查改动
        </button>
      </div>
      {tasks.length ? (
        tasks.slice(0, 8).map((task) => {
          const isOpen = expandedTaskId === task.id
          return (
            <div key={task.id} className="rounded-md px-1 py-1 text-xs text-white/54">
              <button
                type="button"
                onClick={() => setExpandedTaskId(isOpen ? null : task.id)}
                className="flex w-full items-center gap-2 rounded px-0 py-0.5 text-left transition hover:text-white/78"
              >
                <ListChecks size={13} className="shrink-0 text-cyan-200/55" />
                <span className="min-w-0 flex-1 truncate">{task.name}</span>
                <span className="shrink-0 text-[11px] text-white/30">
                  {formatTaskChannel(task.channel)} · {formatTaskStatus(task.status)}
                </span>
              </button>
              {isOpen ? (
                <div className="mt-1 ml-5 rounded bg-white/[0.035] px-2 py-1.5 text-[11px] leading-5 text-white/38">
                  <div>{task.detail || '暂无详情'}</div>
                  <div className="mt-0.5 text-[10px] text-white/24">
                    {formatRelativeTime(task.updatedAt)}前更新
                  </div>
                </div>
              ) : null}
            </div>
          )
        })
      ) : (
        <div className="px-1 py-2 text-xs text-white/34">暂无任务</div>
      )}
    </div>
  )
}

function RightMetric({
  label,
  value,
  tone
}: {
  label: string
  value: string
  tone: 'green' | 'red'
}) {
  return (
    <div className="mb-2 flex items-center justify-between rounded-md px-2 py-1.5 text-xs">
      <span className="text-white/48">{label}</span>
      <span className={tone === 'green' ? 'text-emerald-300' : 'text-rose-300'}>{value}</span>
    </div>
  )
}

function PanelBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5 border-t border-white/8 pt-4">
      <h3 className="mb-2 text-xs font-medium text-white/34">{title}</h3>
      <div className="space-y-1">{children}</div>
    </section>
  )
}

function InfoRow({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-white/58">
      <Icon size={14} className="text-white/36" />
      <span className="min-w-0 truncate">{label}</span>
    </div>
  )
}

function formatRelativeTime(value?: string) {
  if (!value) return '最近'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '最近'
  const diff = Date.now() - date.getTime()
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < hour) return `${Math.max(1, Math.round(diff / minute))} 分`
  if (diff < day) return `${Math.round(diff / hour)} 小时`
  return `${Math.round(diff / day)} 天`
}

function formatElapsed(value?: number) {
  if (!value || value < 1000) return '0s'
  const seconds = Math.round(value / 1000)
  const minutes = Math.floor(seconds / 60)
  const restSeconds = seconds % 60
  if (minutes <= 0) return `${seconds}s`
  return `${minutes}m ${restSeconds}s`
}

function formatRetryTime(value?: string) {
  if (!value) return ''
  const next = new Date(value).getTime()
  if (!Number.isFinite(next)) return ''
  const diff = next - Date.now()
  if (diff <= 0) return '可重试'
  const minutes = Math.max(1, Math.ceil(diff / 60000))
  return `${minutes} 分钟后可重试`
}

function formatReviewRisk(value?: WorkspaceReviewReport['riskLevel']) {
  if (value === 'high') return '高'
  if (value === 'medium') return '中'
  return '低'
}

function formatSignedNumber(value = 0) {
  if (value > 0) return `+${value}`
  return `${value}`
}

function formatBrowserEvidenceStatus(target: WorkspaceBrowserTarget) {
  if (target.error) return '失败'
  if (target.sessionId) return '会话已连接'
  if (target.consoleSummary) return '控制台已诊断'
  if (target.screenshotPath) return target.httpStatus ? `截图 · HTTP ${target.httpStatus}` : '截图已留存'
  if (target.httpStatus) return `HTTP ${target.httpStatus}`
  if (target.status === 'reviewing') return '检查中'
  return target.status === 'done' ? '已完成' : '已记录'
}

function createWorkspaceBrowserProfileId(file?: WorkspaceFile | null, folder?: WorkspaceFolder | null) {
  const source = file?.id || folder?.id || 'workspace'
  return `workspace-${String(source).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'default'}`
}

function formatMaterialKind(item: WorkspaceAttachment) {
  if (item.kind === 'folder') return '文件夹'
  if (item.kind === 'project-directory') return '项目目录'
  if (item.isImage) return '图片'
  if (item.isVideo) return '视频'
  if (item.isAudio) return '音频'
  if (item.isPDF) return 'PDF'
  if (item.isDoc) return '文档'
  if (item.isExcel) return '表格'
  if (item.isCode) return '代码'
  return '文件'
}

function formatAuditLabel(type?: string) {
  const approvedOperation = getAuditOperation(type, 'approved_')
  if (approvedOperation) return `已批准：${formatOperationName(approvedOperation)}`
  const rejectedOperation = getAuditOperation(type, 'rejected_')
  if (rejectedOperation) return `已拒绝：${formatOperationName(rejectedOperation)}`
  const labels: Record<string, string> = {
    workspace_index_rebuilt: '目录索引已扫描',
    workspace_skill_completed: '技能执行完成',
    workspace_skill_failed: '技能执行失败',
    workspace_automation_completed: '自动化已完成',
    workspace_automation_failed: '自动化失败',
    workspace_automation_template_created: '自动化模板已创建',
    workspace_automation_timer_created: '定时计划已创建',
    workspace_automation_timer_failed: '定时计划创建失败',
    workspace_automation_timer_cancelled: '定时计划已取消',
    workspace_automation_timer_cancel_failed: '定时计划取消失败',
    workspace_automation_retry_created: '自动化重试已创建',
    workspace_automation_retry_running: '自动化重试执行中',
    workspace_automation_retry_dispatched: '自动化重试已派发',
    workspace_automation_retry_dispatch_failed: '自动化重试派发失败',
    workspace_recommended_skills_installed: '推荐技能已安装',
    workspace_review_summary: '改动审查完成',
    workspace_review_failed: '改动审查失败',
    workspace_exported: '工作台已导出',
    workspace_export_failed: '工作台导出失败',
    workspace_imported: '工作台已导入',
    workspace_import_failed: '工作台导入失败',
    workspace_import_missing_directories: '导入目录待修复',
    workspace_import_directory_rebound: '导入目录已重绑',
    workspace_folder_rebound: '项目目录已重绑',
    workspace_folder_access_defaults_saved: '项目默认权限已保存',
    workspace_folder_access_defaults_applied: '项目默认权限已套用',
    workspace_connector_connected: '连接器已启用',
    workspace_connector_disconnected: '连接器已停用',
    github_pr_comment_posted: 'PR 评论已回写',
    github_pr_inline_comment_posted: 'PR 行内评论已回写',
    github_pr_comment_failed: 'PR 评论回写失败',
    github_pr_review_submitted: 'PR Review 已提交',
    github_pr_review_failed: 'PR Review 提交失败',
    gitlab_mr_comment_posted: 'GitLab MR 评论已回写',
    gitlab_mr_comment_failed: 'GitLab MR 评论回写失败',
    workspace_document_search: '工作台文档检索',
    workspace_document_search_empty: '工作台文档检索无结果',
    workspace_attachment_cache_failed: '素材缓存失败',
    workspace_feishu_confirmation_created: '飞书确认任务已创建',
    workspace_feishu_confirmation_approved: '飞书确认已回写',
    workspace_feishu_confirmation_rejected: '飞书确认已拒绝',
    browser_opened: '浏览器已打开',
    browser_open_failed: '浏览器打开失败',
    browser_url_inspected: '页面检查完成',
    browser_url_inspect_failed: '页面检查失败',
    browser_session_started: '浏览器会话已启动',
    browser_session_start_failed: '浏览器会话失败',
    browser_cookies_imported: '浏览器登录态已导入',
    browser_cookies_import_failed: '浏览器登录态导入失败',
    browser_profiles_listed: '外部浏览器 Profile 已发现',
    browser_profiles_list_failed: '外部浏览器 Profile 发现失败',
    browser_profile_cookies_imported: '外部浏览器登录态已直读',
    browser_profile_cookies_import_failed: '外部浏览器登录态直读失败',
    browser_screenshot_captured: '页面截图已保存',
    browser_screenshot_failed: '页面截图失败',
    browser_dom_inspected: 'DOM 已读取',
    browser_dom_failed: 'DOM 读取失败',
    browser_console_inspected: '控制台已诊断',
    browser_console_failed: '控制台诊断失败',
    browser_session_console: '会话控制台已诊断',
    browser_session_console_failed: '会话控制台诊断失败',
    browser_session_closed: '浏览器会话已关闭',
    browser_target_removed: '浏览器记录已移除',
    browser_targets_cleared: '浏览器记录已清空',
    operation_approved: '操作已批准',
    operation_rejected: '操作已拒绝',
    project_directory_opened: '项目目录已打开'
  }
  return labels[type || ''] || type || '操作记录'
}

function formatAuditTarget(entry: WorkspaceAuditEntry) {
  if (entry.error) return `错误：${entry.error}`
  return entry.targetPath || entry.sourcePath || entry.command || '无目标'
}

function formatAuditRiskReason(entry: WorkspaceAuditEntry) {
  const operation = getAuditOperation(entry.type, 'approved_') || getAuditOperation(entry.type, 'rejected_')
  return operation ? formatOperationRiskReason(operation) : ''
}

function getAuditOperation(type = '', prefix: 'approved_' | 'rejected_') {
  return type.startsWith(prefix) ? type.slice(prefix.length) : ''
}

function fileToWorkspaceAttachment(file: File): Promise<WorkspaceAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async (event) => {
      const rawContent = event.target?.result
      const fileExt = file.name.split('.').pop()?.toLowerCase() || ''
      const isImage = file.type.startsWith('image/')
      const isVideo = file.type.startsWith('video/')
      const isAudio = file.type.startsWith('audio/')
      const isPDF = file.type === 'application/pdf' || fileExt === 'pdf'
      const isDoc = ['doc', 'docx'].includes(fileExt) || file.type.includes('word')
      const isExcel =
        ['xls', 'xlsx'].includes(fileExt) ||
        file.type.includes('excel') ||
        file.type.includes('spreadsheet')
      const isReadableText = isReadableTextAttachment(file.type, fileExt)
      const isCode = [
        'js',
        'jsx',
        'ts',
        'tsx',
        'py',
        'html',
        'css',
        'json',
        'csv',
        'xml',
        'yaml',
        'yml',
        'md',
        'txt',
        'srt',
        'sh',
        'bash'
      ].includes(fileExt)
      let extractedText = ''
      let extractError = ''
      let binaryDataUrl = ''
      let documentIndex: DocumentExtractionIndex | undefined
      if (fileExt === 'docx' && rawContent instanceof ArrayBuffer) {
        try {
          extractedText = await extractTextFromDocx(rawContent)
          documentIndex = createTextDocumentIndex(extractedText)
        } catch (error) {
          extractError = error instanceof Error ? error.message : 'Word 文档解析失败'
        }
      } else if (isPDF && rawContent instanceof ArrayBuffer) {
        binaryDataUrl = arrayBufferToDataUrl(rawContent, file.type || 'application/pdf')
        try {
          documentIndex = await extractPdfDocumentIndex(rawContent, { maxPages: 80 })
          extractedText = renderDocumentIndexPreview(documentIndex, 12)
        } catch (error) {
          extractError = error instanceof Error ? error.message : 'PDF 文本解析失败'
        }
      } else if (isExcel && rawContent instanceof ArrayBuffer) {
        try {
          documentIndex = await extractExcelDocumentIndex(rawContent, {
            maxSheets: 20,
            rowsPerChunk: 50,
            maxRowsPerSheet: 1200,
            maxColumns: 24
          })
          extractedText = renderDocumentIndexPreview(documentIndex, 10)
        } catch (error) {
          extractError = error instanceof Error ? error.message : 'Excel 表格解析失败'
        }
      }
      const content = binaryDataUrl || extractedText || (typeof rawContent === 'string' ? rawContent : '')
      const textContent = extractedText || (content && !content.startsWith('data:') ? content : '')
      if (!documentIndex && textContent) {
        documentIndex = createTextDocumentIndex(textContent)
      }
      const extractionWarning = getDocumentExtractionWarning(extractedText, { isPDF, isExcel })
      const textExcerpt =
        (isReadableText || extractedText) && textContent
          ? createTextAttachmentExcerpt(textContent, 180)
          : ''
      const summaryParts = [
        formatFileSize(file.size),
        extractedText
          ? `${isPDF ? 'PDF 文本' : isExcel ? '表格文本' : 'Word 文本'} ${formatFileSize(extractedText.length)}`
          : '',
        documentIndex?.chunks?.length ? `已索引 ${documentIndex.chunks.length} 块` : '',
        extractionWarning,
        textExcerpt,
        extractError
      ].filter(Boolean)

      resolve({
        id: `workspace-file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        type: file.type || 'application/octet-stream',
        content: typeof content === 'string' ? content : '',
        textContent,
        fileExt,
        isImage,
        isVideo,
        isAudio,
        isPDF,
        isDoc,
        isExcel,
        isCode,
        kind: 'file',
        path: (file as any).path || undefined,
        summary: summaryParts.join(' · '),
        documentIndex
      })
    }

    if (
      file.type.startsWith('image/') ||
      file.type.startsWith('video/') ||
      file.type.startsWith('audio/')
    ) {
      if (!canReadFileAsDataUrl(file, 'Workspace attachment')) {
        reject(new Error('Workspace attachment is too large for base64 fallback'))
        return
      }
      reader.readAsDataURL(file)
    } else if (
      file.name.match(/\.(docx|pdf|xls|xlsx)$/i) ||
      file.type.includes('spreadsheet') ||
      file.type.includes('excel')
    ) {
      reader.readAsArrayBuffer(file)
    } else if (isReadableTextAttachment(file.type, file.name.split('.').pop()?.toLowerCase() || '')) {
      reader.readAsText(file)
    } else {
      if (!canReadFileAsDataUrl(file, 'Workspace attachment')) {
        reject(new Error('Workspace attachment is too large for base64 fallback'))
        return
      }
      reader.readAsDataURL(file)
    }
  })
}

async function persistWorkspaceAttachments(
  project: WorkspaceFile,
  attachments: WorkspaceAttachment[]
): Promise<WorkspaceAttachment[]> {
  if (!project?.id || !project.cacheRoot || !window.api?.localCacheAPI?.saveCache) {
    return attachments
  }

  return Promise.all(
    attachments.map(async (attachment) => {
      const shouldPersist =
        !attachment.path &&
        attachment.content?.startsWith('data:') &&
        (attachment.isImage || attachment.isVideo || attachment.isAudio || attachment.isPDF)
      if (!shouldPersist) return attachment

      const type = attachment.isVideo ? 'video' : attachment.isAudio ? 'audio' : attachment.isImage ? 'image' : 'other'
      const ext = attachment.fileExt ? `.${attachment.fileExt.replace(/^\./, '')}` : inferAttachmentExtension(attachment)
      const result = await window.api.localCacheAPI.saveCache({
        id: attachment.id,
        content: attachment.content,
        category: 'workspace',
        ext,
        type,
        projectId: project.id,
        cacheRoot: project.cacheRoot
      })

      if (!result?.success) {
        return {
          ...attachment,
          cacheError: result?.error || '缓存写入失败'
        }
      }
      return {
        ...attachment,
        path: result.path,
        cachedUrl: result.url,
        cacheError: undefined
      }
    })
  )
}

function inferAttachmentExtension(attachment: WorkspaceAttachment) {
  if (attachment.type === 'image/png') return '.png'
  if (attachment.type === 'image/webp') return '.webp'
  if (attachment.type === 'image/gif') return '.gif'
  if (attachment.type === 'video/webm') return '.webm'
  if (attachment.type === 'video/quicktime') return '.mov'
  if (attachment.type === 'audio/mpeg') return '.mp3'
  if (attachment.type === 'audio/wav') return '.wav'
  if (attachment.isPDF) return '.pdf'
  if (attachment.isVideo) return '.mp4'
  if (attachment.isAudio) return '.m4a'
  return '.jpg'
}

function sanitizeWorkspaceMessages(messages: WorkspaceMessage[]) {
  return messages.map((message) => ({
    ...message,
    attachments: message.attachments ? sanitizeWorkspaceAttachments(message.attachments) : undefined
  }))
}

function sanitizeWorkspaceAttachments(attachments: WorkspaceAttachment[]) {
  return attachments.map((attachment) => ({
    ...attachment,
    textContent: attachment.textContent ? createTextAttachmentContext(attachment.textContent, 30000) : attachment.textContent,
    content:
      attachment.isImage || attachment.isVideo || attachment.isAudio || attachment.isPDF
        ? ''
        : attachment.content
          ? createTextAttachmentContext(attachment.content, 30000)
          : attachment.content,
    documentIndex: attachment.documentIndex
      ? {
          ...attachment.documentIndex,
          chunks: attachment.documentIndex.chunks
            .slice(0, 160)
            .map((chunk) => ({ ...chunk, text: createTextAttachmentContext(chunk.text, 5000) }))
        }
      : undefined
  }))
}

function getDocumentExtractionWarning(
  text: string,
  options: { isPDF?: boolean; isExcel?: boolean }
) {
  if (!text) return ''
  if (options.isPDF) {
    const match = text.match(/\.\.\. \((\d+) more pages not included\)/i)
    return match ? `已截断：还有 ${match[1]} 页未进入上下文` : ''
  }
  if (options.isExcel) {
    const rowMatches = [...text.matchAll(/\.\.\. \((\d+) more rows\)/gi)]
    const sheetMatch = text.match(/\.\.\. \((\d+) more sheets not included\)/i)
    const hiddenRows = rowMatches.reduce((sum, match) => sum + Number(match[1] || 0), 0)
    const parts = [
      hiddenRows ? `还有 ${hiddenRows} 行未进入上下文` : '',
      sheetMatch ? `还有 ${sheetMatch[1]} 个工作表未进入上下文` : ''
    ].filter(Boolean)
    return parts.length ? `已截断：${parts.join('，')}` : ''
  }
  return ''
}

function readWorkspaceArray<T = any>(key: string): T[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function safeParseSetting(key: string) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null')
  } catch {
    return null
  }
}

function normalizeWorkspaceApprovalMode(
  value?: string | null,
  fallback: 'request' | 'risky' | 'auto' = 'request'
): 'request' | 'risky' | 'auto' {
  return value === 'auto' || value === 'risky' || value === 'request' ? value : fallback
}

function formatApprovalModeLabel(value: 'request' | 'risky' | 'auto') {
  if (value === 'auto') return '完全访问'
  if (value === 'risky') return '帮我批准'
  return '请求批准'
}

function formatOperationName(value: string) {
  const labels: Record<string, string> = {
    write_text_file: '写入文件',
    copy_path: '复制路径',
    move_path: '移动路径',
    delete_path: '删除路径',
    run_command: '执行命令',
    start_terminal: '启动终端'
  }
  return labels[value] || value
}

function formatToolCallName(name?: string) {
  const labels: Record<string, string> = {
    get_workspace_context: '读取工作台上下文',
    get_workspace_git_summary: '读取 Git 改动',
    search_workspace_documents: '检索工作台文档',
    post_github_pr_comment: '回写 GitHub PR 评论',
    submit_github_pr_review: '提交 GitHub PR Review',
    post_gitlab_mr_comment: '回写 GitLab MR 评论',
    inspect_browser_url: '检查网页',
    inspect_browser_dom: '读取 DOM',
    capture_browser_url_screenshot: '网页截图',
    capture_browser_viewport_matrix: '响应式截图',
    annotate_browser_screenshot: '标注网页截图',
    inspect_browser_console: '诊断控制台',
    start_browser_session: '启动浏览器会话',
    inspect_browser_session_dom: '读取会话 DOM',
    inspect_browser_session_console: '诊断会话控制台',
    click_browser_session_element: '点击会话元素',
    fill_browser_session_form: '填写会话表单',
    capture_browser_session_screenshot: '会话截图',
    close_browser_session: '关闭浏览器会话',
    import_browser_cookies: '导入浏览器登录态',
    list_external_browser_profiles: '发现外部浏览器 Profile',
    import_external_browser_profile_cookies: '直读外部浏览器登录态',
    read_local_file: '读取本机文件',
    list_local_directory: '读取本机目录',
    write_local_file: '写入本机文件',
    run_local_command: '执行本机命令',
    start_terminal_session: '启动终端会话'
  }
  return labels[name || ''] || name || '工具调用'
}

function formatOperationStatus(value?: WorkspacePendingOperation['status']) {
  if (value === 'approved') return '已批准'
  if (value === 'rejected') return '已拒绝'
  if (value === 'failed') return '失败'
  return '待批准'
}

function formatOperationRiskReason(value: string) {
  const reasons: Record<string, string> = {
    write_text_file: '会修改本机文件内容，请确认目标路径、写入内容和覆盖范围。',
    copy_path: '会复制本机文件或目录，若目标已存在可能造成覆盖或混淆。',
    move_path: '会移动或重命名本机文件/目录，原路径可能不再可用。',
    delete_path: '会删除本机文件或目录，删除后可能无法从软件内恢复。',
    run_command: '会在本机执行命令，可能读写文件、访问网络或启动进程。',
    start_terminal: '会启动可持续运行的本机终端会话，后续输入会继续影响当前目录。'
  }
  return reasons[value] || '该操作会影响本机环境或项目文件，请确认目标和影响范围。'
}

function formatOperationResultDetail(operation: WorkspacePendingOperation, result: any) {
  const lines = [
    `操作：${formatOperationName(operation.operation)}`,
    operation.targetPath ? `目标：${operation.targetPath}` : '',
    operation.sourcePath ? `来源：${operation.sourcePath}` : '',
    operation.command ? `命令：${operation.command}` : '',
    operation.cwd ? `目录：${operation.cwd}` : '',
    result?.success ? '结果：成功' : `结果：失败${result?.error ? `，${result.error}` : ''}`,
    result?.path ? `路径：${result.path}` : '',
    result?.targetPath ? `目标路径：${result.targetPath}` : '',
    result?.stdout ? `输出：${String(result.stdout).slice(0, 1200)}` : '',
    result?.stderr ? `错误输出：${String(result.stderr).slice(0, 1200)}` : ''
  ].filter(Boolean)
  return lines.join('\n')
}

function formatTaskChannel(value?: WorkspaceTaskItem['channel']) {
  const labels: Record<string, string> = {
    local: '本地',
    feishu: '飞书',
    production: '生产',
    canvas: '画布',
    browser: '浏览器',
    review: '审查',
    skill: '技能',
    automation: '自动化'
  }
  return labels[value || 'local'] || '本地'
}

function formatTaskStatus(value?: WorkspaceTaskItem['status']) {
  const labels: Record<string, string> = {
    pending: '待处理',
    running: '进行中',
    done: '完成',
    failed: '失败',
    waiting: '等待'
  }
  return labels[value || 'waiting'] || '等待'
}

function installRecommendedSkills() {
  const raw = safeParseSetting('xinghe_skills') || {}
  const next = { ...raw }
  const now = Date.now()
  recommendedSkillSeeds.forEach((seed) => {
    const existing: any = Object.values(next).find((item: any) => item?.name === seed.name)
    const id = existing?.id || `skill-${now}-${Math.random().toString(36).slice(2, 8)}`
    next[id] = {
      ...(existing || {}),
      id,
      name: seed.name,
      description: seed.description,
      icon: seed.icon,
      variables: existing?.variables || [],
      steps: seed.steps,
      updatedAt: now,
      source: 'workspace-recommended'
    }
  })
  localStorage.setItem('xinghe_skills', JSON.stringify(next))
  return Object.keys(next).length
}

function readWorkspaceConnectors(): WorkspaceConnector[] {
  const stored = getSettingJSON(WORKSPACE_CONNECTORS_KEY, []) as WorkspaceConnector[]
  const storedById = new Map(stored.map((item) => [item.id, item]))
  return workspaceConnectorSeeds.map((seed) => {
    const storedItem = storedById.get(seed.id) as WorkspaceConnector | undefined
    return {
      ...seed,
      ...storedItem,
      scopes: storedItem?.scopes?.length ? storedItem.scopes : seed.scopes
    }
  })
}

function writeWorkspaceConnectors(connectors: WorkspaceConnector[]) {
  setSettingJSON(WORKSPACE_CONNECTORS_KEY, connectors)
  window.dispatchEvent(new CustomEvent('workspace:connector-updated', { detail: connectors }))
}

function readLocalWorkspaceSkills() {
  const raw = safeParseSetting('xinghe_skills') || {}
  return Object.values(raw)
    .filter((item: any) => item?.id && item?.name)
    .sort((a: any, b: any) => Number(b?.updatedAt || b?.createdAt || 0) - Number(a?.updatedAt || a?.createdAt || 0))
    .map((item: any) => ({
      id: String(item.id),
      name: String(item.name),
      description: item.description ? String(item.description) : '',
      steps: Array.isArray(item.steps) ? item.steps : []
    }))
}

function buildWorkspaceRequestText({
  text,
  attachments,
  planMode,
  goalMode,
  project,
  approvalMode,
  materialRefs = [],
  workspaceIndex = [],
  browserTargets = [],
  pendingOperations = []
}: {
  text: string
  attachments: WorkspaceAttachment[]
  planMode: boolean
  goalMode: boolean
  project?: any
  approvalMode: 'request' | 'risky' | 'auto'
  materialRefs?: WorkspaceMaterialRef[]
  workspaceIndex?: WorkspaceIndexItem[]
  browserTargets?: WorkspaceBrowserTarget[]
  pendingOperations?: WorkspacePendingOperation[]
}) {
  const attachmentLines = attachments.map((item) => {
    const tags = [
      item.isImage ? '图片' : '',
      item.isAudio ? '音频' : '',
      item.isVideo ? '视频' : '',
      item.isPDF ? 'PDF' : '',
      item.isDoc ? '文档' : '',
      item.isExcel ? '表格' : '',
      item.isCode ? '文本/代码' : '',
      item.kind === 'folder' ? '文件夹' : '',
      item.kind === 'project-directory' ? '项目目录' : ''
    ].filter(Boolean)
    const contextSource =
      item.textContent ||
      ((isReadableTextAttachment(item.type, item.fileExt) || item.isDoc) && item.content && !item.content.startsWith('data:')
        ? item.content
        : '')
    const textContext = contextSource ? createTextAttachmentContext(contextSource) : ''
    return [
      `- ${item.name}${tags.length ? `（${tags.join('/')}）` : ''}`,
      item.path ? `  路径: ${item.path}` : '',
      item.summary ? `  摘要: ${item.summary}` : '',
      textContext ? `  文本预览:\n${textContext.split('\n').map((line) => `    ${line}`).join('\n')}` : ''
    ]
      .filter(Boolean)
      .join('\n')
  })

  const browserContext = browserTargets.length
    ? `【浏览器目标】\n${browserTargets
        .slice(0, 3)
        .map((target) => {
          const meta = [
            target.note,
            target.httpStatus ? `HTTP ${target.httpStatus}` : '',
            target.title ? `标题: ${target.title}` : '',
            target.screenshotPath ? `截图: ${target.screenshotPath}` : '',
            target.domSummary ? `DOM: ${target.domSummary}` : '',
            target.viewportSummary ? `视口: ${target.viewportSummary}` : '',
            target.annotationSummary ? `标注: ${target.annotationSummary}` : '',
            target.formSummary ? `表单: ${target.formSummary}` : '',
            target.consoleSummary ? `控制台: ${target.consoleSummary}` : '',
            target.sessionId ? `会话: ${target.sessionId}` : '',
            target.sessionPersisted
              ? `登录态复用: ${target.sessionProfile || target.sessionId}`
              : '',
            target.sessionSummary ? `会话状态: ${target.sessionSummary}` : '',
            target.action ? `动作: ${target.action}` : '',
            target.finalUrl ? `结果: ${target.finalUrl}` : '',
            target.error ? `错误: ${target.error}` : ''
          ].filter(Boolean)
          return `- ${target.url}${meta.length ? ` (${meta.join('；')})` : ''}`
        })
        .join('\n')}`
    : ''

  const materialContext = materialRefs.length
    ? `【最近产物/素材】\n${materialRefs
        .slice(0, 12)
        .map((item) => {
          const meta = [
            item.sourceFolderName ? `项目: ${item.sourceFolderName}` : '',
            item.sourceFileName ? `文件: ${item.sourceFileName}` : '',
            item.path ? `路径: ${item.path}` : item.cachedUrl ? `缓存: ${item.cachedUrl}` : '',
            item.summary ? `说明: ${item.summary}` : ''
          ].filter(Boolean)
          return `- ${item.name} (${formatMaterialKind(item)}${meta.length ? `；${meta.join('；')}` : ''})`
        })
        .join('\n')}`
    : ''
  const indexContext = workspaceIndex.length
    ? `【工作目录索引】\n${workspaceIndex
        .slice(0, 20)
        .map((item) => `- ${item.isDirectory ? '目录' : '文件'}: ${item.path}${item.size ? ` (${formatFileSize(item.size)})` : ''}`)
        .join('\n')}`
    : ''
  const operationReplayItems = pendingOperations.filter((item) => item.status && item.status !== 'pending')
  const operationContext = operationReplayItems.length
    ? `【最近操作回放】\n${operationReplayItems
        .slice(0, 6)
        .map((item) => {
          const target = item.targetPath || item.command || item.sourcePath || item.cwd || '无目标'
          const result = item.result || { success: item.status === 'approved', error: item.status === 'rejected' ? '用户拒绝执行' : undefined }
          return `- ${formatOperationStatus(item.status)} / ${formatOperationName(item.operation)}: ${target}\n  ${formatOperationResultDetail(item, result)
            .split('\n')
            .slice(0, 5)
            .join('\n  ')}`
        })
        .join('\n')}`
    : ''
  const connectedConnectors = readWorkspaceConnectors().filter((item) => item.status === 'connected')
  const connectorContext = connectedConnectors.length
    ? `【已启用连接器】\n${connectedConnectors
        .map((item) => `- ${item.name} (${item.category}；${item.scopes.join('、')})`)
        .join('\n')}`
    : ''

  return [
    '【工作台策略】',
    workspaceSystemPrompt,
    browserContext,
    materialContext,
    indexContext,
    operationContext,
    connectorContext,
    planMode ? '计划模式已开启：先给出步骤、依赖、风险和可执行清单，再执行或建议下一步。' : '',
    goalMode ? '追求目标已开启：持续围绕用户目标推进，主动拆分任务并回收结果。' : '',
    project?.id ? `【当前工作台文件】${project.name || '未命名工作台文件'} (${project.id})` : '',
    project?.productionSkillPrompt
      ? `【当前话题内置 Skill】\n${project.productionSkillPrompt}`
      : '',
    project?.cacheRoot ? `【项目目录】${project.cacheRoot}` : '',
    project?.accessMode === 'global'
      ? '【电脑访问】已开启全局电脑访问：可在用户任务范围内读写本机路径并执行命令。'
      : `【电脑访问】授权目录模式：${getWorkspaceAccessRoots(project).join('；') || '暂未授权目录'}`,
    `【审批模式】${formatApprovalModeLabel(normalizeWorkspaceApprovalMode(project?.approvalMode, approvalMode))}`,
    attachments.length ? `【附件/本机路径】\n${attachmentLines.join('\n')}` : '',
    '【用户请求】',
    text || '请读取并分析这些附件/目录，给出下一步协同处理方案。'
  ]
    .filter(Boolean)
    .join('\n\n')
}

function getWorkspaceAccessRoots(file?: WorkspaceFile | null) {
  return Array.from(new Set([file?.cacheRoot, ...(file?.allowedRoots || [])].filter(Boolean) as string[]))
}

function getAllWorkspacePermissions(value: boolean) {
  return {
    read: value,
    write: value,
    delete: value,
    command: value,
    network: value,
    upload: value,
    clipboard: value,
    browser: value
  }
}

function getWorkspacePermissions(file?: WorkspaceFile | null) {
  return {
    ...getAllWorkspacePermissions(false),
    read: true,
    write: true,
    ...(file?.accessPermissions || {})
  }
}

function getWorkspaceFolderDefaults(
  folder?: WorkspaceFolder | null,
  fallbackApprovalMode: 'request' | 'risky' | 'auto' = 'request'
): Pick<WorkspaceFile, 'accessMode' | 'approvalMode' | 'allowedRoots' | 'accessPermissions'> {
  const roots = Array.from(
    new Set([folder?.localPath, ...(folder?.allowedRoots || [])].filter(Boolean) as string[])
  )
  const accessMode = folder?.accessMode === 'global' ? 'global' : 'scoped'
  return {
    accessMode,
    approvalMode: normalizeWorkspaceApprovalMode(folder?.approvalMode, fallbackApprovalMode),
    allowedRoots: roots,
    accessPermissions:
      folder?.accessPermissions ||
      (accessMode === 'global' ? getAllWorkspacePermissions(true) : getWorkspacePermissions(null))
  }
}

function isReadableTextAttachment(type = '', ext = '') {
  const normalizedExt = ext.replace(/^\./, '').toLowerCase()
  return (
    type.startsWith('text/') ||
    ['application/json', 'application/xml', 'application/x-yaml'].includes(type) ||
    [
      'txt',
      'md',
      'markdown',
      'js',
      'jsx',
      'ts',
      'tsx',
      'py',
      'html',
      'css',
      'json',
      'jsonl',
      'csv',
      'xml',
      'yaml',
      'yml',
      'srt',
      'vtt',
      'log',
      'ini',
      'conf',
      'sh',
      'bash',
      'ps1'
    ].includes(normalizedExt)
  )
}

function createTextAttachmentExcerpt(content = '', maxLength = 180) {
  const compact = content.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim()
  if (!compact) return ''
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact
}

function createTextAttachmentContext(content = '', maxLength = TEXT_ATTACHMENT_CONTEXT_LIMIT) {
  const normalized = content.replace(/\u0000/g, '').replace(/\r\n/g, '\n').trim()
  if (!normalized) return ''
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}\n...` : normalized
}

function arrayBufferToDataUrl(arrayBuffer: ArrayBuffer, mimeType: string) {
  const bytes = new Uint8Array(arrayBuffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return `data:${mimeType};base64,${btoa(binary)}`
}

function formatFileSize(size?: number) {
  if (!size || size <= 0) return ''
  if (size < 1024) return `${size}B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)}KB`
  return `${(size / 1024 / 1024).toFixed(1)}MB`
}

function getWorkspaceVisibleFileKind(file: WorkspaceIndexItem): WorkspaceVisibleFile['kind'] {
  if (file.isDirectory) return 'folder'
  const ext = (file.ext || '').toLowerCase()
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'].includes(ext)) return 'image'
  if (['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'].includes(ext)) return 'video'
  if (['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg'].includes(ext)) return 'audio'
  if (
    [
      '.txt',
      '.md',
      '.json',
      '.csv',
      '.srt',
      '.ass',
      '.xml',
      '.yaml',
      '.yml',
      '.ini',
      '.js',
      '.ts',
      '.tsx',
      '.jsx',
      '.html',
      '.css',
      '.py'
    ].includes(ext)
  ) {
    return 'text'
  }
  return 'other'
}

function getPathName(pathValue: string) {
  return pathValue.split(/[\\/]/).filter(Boolean).pop() || pathValue
}

function joinWorkspacePath(dir: string, name: string) {
  const separator = dir.includes('\\') ? '\\' : '/'
  return `${dir.replace(/[\\/]+$/, '')}${separator}${name}`
}

function mergeWorkspaceRecords<T extends { id?: string }>(current: T[], incoming: T[]) {
  const map = new Map<string, T>()
  current.forEach((item, index) => map.set(item.id || `current-${index}`, item))
  incoming.forEach((item, index) => map.set(item.id || `incoming-${Date.now()}-${index}`, item))
  return Array.from(map.values())
}

function buildConversationProjectName(prompt: string) {
  const compact = prompt.replace(/\s+/g, ' ').trim()
  if (!compact) return '未命名工作台文件'
  return compact.length > 18 ? `${compact.slice(0, 18)}…` : compact
}

function getPanelTitle(
  panel: 'overview' | 'plugins' | 'automation' | 'feishu',
  activeThread: string
) {
  if (panel === 'plugins') return '插件'
  if (panel === 'automation') return '自动化'
  if (panel === 'feishu') return '飞书直连'
  return activeThread
}
