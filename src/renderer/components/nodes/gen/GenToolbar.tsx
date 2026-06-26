import React, { memo, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, Loader2, Play, Sparkles } from '../../../utils/icons.tsx'
import {
  getRatiosForModel,
  LINGJING_XINGHE_TOP_GATEWAY_URL,
  OPENAI_COMPATIBLE_GATEWAY_URL,
  SEEDANCE_VIDEO_RATIOS,
  SEEDANCE_VIDEO_RES_OPTIONS,
  T8STAR_IMAGE_GATEWAY_URL,
  VIDEO_RES_OPTIONS,
  getResolutionsForModel
} from '../../../utils/constants.ts'
import { useViewport } from '@xyflow/react'

const normalizeUrl = (value: any) => String(value || '').trim().replace(/\/+$/, '')

const getCleanSourceLabel = (model: any) => {
  const url = normalizeUrl(model?.url)
  if (url === normalizeUrl(OPENAI_COMPATIBLE_GATEWAY_URL)) return 'Sub2API'
  if (url === normalizeUrl(T8STAR_IMAGE_GATEWAY_URL)) return 'T8Star'
  if (url === 'https://dashscope.aliyuncs.com') return 'DashScope'
  if (url === LINGJING_XINGHE_TOP_GATEWAY_URL) return 'Lingjing'
  return ''
}

const humanizeCleanModelName = (value: any) => {
  const raw = String(value || '').trim()
  const key = raw.toLowerCase()
  if (key === 'gpt-image-2') return 'GPT Image 2'
  if (key === 'gpt-4o-mini') return 'GPT-4o Mini'
  return raw
}

const formatModelDisplay = (model: any) => {
  const modelName = humanizeCleanModelName(model?.modelName || model?.id)
  const modelKey = String(model?.modelName || model?.id || '').trim().toLowerCase()
  if (!modelKey.includes('gpt')) return modelName || 'Select model'

  const source = getCleanSourceLabel(model)
  return source ? `${source}\u00b7 ${modelName}` : modelName
}

const getModelSourceLabel = (model: any) => {
  const url = normalizeUrl(model?.url)
  if (url === normalizeUrl(OPENAI_COMPATIBLE_GATEWAY_URL)) return 'Sub2API'
  if (url === normalizeUrl(T8STAR_IMAGE_GATEWAY_URL)) return 'T8Star 图片'
  return ''
}

const formatModelLabel = (model: any) => {
  const url = normalizeUrl(model?.url)
  const modelKey = String(model?.modelName || model?.id || '').trim().toLowerCase()
  if (url === normalizeUrl(OPENAI_COMPATIBLE_GATEWAY_URL) && modelKey === 'gpt-image-2') {
    return 'Sub2API· GPT Image 2'
  }

  const provider = String(model?.provider || '').trim()
  const modelName = String(model?.modelName || model?.id || '').trim()
  const base =
    provider && modelName && provider !== modelName
      ? `${provider} · ${modelName}`
      : provider || modelName || '选择模型'
  const source = getModelSourceLabel(model)
  return source && !base.toLowerCase().includes(source.toLowerCase()) ? `${base} · ${source}` : base
}

/**
 * GenToolbar - 底部工具栏：模型 / 比例 / 时长 / 分辨率 / 批量 / 生成按钮
 * gen-video 和 gen-image 共用
 */
export const GenToolbar = memo(function GenToolbar({
  nodeId,
  nodeType,
  settings,
  apiConfigs,
  apiConfigsMap,
  activeDropdown,
  setActiveDropdown,
  updateNodeSettings,
  getStatusColor,
  handleGenerate,
  isGenerating,
  onActivatePanorama
}: any) {
  const model = apiConfigsMap.get(settings?.model)
  const modelId = model?.id || model?.modelName || settings?.model || ''
  const isVeo31 = modelId.includes('veo3.1')
  const isSeedance =
    modelId.toLowerCase().includes('seedance') ||
    modelId.toLowerCase().includes('doubao') ||
    (model?.modelName &&
      (model.modelName.toLowerCase().includes('seedance') ||
        model.modelName.toLowerCase().includes('doubao'))) ||
    (model?.provider &&
      (model.provider.toLowerCase().includes('seedance') ||
        model.provider.toLowerCase().includes('doubao')))
  const isGrok = modelId.includes('grok')
  const isHappyHorse =
    modelId.toLowerCase().includes('happyhorse') ||
    (model?.modelName && model.modelName.toLowerCase().includes('happyhorse')) ||
    (model?.provider && model.provider.toLowerCase().includes('happyhorse'))
  const isMidjourney =
    model && (model.id.includes('mj') || model.provider?.toLowerCase().includes('midjourney'))

  const filterType = nodeType === 'gen-image' ? 'Image' : 'Video'
  const visibleModelConfigs = dedupeModelConfigs(apiConfigs, filterType)
  if (nodeType === 'gen-video') {
    return (
      <div
        className="node-footer-controls flex items-center gap-1.5 flex-wrap shrink-0 px-3 py-2"
        data-onboarding="node-settings"
      >
        {(isVeo31 || isSeedance) && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              updateNodeSettings(nodeId, { veoFramesMode: !settings?.veoFramesMode })
            }}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all active:scale-95 ${
              settings?.veoFramesMode
                ? 'bg-[var(--primary-color)]/15 border-[var(--primary-color)]/50 text-[var(--primary-color)]'
                : 'bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            onMouseDown={(e) => e.stopPropagation()}
          >
            首尾帧
          </button>
        )}

        <DropdownButton
          nodeId={nodeId}
          type="model"
          activeDropdown={activeDropdown}
          setActiveDropdown={setActiveDropdown}
          wrapperClassName="w-[190px] shrink-0"
          buttonClassName="flex h-8 w-full items-center justify-between gap-1.5 rounded-xl bg-[var(--bg-secondary)] px-2.5 text-[11px] font-medium text-[var(--text-primary)] shadow-sm transition-colors hover:bg-[var(--bg-hover)]"
          panelClassName="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-1.5 shadow-2xl"
          usePortal
          menuWidth={208}
          label={
            <>
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(settings?.model)}`}
              />
              <span className="truncate">{formatModelDisplay(model)}</span>
            </>
          }
        >
          {visibleModelConfigs.map((m, index) => (
            <button
              key={`${m.id || m.modelName || 'model'}-${index}`}
              onClick={() => {
                const next: any = { model: m.id }
                if (m.id === 'grok-video-3') {
                  next.ratio = '16:9'
                  next.duration = '6s'
                  next.resolution = '720P'
                }
                // 切换到 Seedance/Doubao 时，若当前分辨率不在合法选项内则重置
                const isSeedanceModel =
                  m.id.toLowerCase().includes('seedance') ||
                  m.id.toLowerCase().includes('doubao') ||
                  (m.modelName || '').toLowerCase().includes('seedance') ||
                  (m.provider || '').toLowerCase().includes('seedance') ||
                  (m.provider || '').toLowerCase().includes('doubao')
                if (isSeedanceModel) {
                  const curRes = settings?.resolution || ''
                  if (
                    !SEEDANCE_VIDEO_RES_OPTIONS.some(
                      (option) => option.toLowerCase() === String(curRes).toLowerCase()
                    )
                  ) {
                    next.resolution = '720p'
                  }
                }
                updateNodeSettings(nodeId, next)
                setActiveDropdown(null)
              }}
              className="w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
            >
              <span className="text-xs font-medium truncate pr-2">{formatModelDisplay(m)}</span>
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(m.id)}`} />
            </button>
          ))}
        </DropdownButton>

        <VideoSettingsDropdown
          nodeId={nodeId}
          settings={settings}
          apiConfigs={apiConfigs}
          activeDropdown={activeDropdown}
          setActiveDropdown={setActiveDropdown}
          updateNodeSettings={updateNodeSettings}
          isSeedance={isSeedance}
          isGrok={isGrok}
          isHappyHorse={isHappyHorse}
        />

        <GenerateButton isGenerating={isGenerating} onClick={handleGenerate} />
      </div>
    )
  }

  const resolutionOptions = getResolutionsForModel(modelId)
  const currentResolution = (() => {
    const current = settings?.resolution || 'Auto'
    if (resolutionOptions.includes(current)) return current
    return resolutionOptions[0] || 'Auto'
  })()

  return (
    <div
      className="node-footer-controls flex items-center gap-2 flex-wrap shrink-0 px-3 py-2"
      data-onboarding="node-settings"
    >
      <DropdownButton
        nodeId={nodeId}
        type="model"
        activeDropdown={activeDropdown}
        setActiveDropdown={setActiveDropdown}
        wrapperClassName="w-[190px] shrink-0"
        buttonClassName="flex h-8 w-full items-center justify-between gap-1.5 rounded-xl bg-[var(--bg-secondary)] px-2.5 text-[11px] font-medium text-[var(--text-primary)] shadow-sm transition-colors hover:bg-[var(--bg-hover)]"
        panelClassName="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-1.5 shadow-2xl"
        usePortal
        menuWidth={208}
        label={
          <>
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(settings?.model)}`}
            />
            <span className="truncate">{formatModelDisplay(model)}</span>
          </>
        }
      >
        {visibleModelConfigs.map((m, index) => (
          <button
            key={`${m.id || m.modelName || 'model'}-${index}`}
            onClick={() => {
              const nextSettings: any = { model: m.id }
              if (m.id === 'grok-video-3') {
                nextSettings.ratio = '16:9'
                nextSettings.duration = '6s'
                nextSettings.resolution = '720P'
              }
              updateNodeSettings(nodeId, nextSettings)
              setActiveDropdown(null)
            }}
            className="w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
          >
            <span className="text-xs font-medium truncate pr-2">{formatModelDisplay(m)}</span>
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(m.id)}`} />
          </button>
        ))}
      </DropdownButton>

      <ImageSizeDropdown
        nodeId={nodeId}
        ratio={settings?.ratio || '1:1'}
        resolution={currentResolution}
        ratios={getRatiosForModel(settings?.model)}
        resolutions={isMidjourney ? [] : resolutionOptions}
        activeDropdown={activeDropdown}
        setActiveDropdown={setActiveDropdown}
        onSelectRatio={(ratio: string) =>
          updateNodeSettings(nodeId, {
            ratio,
            ...(ratio === '4:1'
              ? {}
              : { _isPanorama: false, prompt: stripPanoramaPrompt(settings?.prompt || '') })
          })
        }
        onSelectResolution={(resolution: string) => updateNodeSettings(nodeId, { resolution })}
      />

      <div className="ml-auto flex items-center gap-2">
        <BatchSizeSelect
          value={settings?.batchSize || 1}
          onChange={(nextValue: number) => updateNodeSettings(nodeId, { batchSize: nextValue })}
        />

        <GenerateButton isGenerating={isGenerating} onClick={handleGenerate} />
      </div>
    </div>
  )
})

function GenerateButton({ isGenerating, onClick }: any) {
  return (
    <button
      onClick={onClick}
      disabled={isGenerating}
      onMouseDown={(e) => e.stopPropagation()}
      className={`ml-auto flex h-8 items-center justify-center gap-1.5 rounded-xl border-none px-2.5 text-[11px] font-semibold text-white shadow-none transition-all ${
        isGenerating
          ? 'min-w-[76px] cursor-not-allowed bg-[var(--bg-secondary)] text-[var(--text-muted)] opacity-80'
          : 'w-8 bg-[var(--primary-color)] hover:opacity-90'
      }`}
      title={isGenerating ? '生成中' : '生成'}
      data-onboarding="node-generate"
    >
      {isGenerating ? (
        <>
          <Loader2 size={13} className="animate-spin" />
          <span className="whitespace-nowrap">生成中</span>
        </>
      ) : (
        <Play size={14} fill="currentColor" />
      )}
    </button>
  )
}

function dedupeModelConfigs(apiConfigs: any[] = [], type: string) {
  const seen = new Set<string>()
  const result: any[] = []
  for (const config of Array.isArray(apiConfigs) ? apiConfigs : []) {
    if (config?.type !== type) continue
    if (config?.isCustom && !String(config?.modelName || '').trim()) continue
    const key = String(config.id || config.modelName || '')
      .trim()
      .toLowerCase()
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    result.push(config)
  }
  return result
}

function DropdownButton({
  nodeId,
  type,
  activeDropdown,
  setActiveDropdown,
  label,
  children,
  wrapperClassName = 'relative shrink-0',
  buttonClassName,
  panelClassName,
  usePortal = false,
  menuWidth
}: any) {
  const isOpen = activeDropdown?.nodeId === nodeId && activeDropdown.type === type
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [menuStyle, setMenuStyle] = useState<{
    left: number
    top?: number
    bottom?: number
    width: number
  } | null>(null)
  const viewport = useViewport()

  const prevViewport = useRef(viewport)

  useEffect(() => {
    if (isOpen && usePortal && prevViewport.current) {
      const pv = prevViewport.current
      if (pv.x !== viewport.x || pv.y !== viewport.y || pv.zoom !== viewport.zoom) {
        setActiveDropdown(null)
      }
    }
    prevViewport.current = viewport
  }, [viewport, isOpen, usePortal, setActiveDropdown])

  useEffect(() => {
    if (!isOpen || !usePortal) return

    const updateMenuPosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.max(menuWidth || 0, rect.width)
      const left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16))
      setMenuStyle({
        left,
        bottom: window.innerHeight - rect.top + 8,
        width
      })
    }

    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)

    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [isOpen, menuWidth, usePortal])

  return (
    <div className={wrapperClassName}>
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation()
          setActiveDropdown(isOpen ? null : { nodeId, type })
        }}
        className={
          buttonClassName ||
          'flex items-center gap-1 rounded-lg bg-[var(--bg-secondary)] px-2.5 py-1 text-[10px] font-medium text-[var(--text-primary)] transition-all hover:bg-[var(--bg-hover)] active:scale-95'
        }
        onMouseDown={(e) => e.stopPropagation()}
      >
        {label}
        <ChevronRight size={10} className="shrink-0 rotate-90 text-[var(--text-muted)]" />
      </button>
      {isOpen &&
        (usePortal ? (
          menuStyle &&
          createPortal(
            <div
              className={
                panelClassName ||
                'rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-1.5 shadow-2xl'
              }
              style={{
                position: 'fixed',
                left: menuStyle.left,
                bottom: menuStyle.bottom,
                width: menuStyle.width,
                zIndex: 120
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {children}
            </div>,
            document.body
          )
        ) : (
          <div
            className={
              panelClassName ||
              'absolute bottom-full left-0 z-[60] mb-1 w-48 rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-1 shadow-xl'
            }
            onMouseDown={(e) => e.stopPropagation()}
          >
            {children}
          </div>
        ))}
    </div>
  )
}

function ImageSizeDropdown({
  nodeId,
  ratio,
  resolution,
  ratios,
  resolutions,
  activeDropdown,
  setActiveDropdown,
  onSelectRatio,
  onSelectResolution
}: any) {
  const isOpen = activeDropdown?.nodeId === nodeId && activeDropdown?.type === 'imageSize'
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [menuStyle, setMenuStyle] = useState<{
    left: number
    top?: number
    bottom?: number
    width: number
  } | null>(null)
  const label = resolutions.length > 0 ? `${ratio} • ${resolution}` : ratio
  const viewport = useViewport()

  useEffect(() => {
    if (!isOpen) return

    const updateMenuPosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      const menuWidth = 308
      const left = Math.max(
        16,
        Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 16)
      )
      setMenuStyle({
        left,
        bottom: window.innerHeight - rect.top + 8,
        width: menuWidth
      })
    }

    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)

    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [isOpen, viewport])

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation()
          setActiveDropdown(isOpen ? null : { nodeId, type: 'imageSize' })
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-8 min-w-[104px] items-center justify-between gap-1 rounded-lg bg-[var(--bg-secondary)] px-2.5 text-[10px] font-mono font-medium text-[var(--text-primary)] transition-all hover:bg-[var(--bg-hover)] active:scale-95"
      >
        <span className="truncate">{label}</span>
        <ChevronRight size={10} className="shrink-0 rotate-90 text-[var(--text-muted)]" />
      </button>

      {isOpen &&
        menuStyle &&
        createPortal(
          <div
            className="fixed z-[120] rounded-[22px] border border-[var(--border-color)] bg-[var(--bg-panel)] p-3 shadow-2xl"
            style={{
              position: 'fixed',
              left: menuStyle.left,
              bottom: menuStyle.bottom,
              width: menuStyle.width
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {resolutions.length > 0 && (
              <div>
                <div className="mb-2 text-[11px] font-medium text-[var(--text-secondary)]">
                  分辨率
                </div>
                <div
                  className={`grid gap-2 ${resolutions.length >= 4 ? 'grid-cols-4' : 'grid-cols-3'}`}
                >
                  {resolutions.map((option: string) => (
                    <button
                      key={option}
                      onClick={() => {
                        onSelectResolution(option)
                        setActiveDropdown(null)
                      }}
                      className={`rounded-xl border px-3 py-2 text-[11px] font-medium transition-all ${
                        resolution === option
                          ? 'border-[var(--primary-color)]/45 bg-[var(--primary-color)]/14 text-[var(--text-primary)]'
                          : 'border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className={resolutions.length > 0 ? 'mt-3' : ''}>
              <div className="mb-2 text-[11px] font-medium text-[var(--text-secondary)]">比例</div>
              <div className="grid grid-cols-5 gap-2">
                {ratios.map((option: string) => (
                  <AspectRatioButton
                    key={option}
                    ratio={option}
                    active={ratio === option}
                    onClick={() => {
                      onSelectRatio(option)
                      setActiveDropdown(null)
                    }}
                  />
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}

function AspectRatioButton({
  ratio,
  active,
  onClick
}: {
  ratio: string
  active: boolean
  onClick: () => void
}) {
  const shape = getRatioShape(ratio)

  return (
    <button
      onClick={onClick}
      className={`flex h-[58px] flex-col items-center justify-center rounded-[16px] border px-2 py-2 transition-all ${
        active
          ? 'border-[var(--primary-color)]/45 bg-[var(--primary-color)]/14 text-[var(--text-primary)]'
          : 'border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
      }`}
    >
      <span
        className="mb-1 block rounded-[5px] border border-current/60"
        style={{ width: shape.width, height: shape.height }}
      />
      <span className="text-[10px] font-medium">{ratio}</span>
    </button>
  )
}

function getRatioShape(ratio: string) {
  switch (ratio) {
    case '9:16':
    case '3:4':
    case '2:3':
    case '4:5':
    case '1:4':
    case '1:8':
      return { width: 10, height: 16 }
    case '16:9':
    case '21:9':
    case '3:2':
    case '4:1':
    case '8:1':
      return { width: 18, height: 9 }
    default:
      return { width: 14, height: 14 }
  }
}

function SimpleDropdown({
  nodeId,
  type,
  activeDropdown,
  setActiveDropdown,
  label,
  options,
  onSelect,
  align = 'center'
}: any) {
  const isOpen = activeDropdown?.nodeId === nodeId && activeDropdown.type === type

  return (
    <div className="relative shrink-0">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setActiveDropdown(isOpen ? null : { nodeId, type })
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-8 items-center gap-1.5 rounded-xl bg-[var(--bg-secondary)] px-2.5 text-[11px] font-medium text-[var(--text-primary)] shadow-sm transition-colors hover:bg-[var(--bg-hover)]"
      >
        {label}
        <ChevronRight size={11} className="shrink-0 rotate-90 text-[var(--text-muted)]" />
      </button>
      {isOpen && (
        <div
          className={`absolute bottom-full ${align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2'} z-[60] mb-2 min-w-[88px] rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-1.5 shadow-2xl`}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {options.map((option: string) => (
            <button
              key={option}
              onClick={() => {
                onSelect(option)
                setActiveDropdown(null)
              }}
              className="block w-full rounded-xl px-3 py-2 text-center text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function BatchSizeSelect({ value, onChange }: any) {
  return (
    <label
      className="flex h-8 items-center gap-1.5 rounded-xl bg-[var(--bg-secondary)] px-2 text-[11px] text-[var(--text-secondary)]"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span>批量</span>
      <select
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        onClick={(e) => e.stopPropagation()}
        className="bg-transparent text-[var(--text-primary)] outline-none cursor-pointer"
        title="批量生成数量"
        style={{ colorScheme: 'dark' }}
      >
        {[1, 2, 3, 4].map((count) => (
          <option
            key={count}
            value={count}
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
          >
            {count}张
          </option>
        ))}
      </select>
    </label>
  )
}

function VideoSettingsDropdown({
  nodeId,
  settings,
  apiConfigs,
  activeDropdown,
  setActiveDropdown,
  updateNodeSettings,
  isSeedance,
  isGrok,
  isHappyHorse
}: any) {
  const isOpen = activeDropdown?.nodeId === nodeId && activeDropdown.type === 'videoSettings'
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [menuStyle, setMenuStyle] = useState<{
    left: number
    top?: number
    bottom?: number
    width: number
  } | null>(null)
  const viewport = useViewport()
  const ratioOptions = isSeedance ? SEEDANCE_VIDEO_RATIOS : getRatiosForModel(settings?.model)
  const rawRatio = settings?.ratio || '16:9'
  const ratio = ratioOptions.includes(rawRatio) ? rawRatio : ratioOptions[0] || '16:9'
  const duration = settings?.duration || '5s'
  const resolutionOptions = isSeedance ? SEEDANCE_VIDEO_RES_OPTIONS : VIDEO_RES_OPTIONS
  const rawResolution = settings?.resolution || (isSeedance ? '720p' : '1080P')
  const resolution = resolutionOptions.includes(rawResolution)
    ? rawResolution
    : resolutionOptions[0] || rawResolution
  const ratios = ratioOptions
  const durations = isSeedance
    ? Array.from({ length: 15 }, (_, index) => `${index + 1}s`)
    : (apiConfigs || []).find((config: any) => config.id === settings?.model)?.durations || [
        '5s',
        '10s'
      ]

  useEffect(() => {
    if (!isOpen) return

    const updateMenuPosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      setMenuStyle({
        left: rect.left,
        bottom: window.innerHeight - rect.top + 8,
        width: Math.max(rect.width, 224)
      })
    }

    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)

    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [isOpen, viewport])

  const renderPills = (items: string[], current: string, field: string) =>
    items.map((item) => (
      <button
        key={item}
        onClick={() => updateNodeSettings(nodeId, { [field]: item })}
        className={`rounded-lg border px-3 py-1.5 text-[10px] font-medium transition-all ${
          current === item
            ? 'border-[var(--primary-color)] bg-[var(--primary-color)]/15 text-[var(--primary-color)]'
            : 'border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
      >
        {item}
      </button>
    ))

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation()
          setActiveDropdown(isOpen ? null : { nodeId, type: 'videoSettings' })
        }}
        className="flex items-center gap-1 rounded-lg bg-[var(--bg-secondary)] px-2.5 py-1 text-[10px] font-mono font-medium text-[var(--text-primary)] transition-all hover:bg-[var(--bg-hover)] active:scale-95"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {ratio} · {duration}
        <ChevronRight size={10} className="shrink-0 rotate-90 text-[var(--text-muted)]" />
      </button>
      {isOpen &&
        menuStyle &&
        createPortal(
          <div
            className="fixed z-[120] space-y-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-3 shadow-2xl"
            style={{
              position: 'fixed',
              left: menuStyle.left,
              bottom: menuStyle.bottom,
              width: menuStyle.width
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div>
              <div className="mb-1.5 text-[10px] font-medium text-[var(--text-muted)]">比例</div>
              <div className="flex flex-wrap gap-1.5">{renderPills(ratios, ratio, 'ratio')}</div>
            </div>
            <div>
              <div className="mb-1.5 text-[10px] font-medium text-[var(--text-muted)]">时长</div>
              <div className="flex flex-wrap gap-1.5">
                {renderPills(durations, duration, 'duration')}
              </div>
            </div>
            {(isGrok || isSeedance || isHappyHorse) && (
              <div>
                <div className="mb-1.5 text-[10px] font-medium text-[var(--text-muted)]">
                  分辨率
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {renderPills(resolutionOptions, resolution, 'resolution')}
                </div>
              </div>
            )}
            {settings?.model === 'sora-2' && (
              <label
                className="flex cursor-pointer items-center gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={settings?.isHD || false}
                  onChange={(e) => {
                    e.stopPropagation()
                    updateNodeSettings(nodeId, { isHD: e.target.checked })
                  }}
                  className="h-3 w-3 cursor-pointer accent-[var(--primary-color)]"
                  onMouseDown={(e) => e.stopPropagation()}
                />
                <span className="text-[10px] text-[var(--text-secondary)]">HD 高清</span>
              </label>
            )}
          </div>,
          document.body
        )}
    </div>
  )
}
export function enablePanoramaMode(nodeId: string, settings: any, updateNodeSettings: any) {
  const cleanedPrompt = stripPanoramaPrompt(settings?.prompt || '')

  if (settings?._isPanorama) {
    updateNodeSettings(nodeId, { _isPanorama: false, prompt: cleanedPrompt })
    return
  }

  updateNodeSettings(nodeId, {
    ratio: '4:1',
    resolution: settings?.resolution && settings.resolution !== 'Auto' ? settings.resolution : '4K',
    prompt: cleanedPrompt,
    _isPanorama: true
  })
}

function stripPanoramaPrompt(prompt: string) {
  if (!prompt) return ''

  return prompt
    .replace(
      /,\s*720 degree seamless panoramic view,\s*equirectangular projection,\s*continuous wraparound scene,\s*consistent lighting and color throughout,\s*no visible seams,\s*immersive environment,\s*ultra wide panorama/gi,
      ''
    )
    .replace(
      /\.?\s*Generate a 720-degree seamless panoramic extension of this image\.[\s\S]*?Seamless equirectangular projection\.?/gi,
      ''
    )
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/^[,\s]+|[,\s]+$/g, '')
}
