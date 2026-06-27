import { memo, useMemo } from 'react'
import {
  Archive,
  Box,
  CheckCircle2,
  ClipboardCheck,
  Clapperboard,
  Clock3,
  FileText,
  Image,
  Layers3,
  Mic2,
  RefreshCcw,
  Search,
  Sparkles,
  UserRound,
  Video
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../../store/useAppStore'

const EMPTY_LIST: any[] = []

const topicItems = [
  { id: 'research', label: '资料写剧本', icon: Search, hint: '资料、世界观、分集梗概、剧本文档' },
  { id: 'image', label: '生图', icon: Image, hint: '角色、场景、道具、参考图候选' },
  { id: 'storyboard', label: '改镜头本', icon: Clapperboard, hint: '镜号、景别、运动、提示词草案' },
  { id: 'character', label: '改角色卡', icon: UserRound, hint: '角色设定、服装、脸部参考' },
  { id: 'review', label: '审核本子', icon: ClipboardCheck, hint: '剧本、镜头本、返工意见' },
  { id: 'video', label: '等待生视频', icon: Video, hint: '排队、重试、验收、回流' }
]

const assetSections = [
  { id: 'script', label: '剧本', icon: FileText, hint: '按集管理文本和缩略图', topicId: 'research' },
  { id: 'storyboard', label: '镜头本', icon: Clapperboard, hint: '每集对应镜头表', topicId: 'storyboard' },
  { id: 'character', label: '角色', icon: UserRound, hint: '角色卡与参考图', topicId: 'character' },
  { id: 'scene', label: '场景', icon: Layers3, hint: '场景图和环境说明', topicId: 'image' },
  { id: 'prop', label: '道具', icon: Box, hint: '关键道具参考', topicId: 'image' },
  { id: 'audio', label: '音频', icon: Mic2, hint: '对白、配乐、音效', topicId: 'review' },
  { id: 'referenceVideo', label: '参考视频', icon: Archive, hint: '运镜和风格参考', topicId: 'video' },
  { id: 'videoAsset', label: '视频', icon: Video, hint: '生成结果和终版', topicId: 'video' }
]

type ProductionDeskProps = {
  activeTopicId?: string
  onOpenTopic?: (topicId: string) => void
}

export const ProductionDesk = memo(function ProductionDesk({
  activeTopicId,
  onOpenTopic
}: ProductionDeskProps) {
  const { nodes, history, productionBoardVideoRows, productionBoardImageRows } = useAppStore(
    useShallow((state) => ({
      nodes: state.nodes,
      history: state.history,
      productionBoardVideoRows: state.productionBoardVideoRows,
      productionBoardImageRows: state.productionBoardImageRows
    }))
  )

  const safeNodes = nodes || EMPTY_LIST
  const safeHistory = history || EMPTY_LIST
  const safeVideoRows = productionBoardVideoRows || EMPTY_LIST
  const safeImageRows = productionBoardImageRows || EMPTY_LIST

  const stats = useMemo(() => {
    const completed = safeHistory.filter((item: any) =>
      ['completed', 'done', 'success'].includes(item.status || item.state)
    ).length
    return {
      imageNodes: safeNodes.filter((node: any) => node.type === 'gen-image').length,
      videoNodes: safeNodes.filter((node: any) => node.type === 'gen-video').length,
      completed,
      pending: safeVideoRows.length + safeImageRows.length
    }
  }, [safeHistory, safeImageRows.length, safeNodes, safeVideoRows.length])

  return (
    <div className="space-y-4">
      <section>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-white/64">
          <Sparkles size={13} />
          默认话题
        </div>
        <div className="space-y-2">
          {topicItems.map((item) => {
            const Icon = item.icon
            const active = activeTopicId === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpenTopic?.(item.id)}
                className={`flex w-full items-center gap-2 rounded-lg border p-2 text-left transition ${
                  active
                    ? 'border-cyan-300/24 bg-cyan-300/[0.08]'
                    : 'border-white/8 bg-white/[0.035] hover:bg-white/[0.06]'
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-white/62">
                  <Icon size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white/78">{item.label}</span>
                  <span className="block truncate text-[11px] text-white/36">{item.hint}</span>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-white/64">
          <Archive size={13} />
          项目分类
        </div>
        <div className="space-y-2">
          {assetSections.map((section) => {
            const Icon = section.icon
            return (
              <button
                type="button"
                key={section.id}
                onClick={() => onOpenTopic?.(section.topicId)}
                className="flex w-full items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] p-2 text-left transition hover:bg-white/[0.055]"
              >
                <Icon size={15} className="shrink-0 text-white/44" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-white/72">{section.label}</span>
                  <span className="block truncate text-[11px] text-white/32">{section.hint}</span>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="rounded-lg border border-white/8 bg-white/[0.025] p-3">
        <div className="mb-2 text-xs font-semibold text-white/56">任务状态</div>
        <div className="grid grid-cols-2 gap-2">
          <Stat icon={Clock3} label="待提交" value={String(stats.pending)} />
          <Stat icon={RefreshCcw} label="生成中" value="0" />
          <Stat icon={ClipboardCheck} label="待审核" value="0" />
          <Stat icon={CheckCircle2} label="已完成" value={String(stats.completed)} />
        </div>
      </section>
    </div>
  )
})

function Stat({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/8 bg-black/12 p-2">
      <div className="flex items-center gap-1.5 text-[10px] text-white/38">
        <Icon size={11} />
        {label}
      </div>
      <div className="mt-1 text-base font-semibold text-white/82">{value}</div>
    </div>
  )
}
