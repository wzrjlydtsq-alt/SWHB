import { useState, useMemo, useCallback } from 'react'
import { Play, Trash2, Copy, ChevronDown, ChevronRight } from '../../utils/icons.tsx'
import { useAppStore } from '../../store/useAppStore.ts'
import {
  list_skills,
  get_skill,
  delete_skill,
  execute_skill,
  export_skill,
  list_presets,
  delete_preset,
  list_pipelines,
  delete_pipeline,
  list_timer_tasks,
  cancel_timer_task,
  create_timer_task
} from '../../utils/canvasTools.ts'

import { FloatingPanel } from './FloatingPanel.tsx'

const DEFAULT_IMAGE_NODE_SIZE = { width: 460, height: 300 }
const DEFAULT_VIDEO_NODE_SIZE = { width: 500, height: 380 }
const IMAGE_NODE_GAP_X = 500
const VIDEO_NODE_GAP_X = 540
const NODE_GAP_Y = 360

function emitWorkspaceAutomationEvent(detail) {
  window.dispatchEvent(new CustomEvent('workspace:automation-event', { detail }))
}

const BUG_SELF_REPAIR_PROMPT = [
  '启动 Bug 自修复流程。',
  '',
  '请先收集当前工作台上下文、授权范围、最近任务/审查记录、可用日志和 git 摘要，然后判断问题属于哪一类：',
  '1. 用户工程内 bug：定位根因，做最小修复，展示影响范围，并运行必要验证。',
  '2. 软件本体 bug：不要直接改安装包；生成诊断报告、复现步骤、日志摘要和补丁建议。若当前处于开发者模式且源码仓库已授权，再创建最小补丁并验证。',
  '',
  '执行约束：修改前说明要动哪些文件；涉及删除、覆盖、移动或命令执行时遵守工作台审批；修复后输出结果、验证命令和剩余风险。'
].join('\n')

export function SkillPanel() {
  const skillPanelOpen = useAppStore((s) => s.skillPanelOpen)
  const setSkillPanelOpen = useAppStore((s) => s.setSkillPanelOpen)
  const [activeTab, setActiveTab] = useState<
    'skills' | 'presets' | 'pipelines' | 'timers'
  >('skills')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  const tabs = [
    { id: 'skills', label: '技能', color: 'text-violet-400' },
    { id: 'presets', label: '预设', color: 'text-blue-400' },
    { id: 'pipelines', label: '流水线', color: 'text-amber-400' },
    { id: 'timers', label: '定时', color: 'text-emerald-400' }
  ] as const

  return (
    <FloatingPanel
      open={skillPanelOpen}
      onClose={() => setSkillPanelOpen(false)}
      title="自动化"
      icon="*"
      defaultX={80}
      defaultY={80}
      width={320}
      maxHeight="60vh"
    >
      {/* Tab 閺?*/}
      <div className="flex border-b border-[var(--border-color)] overflow-x-auto shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            data-onboarding={`tab-${tab.id === 'skills' ? 'skill' : tab.id === 'presets' ? 'preset' : tab.id === 'pipelines' ? 'pipeline' : 'timer'}`}
            className={`flex-1 min-w-0 px-1.5 py-1.5 text-[10px] font-medium transition-all ${
              activeTab === tab.id
                ? `${tab.color} border-b-2 border-current bg-white/5`
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 閸愬懎顔愰崠?*/}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
        {activeTab === 'skills' && (
          <SkillsTab
            expandedId={expandedId}
            setExpandedId={setExpandedId}
            onRefresh={refresh}
            refreshKey={refreshKey}
          />
        )}
        {activeTab === 'presets' && <PresetsTab onRefresh={refresh} refreshKey={refreshKey} />}
        {activeTab === 'pipelines' && <PipelinesTab onRefresh={refresh} refreshKey={refreshKey} />}
        {activeTab === 'timers' && <TimersTab onRefresh={refresh} refreshKey={refreshKey} />}
      </div>
    </FloatingPanel>
  )
}

// Skills Tab
function SkillsTab({ expandedId, setExpandedId, onRefresh, refreshKey }) {
  const data = useMemo(() => list_skills(), [refreshKey])
  const [runningId, setRunningId] = useState<string | null>(null)
  const setSkillPanelOpen = useAppStore((s) => s.setSkillPanelOpen)

  // Built-in Skill definitions
  const builtinSkills = [
    {
      id: 'builtin-director',
      icon: 'AI',
      label: '智能导演',
      desc: '从一个想法生成剧本、镜头和视频',
      color: 'amber',
      action: () => {
        const store = useAppStore.getState()
        const newNode = {
          id: `node-${Date.now()}`,
          type: 'director-node',
          x: 300,
          y: 200,
          position: { x: 300, y: 200 },
          width: 580,
          height: 520,
          content: null,
          settings: {}
        }
        store.setNodes((prev) => [...prev, newNode as any])
        if (window.dbAPI?.nodes?.save) {
          window.dbAPI.nodes
            .save(newNode as any, store.currentProject?.id)
            .catch((e) => console.error('娣囨繂鐡?director 閼哄倻鍋ｆ径杈Е', e))
        }
        store.setSkillPanelOpen(false)
      }
    },
    {
      id: 'builtin-director-stage',
      icon: '3D',
      label: '3D 导演台',
      desc: '打开 3D 走位与镜头工作台',
      color: 'blue',
      action: () => {
        const store = useAppStore.getState()
        store.setDirectorStageOpen(true)
        store.setSkillPanelOpen(false)
      }
    },
    {
      id: 'builtin-script',
      icon: 'TXT',
      label: '剧本导入',
      desc: '导入文本剧本并创建节点',
      color: 'violet',
      action: () => {
        useAppStore.getState().setScriptImportOpen(true)
        useAppStore.getState().setSkillPanelOpen(false)
      }
    },
    {
      id: 'builtin-character',
      icon: 'CHR',
      label: '角色导入',
      desc: '导入或粘贴角色文本到资料库',
      color: 'emerald',
      action: () => {
        useAppStore.getState().setCharacterImportOpen(true)
        useAppStore.getState().setSkillPanelOpen(false)
      }
    },
    {
      id: 'builtin-scene',
      icon: 'SCN',
      label: '场景导入',
      desc: '导入或粘贴场景文本到资料库',
      color: 'sky',
      action: () => {
        useAppStore.getState().setSceneImportOpen(true)
        useAppStore.getState().setSkillPanelOpen(false)
      }
    },
    {
      id: 'builtin-batch-img',
      icon: 'IMG',
      label: '批量图片',
      desc: '快速创建多个图片节点',
      color: 'pink',
      action: () => {
        const store = useAppStore.getState()
        const ts = Date.now()
        const nodes = Array.from({ length: 4 }, (_, i) => ({
          id: `node-${ts}-${i}`,
          type: 'gen-image',
          x: 200 + (i % 2) * IMAGE_NODE_GAP_X,
          y: 200 + Math.floor(i / 2) * NODE_GAP_Y,
          position: {
            x: 200 + (i % 2) * IMAGE_NODE_GAP_X,
            y: 200 + Math.floor(i / 2) * NODE_GAP_Y
          },
          width: DEFAULT_IMAGE_NODE_SIZE.width,
          height: DEFAULT_IMAGE_NODE_SIZE.height,
          content: null,
          settings: { model: 'nano-banana', ratio: '16:9', resolution: 'Auto' }
        }))
        store.setNodes((prev) => [...prev, ...(nodes as any[])])
        store.setSkillPanelOpen(false)
      }
    },
    {
      id: 'builtin-batch-video',
      icon: 'VID',
      label: '批量视频',
      desc: '快速创建多个视频节点',
      color: 'rose',
      action: () => {
        const store = useAppStore.getState()
        const ts = Date.now()
        const nodes = Array.from({ length: 4 }, (_, i) => ({
          id: `node-${ts}-${i}`,
          type: 'gen-video',
          x: 200 + (i % 2) * VIDEO_NODE_GAP_X,
          y: 200 + Math.floor(i / 2) * NODE_GAP_Y,
          position: {
            x: 200 + (i % 2) * VIDEO_NODE_GAP_X,
            y: 200 + Math.floor(i / 2) * NODE_GAP_Y
          },
          width: DEFAULT_VIDEO_NODE_SIZE.width,
          height: DEFAULT_VIDEO_NODE_SIZE.height,
          content: null,
          settings: { model: 'sora-2', ratio: '16:9', duration: '5s' }
        }))
        store.setNodes((prev) => [...prev, ...(nodes as any[])])
        store.setSkillPanelOpen(false)
      }
    },
    {
      id: 'builtin-retry-fail',
      icon: 'R',
      label: '失败诊断',
      desc: '查看失败任务，手动决定是否重新提交',
      color: 'red',
      action: () => {
        useAppStore.getState().setHistoryOpen(true)
        useAppStore.getState().setSkillPanelOpen(false)
      }
    },
    {
      id: 'builtin-bug-self-repair',
      icon: 'FIX',
      label: 'Bug 自修复',
      desc: '诊断问题并按边界修复',
      color: 'cyan',
      action: () => {
        window.dispatchEvent(
          new CustomEvent('workspace:fill-draft', {
            detail: { text: BUG_SELF_REPAIR_PROMPT }
          })
        )
        useAppStore.getState().setSkillPanelOpen(false)
      }
    },
    {
      id: 'builtin-canvas-tidy',
      icon: 'GRID',
      label: '整理画布',
      desc: '把所有节点按网格排布',
      color: 'teal',
      action: () => {
        import('../../utils/canvasTools.ts').then((m) => (m as any).arrange_nodes?.({ layout: 'grid' }))
        useAppStore.getState().setSkillPanelOpen(false)
      }
    },
    {
      id: 'builtin-export-all',
      icon: 'EXP',
      label: '全部导出',
      desc: '导出项目节点和素材',
      color: 'indigo',
      action: () => {
        import('../../utils/canvasTools.ts').then((m) => (m as any).export_project?.())
        useAppStore.getState().setSkillPanelOpen(false)
      }
    },
    {
      id: 'builtin-storyboard',
      icon: 'SHOT',
      label: '分镜节点',
      desc: '创建分镜图片节点布局',
      color: 'orange',
      action: () => {
        const store = useAppStore.getState()
        const ts = Date.now()
        const nodes = Array.from({ length: 6 }, (_, i) => ({
          id: `node-${ts}-sb-${i}`,
          type: 'gen-image',
          x: 200 + (i % 3) * IMAGE_NODE_GAP_X,
          y: 200 + Math.floor(i / 3) * NODE_GAP_Y,
          position: {
            x: 200 + (i % 3) * IMAGE_NODE_GAP_X,
            y: 200 + Math.floor(i / 3) * NODE_GAP_Y
          },
          width: DEFAULT_IMAGE_NODE_SIZE.width,
          height: DEFAULT_IMAGE_NODE_SIZE.height,
          content: null,
          settings: {
            model: 'nano-banana',
            ratio: '16:9',
            resolution: 'Auto',
            prompt: `Storyboard ${i + 1}`
          }
        }))
        store.setNodes((prev) => [...prev, ...(nodes as any[])])
        store.setSkillPanelOpen(false)
      }
    },
    {
      id: 'builtin-style-ref',
      icon: 'ART',
      label: '风格参考',
      desc: '创建风格参考和图片节点组合',
      color: 'fuchsia',
      action: () => {
        const store = useAppStore.getState()
        const ts = Date.now()
        const refNode = {
          id: `node-${ts}-ref`,
          type: 'sticky-note',
          x: 200,
          y: 200,
          position: { x: 200, y: 200 },
          width: 300,
          height: 200,
          content: 'Paste style references here\nDescribe the style you want...',
          settings: {}
        }
        const genNode = {
          id: `node-${ts}-gen`,
          type: 'gen-image',
          x: 560,
          y: 200,
          position: { x: 560, y: 200 },
          width: DEFAULT_IMAGE_NODE_SIZE.width,
          height: DEFAULT_IMAGE_NODE_SIZE.height,
          content: null,
          settings: { model: 'nano-banana', ratio: '16:9', resolution: 'HD' }
        }
        store.setNodes((prev) => [...prev, refNode as any, genNode as any])
        store.setSkillPanelOpen(false)
      }
    },
    {
      id: 'builtin-char-consistency',
      icon: 'CHAR',
      label: '角色一致性',
      desc: '创建多角度角色参考节点',
      color: 'lime',
      action: () => {
        const store = useAppStore.getState()
        const ts = Date.now()
        const angles = ['Front close-up', 'Side', 'Back', 'Full body']
        const nodes = angles.map((angle, i) => ({
          id: `node-${ts}-char-${i}`,
          type: 'gen-image',
          x: 200 + (i % 2) * IMAGE_NODE_GAP_X,
          y: 200 + Math.floor(i / 2) * NODE_GAP_Y,
          position: {
            x: 200 + (i % 2) * IMAGE_NODE_GAP_X,
            y: 200 + Math.floor(i / 2) * NODE_GAP_Y
          },
          width: DEFAULT_IMAGE_NODE_SIZE.width,
          height: DEFAULT_IMAGE_NODE_SIZE.height,
          content: null,
          settings: {
            model: 'nano-banana',
            ratio: '3:4',
            resolution: 'HD',
            prompt: `Character ${angle}`
          }
        }))
        store.setNodes((prev) => [...prev, ...(nodes as any[])])
        store.setSkillPanelOpen(false)
      }
    },
    {
      id: 'builtin-batch-prompt',
      icon: 'TXT',
      label: '批量提示词',
      desc: '创建统一撰写提示词的便签',
      color: 'yellow',
      action: () => {
        const store = useAppStore.getState()
        const ts = Date.now()
        const noteNode = {
          id: `node-${ts}-note`,
          type: 'sticky-note',
          x: 200,
          y: 200,
          position: { x: 200, y: 200 },
          width: 320,
          height: 400,
          content: 'Prompt draft\n\nShot 1: \nShot 2: \nShot 3: \nShot 4: ',
          settings: {}
        }
        store.setNodes((prev) => [...prev, noteNode as any])
        store.setSkillPanelOpen(false)
      }
    },
    {
      id: 'builtin-screenshot',
      icon: 'CAP',
      label: '画布截图',
      desc: '把当前画布保存为图片',
      color: 'slate',
      action: () => {
        import('../../utils/canvasTools.ts').then((m) => (m as any).screenshot_canvas?.())
        useAppStore.getState().setSkillPanelOpen(false)
      }
    },
    {
      id: 'builtin-ab-compare',
      icon: 'AB',
      label: 'A/B 对比',
      desc: '创建两组参数用于对比',
      color: 'purple',
      action: () => {
        const store = useAppStore.getState()
        const ts = Date.now()
        const nodeA = {
          id: `node-${ts}-a`,
          type: 'gen-image',
          x: 200,
          y: 200,
          position: { x: 200, y: 200 },
          width: DEFAULT_IMAGE_NODE_SIZE.width,
          height: DEFAULT_IMAGE_NODE_SIZE.height,
          content: null,
          settings: { model: 'nano-banana', ratio: '16:9', resolution: 'HD', prompt: 'A plan: ' }
        }
        const nodeB = {
          id: `node-${ts}-b`,
          type: 'gen-image',
          x: 720,
          y: 200,
          position: { x: 720, y: 200 },
          width: DEFAULT_IMAGE_NODE_SIZE.width,
          height: DEFAULT_IMAGE_NODE_SIZE.height,
          content: null,
          settings: { model: 'nano-banana', ratio: '16:9', resolution: 'HD', prompt: 'B plan: ' }
        }
        store.setNodes((prev) => [...prev, nodeA as any, nodeB as any])
        store.setSkillPanelOpen(false)
      }
    },
    {
      id: 'builtin-suggest',
      icon: 'TIP',
      label: '智能建议',
      desc: '分析画布并建议下一步',
      color: 'amber',
      action: () => {
        import('../../utils/canvasTools.ts').then((m) => {
          const result = (m as any).suggest_next_steps?.()
          if (result?.suggestions?.length) {
            alert('Suggestions:\n' + result.suggestions.join('\n'))
          } else {
            alert('Current project looks good. No pending items.')
          }
        })
      }
    },
    {
      id: 'builtin-img2video-pair',
      icon: 'I2V',
      label: '图生视频组合',
      desc: '创建配对的图片和视频节点',
      color: 'sky',
      action: () => {
        const store = useAppStore.getState()
        const ts = Date.now()
        const imgNode = {
          id: `node-${ts}-img`,
          type: 'gen-image',
          x: 200,
          y: 200,
          position: { x: 200, y: 200 },
          width: DEFAULT_IMAGE_NODE_SIZE.width,
          height: DEFAULT_IMAGE_NODE_SIZE.height,
          content: null,
          settings: { model: 'nano-banana', ratio: '16:9', resolution: 'HD' }
        }
        const vidNode = {
          id: `node-${ts}-vid`,
          type: 'gen-video',
          x: 740,
          y: 200,
          position: { x: 740, y: 200 },
          width: DEFAULT_VIDEO_NODE_SIZE.width,
          height: DEFAULT_VIDEO_NODE_SIZE.height,
          content: null,
          settings: { model: 'sora-2', ratio: '16:9', duration: '5s' }
        }
        store.setNodes((prev) => [...prev, imgNode as any, vidNode as any])
        store.setSkillPanelOpen(false)
      }
    },
    {
      id: 'builtin-asset-import',
      icon: 'LIB',
      label: '快速入库',
      desc: '把已完成的画布结果加入资料库',
      color: 'teal',
      action: () => {
        import('../../utils/canvasTools.ts').then((m) => (m as any).batch_add_to_asset_library?.())
        useAppStore.getState().setSkillPanelOpen(false)
      }
    }
  ]

  const colorMap = {
    amber: 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25',
    violet: 'bg-violet-500/15 text-violet-400 hover:bg-violet-500/25',
    emerald: 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25',
    sky: 'bg-sky-500/15 text-sky-400 hover:bg-sky-500/25',
    pink: 'bg-pink-500/15 text-pink-400 hover:bg-pink-500/25',
    rose: 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25',
    cyan: 'bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25',
    red: 'bg-red-500/15 text-red-400 hover:bg-red-500/25',
    teal: 'bg-teal-500/15 text-teal-400 hover:bg-teal-500/25',
    indigo: 'bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25',
    blue: 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25',
    orange: 'bg-orange-500/15 text-orange-400 hover:bg-orange-500/25',
    fuchsia: 'bg-fuchsia-500/15 text-fuchsia-400 hover:bg-fuchsia-500/25',
    lime: 'bg-lime-500/15 text-lime-400 hover:bg-lime-500/25',
    yellow: 'bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25',
    slate: 'bg-slate-500/15 text-slate-400 hover:bg-slate-500/25',
    purple: 'bg-purple-500/15 text-purple-400 hover:bg-purple-500/25'
  }

  return (
    <div className="space-y-3">
      {/* Built-in Skills */}
      <div>
        <div className="text-[9px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1.5 px-1">
          内置
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {builtinSkills.map((s) => (
            <button
              key={s.id}
              onClick={s.action}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-lg transition-all ${colorMap[s.color]}`}
            >
              <span className="text-base">{s.icon}</span>
              <div className="text-left min-w-0">
                <div className="text-[10px] font-medium truncate">{s.label}</div>
                <div className="text-[8px] opacity-60 truncate">{s.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Skills */}
      {data.count > 0 && (
        <div>
          <div className="text-[9px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1.5 px-1">
            自定义
          </div>
          <div className="space-y-1.5">
            {data.skills.map((skill) => (
              <div
                key={skill.id}
                className="rounded-lg border border-[var(--border-color)] overflow-hidden bg-[var(--bg-base)]/50"
              >
                <div
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/5 transition-colors"
                  onClick={() => setExpandedId(expandedId === skill.id ? null : skill.id)}
                >
                  <span className="text-sm">{skill.icon || 'SK'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium text-[var(--text-primary)] truncate">
                      {skill.name}
                    </div>
                    <div className="text-[10px] text-[var(--text-secondary)]">
                      {skill.stepCount} 个步骤
                    </div>
                  </div>
                  {expandedId === skill.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </div>

                {expandedId === skill.id && (
                  <div className="px-3 pb-2.5 border-t border-[var(--border-color)] pt-2 space-y-2">
                    {skill.description && (
                      <p className="text-[10px] text-[var(--text-secondary)]">
                        {skill.description}
                      </p>
                    )}
                    {skill.variables?.length > 0 && (
                      <div className="text-[10px] text-[var(--text-secondary)]">
                        变量：{skill.variables.join(', ')}
                      </div>
                    )}
                    <div className="flex gap-1.5">
                      <button
                        onClick={async () => {
                          setRunningId(skill.id)
                          try {
                            const result = await execute_skill({ skillId: skill.id, variables: {} })
                            window.dispatchEvent(
                              new CustomEvent('workspace:skill-executed', {
                                detail: { skillId: skill.id, skillName: skill.name, result }
                              })
                            )
                          } catch (error) {
                            window.dispatchEvent(
                              new CustomEvent('workspace:skill-executed', {
                                detail: {
                                  skillId: skill.id,
                                  skillName: skill.name,
                                  result: {
                                    success: false,
                                    skillName: skill.name,
                                    error: error instanceof Error ? error.message : '技能执行失败'
                                  }
                                }
                              })
                            )
                          } finally {
                            setRunningId(null)
                          }
                        }}
                        disabled={runningId === skill.id}
                        className="flex-1 py-1.5 rounded-md text-[10px] font-medium bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                      >
                        <Play size={10} /> {runningId === skill.id ? '运行中...' : '运行'}
                      </button>
                      <button
                        onClick={() => {
                          const r = export_skill({ skillId: skill.id })
                          if (r.json) navigator.clipboard.writeText(r.json)
                        }}
                        className="p-1.5 rounded-md bg-white/5 hover:bg-white/10 text-[var(--text-secondary)] transition-colors"
                        title="复制 JSON"
                      >
                        <Copy size={10} />
                      </button>
                      <button
                        onClick={() => {
                          delete_skill({ skillId: skill.id })
                          onRefresh()
                        }}
                        className="p-1.5 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                        title="删除"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {data.count === 0 && (
        <div className="text-center py-4 text-[var(--text-secondary)] text-[10px]">
          <p className="opacity-60">让 AI 创建一个自定义技能。</p>
        </div>
      )}
    </div>
  )
}

// Presets Tab
function PresetsTab({ onRefresh, refreshKey }) {
  const data = useMemo(() => list_presets(), [refreshKey])

  const builtinPresets = [
    {
      id: 'bp-cinematic',
      icon: 'CIN',
      name: '电影写实',
      desc: 'MJ | 16:9 | 高清写实',
      color: 'amber',
      settings: { model: 'nano-banana', ratio: '16:9', resolution: 'HD', nodeType: 'gen-image' }
    },
    {
      id: 'bp-anime',
      icon: 'ANI',
      name: '动漫风格',
      desc: 'MJ | 3:4 | 动漫风',
      color: 'pink',
      settings: { model: 'nano-banana', ratio: '3:4', resolution: 'HD', nodeType: 'gen-image' }
    },
    {
      id: 'bp-cyber',
      icon: 'CYB',
      name: '赛博朋克',
      desc: 'MJ | 16:9 | 霓虹科幻',
      color: 'violet',
      settings: { model: 'nano-banana', ratio: '16:9', resolution: 'HD', nodeType: 'gen-image' }
    },
    {
      id: 'bp-oil',
      icon: 'OIL',
      name: '古典油画',
      desc: 'MJ | 4:3 | 文艺复兴风',
      color: 'orange',
      settings: { model: 'nano-banana', ratio: '4:3', resolution: 'HD', nodeType: 'gen-image' }
    },
    {
      id: 'bp-watercolor',
      icon: 'WAT',
      name: '水彩手绘',
      desc: 'MJ | 1:1 | 手绘水彩',
      color: 'sky',
      settings: { model: 'nano-banana', ratio: '1:1', resolution: 'HD', nodeType: 'gen-image' }
    },
    {
      id: 'bp-3d',
      icon: '3D',
      name: '3D 渲染',
      desc: 'MJ | 16:9 | 3D 写实',
      color: 'cyan',
      settings: { model: 'nano-banana', ratio: '16:9', resolution: 'HD', nodeType: 'gen-image' }
    },
    {
      id: 'bp-portrait',
      icon: 'POR',
      name: '棚拍肖像',
      desc: 'MJ | 3:4 | 影棚人像',
      color: 'rose',
      settings: { model: 'nano-banana', ratio: '3:4', resolution: 'HD', nodeType: 'gen-image' }
    },
    {
      id: 'bp-pixel',
      icon: 'PIX',
      name: '像素艺术',
      desc: 'MJ | 1:1 | 复古像素',
      color: 'emerald',
      settings: { model: 'nano-banana', ratio: '1:1', resolution: 'Auto', nodeType: 'gen-image' }
    },
    {
      id: 'bp-video-short',
      icon: 'V9',
      name: '竖屏短视频',
      desc: 'Sora | 9:16 | 5s',
      color: 'blue',
      settings: { model: 'sora-2', ratio: '9:16', duration: '5s', nodeType: 'gen-video' }
    },
    {
      id: 'bp-video-cinema',
      icon: 'V16',
      name: '电影横屏',
      desc: 'Sora | 16:9 | 10s',
      color: 'indigo',
      settings: { model: 'sora-2', ratio: '16:9', duration: '10s', nodeType: 'gen-video' }
    }
  ]

  const colorMap = {
    amber: 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25',
    pink: 'bg-pink-500/15 text-pink-400 hover:bg-pink-500/25',
    violet: 'bg-violet-500/15 text-violet-400 hover:bg-violet-500/25',
    orange: 'bg-orange-500/15 text-orange-400 hover:bg-orange-500/25',
    sky: 'bg-sky-500/15 text-sky-400 hover:bg-sky-500/25',
    cyan: 'bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25',
    rose: 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25',
    emerald: 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25',
    blue: 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25',
    indigo: 'bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25'
  }

  const handleInstallPreset = (bp) => {
    // Save the built-in preset to local storage.
    const existing = data.presets.find((p) => p.name === bp.name)
    if (existing) return
    try {
      const store = JSON.parse(localStorage.getItem('xinghe_presets') || '{}')
      const id = `preset-builtin-${bp.id}`
      store[id] = { id, name: bp.name, settings: bp.settings, builtIn: true, createdAt: Date.now() }
      localStorage.setItem('xinghe_presets', JSON.stringify(store))
      onRefresh()
      emitWorkspaceAutomationEvent({ action: '安装预设', name: bp.name, success: true })
    } catch (e) {
      console.error(e)
      emitWorkspaceAutomationEvent({
        action: '安装预设',
        name: bp.name,
        success: false,
        error: e instanceof Error ? e.message : '安装预设失败'
      })
    }
  }

  return (
    <div className="space-y-3">
      {/* 閸愬懐鐤嗘０鍕啎 */}
      <div>
        <div className="text-[9px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1.5 px-1">
          内置模板
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {builtinPresets.map((bp) => {
            const installed = data.presets.some((p) => p.name === bp.name)
            return (
              <button
                key={bp.id}
                onClick={() => handleInstallPreset(bp)}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg transition-all ${installed ? 'opacity-50 cursor-default' : ''} ${colorMap[bp.color]}`}
                disabled={installed}
              >
                <span className="text-base">{bp.icon}</span>
                <div className="text-left min-w-0">
                  <div className="text-[10px] font-medium truncate">
                    {bp.name} {installed ? '已安装' : ''}
                  </div>
                  <div className="text-[8px] opacity-60 truncate">{bp.desc}</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Custom Presets */}
      {data.count > 0 && (
        <div>
          <div className="text-[9px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1.5 px-1">
            已保存
          </div>
          <div className="space-y-1.5">
            {data.presets.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)]/50"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium text-[var(--text-primary)] truncate">
                    {p.name}
                  </div>
                  <div className="text-[10px] text-[var(--text-secondary)]">
                    {[p.model, p.ratio, p.nodeType].filter(Boolean).join(' | ') || '空预设'}
                  </div>
                </div>
                <button
                  onClick={() => {
                    delete_preset({ presetId: p.id })
                    onRefresh()
                    emitWorkspaceAutomationEvent({ action: '删除预设', name: p.name, success: true })
                  }}
                  className="p-1.5 rounded-md hover:bg-red-500/20 text-red-400/60 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.count === 0 && (
        <div className="text-center py-3 text-[var(--text-secondary)] text-[10px] opacity-60">
          Install a template above, or ask AI to save a preset.
        </div>
      )}
    </div>
  )
}

// Pipelines Tab
function PipelinesTab({ onRefresh, refreshKey }) {
  const data = useMemo(() => list_pipelines(), [refreshKey])

  const builtinPipelines = [
    {
      id: 'bp-img2video',
      icon: 'I2V',
      name: '图生视频链路',
      desc: '图片完成后创建视频',
      color: 'amber',
      config: {
        name: '图生视频链路',
        trigger: 'on_image_complete',
        steps: [{ tool: 'create_node', params: { type: 'gen-video' } }]
      }
    },
    {
      id: 'bp-auto-asset',
      icon: 'LIB',
      name: '素材入库链路',
      desc: '生成完成后加入素材库',
      color: 'emerald',
      config: {
        name: '素材入库链路',
        trigger: 'on_any_complete',
        steps: [{ tool: 'add_to_asset_library', params: {} }]
      }
    },
    {
      id: 'bp-batch-retry',
      icon: 'RETRY',
      name: '失败诊断链路',
      desc: '失败时列出候选，需手动确认后才重提',
      color: 'red',
      config: {
        name: '失败诊断链路',
        trigger: 'on_fail',
        steps: [{ tool: 'retry_failed_tasks', params: { confirm: false } }]
      }
    },
    {
      id: 'bp-auto-upscale',
      icon: '2X',
      name: '自动放大链路',
      desc: '图片完成后放大 2 倍',
      color: 'violet',
      config: {
        name: '自动放大链路',
        trigger: 'on_image_complete',
        steps: [{ tool: 'upscale_image', params: { scale: 2 } }]
      }
    },
    {
      id: 'bp-style-transfer',
      icon: 'STYLE',
      name: '风格迁移链路',
      desc: '新节点套用预设风格',
      color: 'pink',
      config: {
        name: '风格迁移链路',
        trigger: 'on_node_create',
        steps: [{ tool: 'apply_preset', params: { presetId: 'default' } }]
      }
    },
    {
      id: 'bp-video-merge',
      icon: 'MERGE',
      name: '视频合并链路',
      desc: '多个视频完成后合并导出',
      color: 'cyan',
      config: {
        name: '视频合并链路',
        trigger: 'on_video_complete',
        steps: [{ tool: 'merge_videos', params: {} }]
      }
    },
    {
      id: 'bp-prompt-auto',
      icon: 'PROMPT',
      name: '提示词优化链路',
      desc: '新节点自动优化提示词',
      color: 'sky',
      config: {
        name: '提示词优化链路',
        trigger: 'on_node_create',
        steps: [{ tool: 'optimize_prompt', params: {} }]
      }
    },
    {
      id: 'bp-notify',
      icon: 'NOTE',
      name: '完成通知链路',
      desc: '任务完成后发送系统通知',
      color: 'indigo',
      config: {
        name: '完成通知链路',
        trigger: 'on_any_complete',
        steps: [{ tool: 'send_notification', params: {} }]
      }
    }
  ]

  const colorMap = {
    amber: 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25',
    emerald: 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25',
    red: 'bg-red-500/15 text-red-400 hover:bg-red-500/25',
    violet: 'bg-violet-500/15 text-violet-400 hover:bg-violet-500/25',
    pink: 'bg-pink-500/15 text-pink-400 hover:bg-pink-500/25',
    cyan: 'bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25',
    sky: 'bg-sky-500/15 text-sky-400 hover:bg-sky-500/25',
    indigo: 'bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25'
  }

  const handleInstallPipeline = (bp) => {
    const existing = data.pipelines.find((p) => p.name === bp.config.name)
    if (existing) return
    try {
      const store = JSON.parse(localStorage.getItem('xinghe_pipelines') || '{}')
      const id = `pipeline-builtin-${bp.id}`
      store[id] = { id, ...bp.config, enabled: false, builtIn: true, createdAt: Date.now() }
      localStorage.setItem('xinghe_pipelines', JSON.stringify(store))
      onRefresh()
      emitWorkspaceAutomationEvent({ action: '安装流水线', name: bp.config.name, success: true })
    } catch (e) {
      console.error(e)
      emitWorkspaceAutomationEvent({
        action: '安装流水线',
        name: bp.config.name,
        success: false,
        error: e instanceof Error ? e.message : '安装流水线失败'
      })
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1.5 px-1 text-[9px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          内置模板
        </div>
        <div className="space-y-1.5">
          {builtinPipelines.map((bp) => {
            const installed = data.pipelines.some((p) => p.name === bp.config.name)
            return (
              <button
                key={bp.id}
                onClick={() => handleInstallPipeline(bp)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-left ${installed ? 'opacity-50 cursor-default' : ''} ${colorMap[bp.color]}`}
                disabled={installed}
              >
                <span className="text-sm font-mono shrink-0">{bp.icon}</span>
                <div className="min-w-0">
                  <div className="text-[10px] font-medium truncate">
                    {bp.name} {installed ? '已安装' : ''}
                  </div>
                  <div className="text-[8px] opacity-60">{bp.desc}</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {data.count > 0 && (
        <div>
          <div className="mb-1.5 px-1 text-[9px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            已创建
          </div>
          <div className="space-y-1.5">
            {data.pipelines.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)]/50"
              >
                <div
                  className={`w-2 h-2 rounded-full ${p.enabled ? 'bg-emerald-400' : 'bg-gray-500'}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium text-[var(--text-primary)] truncate">
                    {p.name}
                  </div>
                  <div className="text-[10px] text-[var(--text-secondary)]">
                    {p.stepCount} 个步骤 · {p.trigger}
                  </div>
                </div>
                <button
                  onClick={() => {
                    delete_pipeline({ pipelineId: p.id })
                    onRefresh()
                    emitWorkspaceAutomationEvent({ action: '删除流水线', name: p.name, success: true })
                  }}
                  className="p-1.5 rounded-md hover:bg-red-500/20 text-red-400/60 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.count === 0 && (
        <div className="text-center py-3 text-[var(--text-secondary)] text-[10px] opacity-60">
          安装上方模板，或让 AI 自动创建流水线。
        </div>
      )}
    </div>
  )
}

// Timers Tab
function TimersTab({ onRefresh, refreshKey }) {
  const data = useMemo(() => list_timer_tasks(), [refreshKey])

  const builtinTimers = [
    {
      id: 'bt-retry30',
      icon: 'R30',
      name: '失败重试（30 分）',
      desc: '每 30 分钟重试失败任务',
      color: 'amber',
      mins: 30
    },
    {
      id: 'bt-status10',
      icon: 'S10',
      name: '状态刷新（10 分）',
      desc: '每 10 分钟刷新生成状态',
      color: 'blue',
      mins: 10
    },
    {
      id: 'bt-autosave5',
      icon: 'S5',
      name: '自动保存（5 分）',
      desc: '每 5 分钟保存项目',
      color: 'emerald',
      mins: 5
    },
    {
      id: 'bt-cleanup60',
      icon: 'C60',
      name: '缓存清理（1 小时）',
      desc: '每小时清理无效缓存',
      color: 'teal',
      mins: 60
    },
    {
      id: 'bt-queue15',
      icon: 'Q15',
      name: '队列检查（15 分）',
      desc: '每 15 分钟检查生成队列',
      color: 'violet',
      mins: 15
    },
    {
      id: 'bt-report120',
      icon: 'RPT',
      name: '进度报告（2 小时）',
      desc: '每 2 小时生成进度摘要',
      color: 'pink',
      mins: 120
    },
    {
      id: 'bt-backup1440',
      icon: 'B24',
      name: '每日备份（24 小时）',
      desc: '每天备份项目数据',
      color: 'indigo',
      mins: 1440
    }
  ]

  const colorMap = {
    amber: 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25',
    blue: 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25',
    emerald: 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25',
    teal: 'bg-teal-500/15 text-teal-400 hover:bg-teal-500/25',
    violet: 'bg-violet-500/15 text-violet-400 hover:bg-violet-500/25',
    pink: 'bg-pink-500/15 text-pink-400 hover:bg-pink-500/25',
    indigo: 'bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25'
  }

  const handleInstallTimer = (bt) => {
    const existing = data.timers.find((t) => t.name === bt.name)
    if (existing) return
    create_timer_task({ name: bt.name, intervalMinutes: bt.mins, skillId: bt.skillId, variables: {} })
    onRefresh()
    emitWorkspaceAutomationEvent({ action: '创建定时任务', name: bt.name, success: true })
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="text-[9px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1.5 px-1">
          快速创建
        </div>
        <div className="space-y-1.5">
          {builtinTimers.map((bt) => {
            const installed = data.timers.some((t) => t.name === bt.name)
            return (
              <button
                key={bt.id}
                onClick={() => handleInstallTimer(bt)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-left ${installed ? 'opacity-50 cursor-default' : ''} ${colorMap[bt.color]}`}
                disabled={installed}
              >
                <span className="text-sm">{bt.icon}</span>
                <div className="min-w-0">
                  <div className="text-[10px] font-medium truncate">
                    {bt.name} {installed ? '已安装' : ''}
                  </div>
                  <div className="text-[8px] opacity-60">{bt.desc}</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {data.count > 0 && (
        <div>
          <div className="text-[9px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1.5 px-1">
            运行中
          </div>
          <div className="space-y-1.5">
            {data.timers.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)]/50"
              >
                <div
                  className={`w-2 h-2 rounded-full ${t.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium text-[var(--text-primary)] truncate">
                    {t.name}
                  </div>
                  <div className="text-[10px] text-[var(--text-secondary)]">
                    每 {t.intervalMinutes} 分钟 · 已运行 {t.runCount} 次 · {t.lastRun}
                  </div>
                </div>
                <button
                  onClick={() => {
                    cancel_timer_task({ timerId: t.id })
                    onRefresh()
                    emitWorkspaceAutomationEvent({ action: '取消定时任务', name: t.name, success: true })
                  }}
                  className="p-1.5 rounded-md hover:bg-red-500/20 text-red-400/60 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.count === 0 && (
        <div className="text-center py-3 text-[var(--text-secondary)] text-[10px] opacity-60">
          Use quick-create above, or ask AI to run something every 30 minutes.
        </div>
      )}
    </div>
  )
}
