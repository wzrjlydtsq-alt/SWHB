import React, { memo } from 'react'
import { ChevronRight, Play, Eraser } from '../../../utils/icons.jsx'
import {
  getRatiosForModel,
  VIDEO_RES_OPTIONS,
  getResolutionsForModel
} from '../../../utils/constants.js'

/**
 * GenToolbar — 底部工具栏：模型/比例/时长/分辨率/批量/生成按钮
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
  hasMaskInfo
}) {
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
  const isMidjourney =
    model && (model.id.includes('mj') || model.provider?.toLowerCase().includes('midjourney'))

  const filterType = nodeType === 'gen-image' ? 'Image' : 'Video'

  // gen-video 使用卡片式布局
  if (nodeType === 'gen-video') {
    return (
      <div className="flex items-center gap-1.5 flex-wrap shrink-0 px-3 py-2 border-t border-[var(--border-color)]">
        {/* 首尾帧开关 */}
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

        {/* 模型选择器 */}
        <DropdownButton
          nodeId={nodeId}
          type="model"
          activeDropdown={activeDropdown}
          setActiveDropdown={setActiveDropdown}
          label={
            <>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(settings?.model)}`} />
              <span className="truncate max-w-[80px]">{model?.provider || '选择模型'}</span>
            </>
          }
        >
          {apiConfigs
            .filter((m) => m.type === filterType)
            .map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  const next = { model: m.id }
                  if (m.id === 'grok-3') {
                    next.ratio = '3:2'
                    next.duration = '8s'
                    next.resolution = '1080P'
                  }
                  updateNodeSettings(nodeId, next)
                  setActiveDropdown(null)
                }}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
              >
                <span className="text-xs font-medium truncate pr-2">{m.provider}</span>
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(m.id)}`} />
              </button>
            ))}
        </DropdownButton>

        {/* 比例 · 时长设置 */}
        <VideoSettingsDropdown
          nodeId={nodeId}
          settings={settings}
          apiConfigs={apiConfigs}
          activeDropdown={activeDropdown}
          setActiveDropdown={setActiveDropdown}
          updateNodeSettings={updateNodeSettings}
          isSeedance={isSeedance}
          isGrok={isGrok}
        />

        {/* 生成按钮 */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="ml-auto flex items-center gap-1 px-3 py-1 rounded-lg text-[10px] font-bold transition-all active:scale-95 bg-[var(--primary-color)] text-white hover:opacity-90 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <span>⚡</span>
          <span>生成</span>
        </button>
      </div>
    )
  }

  // gen-image 布局
  return (
    <div className="flex items-center justify-between shrink-0 relative gap-2 px-3 py-2 border-t border-[var(--border-color)]">
      {/* 模型选择器 */}
      <div className="relative flex-1 min-w-0">
        <button
          title={model?.provider}
          onClick={(e) => {
            e.stopPropagation()
            setActiveDropdown(
              activeDropdown?.type === 'model' ? null : { nodeId, type: 'model' }
            )
          }}
          className="flex items-center justify-between pl-1.5 pr-2 py-1 rounded text-[10px] font-medium transition-colors border w-full bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-color)] active:scale-95 shadow-sm"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${getStatusColor(settings?.model)}`} />
            <span className="truncate">{model?.provider || 'Model'}</span>
          </div>
          <ChevronRight size={10} className="text-[var(--text-muted)] rotate-90 shrink-0 ml-1" />
        </button>
        {activeDropdown?.nodeId === nodeId && activeDropdown.type === 'model' && (
          <div
            className="absolute bottom-full left-0 mb-1 w-48 rounded shadow-xl p-1 z-[60] border bg-[var(--bg-panel)] border-[var(--border-color)]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {apiConfigs
              .filter((m) => m.type === filterType)
              .map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    const nextSettings = { model: m.id }
                    if (m.id === 'grok-3') {
                      nextSettings.ratio = '3:2'
                      nextSettings.duration = '8s'
                      nextSettings.resolution = '1080P'
                    }
                    updateNodeSettings(nodeId, nextSettings)
                    setActiveDropdown(null)
                  }}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
                >
                  <span className="text-xs font-medium truncate pr-2">{m.provider}</span>
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(m.id)}`} />
                </button>
              ))}
          </div>
        )}
      </div>

      {/* 比例/分辨率/时长 */}
      <div className="flex gap-1 shrink-0">
        {/* 比例 */}
        <SimpleDropdown
          nodeId={nodeId}
          type="ratio"
          activeDropdown={activeDropdown}
          setActiveDropdown={setActiveDropdown}
          label={settings?.ratio || 'Auto'}
          options={getRatiosForModel(settings?.model)}
          onSelect={(r) => updateNodeSettings(nodeId, { ratio: r })}
        />

        {/* 分辨率 (非 Midjourney) */}
        {!isMidjourney && (
          <SimpleDropdown
            nodeId={nodeId}
            type="res"
            activeDropdown={activeDropdown}
            setActiveDropdown={setActiveDropdown}
            label={(() => {
              const availableRes = getResolutionsForModel(modelId)
              const curr = settings?.resolution || 'Auto'
              if (!availableRes.includes(curr) && availableRes.length > 0) {
                setTimeout(() => updateNodeSettings(nodeId, { resolution: availableRes[0] }), 0)
                return availableRes[0] || 'Auto'
              }
              return curr
            })()}
            options={getResolutionsForModel(modelId)}
            onSelect={(r) => updateNodeSettings(nodeId, { resolution: r })}
            align="right"
          />
        )}

        {/* Batch Size */}
        <div className="flex items-center">
          <span className="text-[10px] mr-1.5 font-medium text-[var(--text-secondary)]">Batch:</span>
          <select
            value={settings?.batchSize || 1}
            onChange={(e) => updateNodeSettings(nodeId, { batchSize: parseInt(e.target.value) })}
            onClick={(e) => e.stopPropagation()}
            className="w-10 px-0.5 py-0.5 rounded text-[10px] font-mono border outline-none transition-colors text-center cursor-pointer bg-[var(--bg-panel)] border-[var(--border-color)] hover:border-[var(--primary-color)]/50 text-[var(--text-primary)] shadow-sm"
            title="批量生成数量"
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 生成按钮 */}
      <button
        onClick={handleGenerate}
        className="p-1.5 flex items-center justify-center rounded transition-all active:scale-95 bg-[var(--primary-color)] text-white hover:opacity-90 shadow-sm shrink-0 outline-none"
        title="生成"
      >
        <Play size={14} fill="currentColor" />
      </button>
    </div>
  )
})

// ========== 辅助组件 ==========

/** 通用下拉按钮 */
function DropdownButton({ nodeId, type, activeDropdown, setActiveDropdown, label, children }) {
  const isOpen = activeDropdown?.nodeId === nodeId && activeDropdown.type === type
  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setActiveDropdown(isOpen ? null : { nodeId, type })
        }}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] active:scale-95"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {label}
        <ChevronRight size={10} className="text-[var(--text-muted)] rotate-90 shrink-0" />
      </button>
      {isOpen && (
        <div
          className="absolute bottom-full left-0 mb-1 w-48 rounded-lg shadow-xl p-1 z-[60] border bg-[var(--bg-panel)] border-[var(--border-color)]"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      )}
    </div>
  )
}

/** 简单选项下拉 */
function SimpleDropdown({ nodeId, type, activeDropdown, setActiveDropdown, label, options, onSelect, align }) {
  const isOpen = activeDropdown?.nodeId === nodeId && activeDropdown.type === type
  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setActiveDropdown(isOpen ? null : { nodeId, type })
        }}
        className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium border transition-colors bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border-[var(--border-color)] active:scale-95 shadow-sm"
      >
        {label}
        <ChevronRight size={10} className="text-[var(--text-muted)] rotate-90 shrink-0" />
      </button>
      {isOpen && (
        <div
          className={`absolute bottom-full ${align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2'} mb-1 w-24 rounded shadow-xl p-1 z-[60] border bg-[var(--bg-panel)] border-[var(--border-color)]`}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {options.map((o) => (
            <button
              key={o}
              onClick={() => { onSelect(o); setActiveDropdown(null) }}
              className="w-full text-center py-1 text-[10px] rounded text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** gen-video 比例·时长·分辨率设置面板 */
function VideoSettingsDropdown({
  nodeId, settings, apiConfigs, activeDropdown, setActiveDropdown,
  updateNodeSettings, isSeedance, isGrok
}) {
  const isOpen = activeDropdown?.nodeId === nodeId && activeDropdown.type === 'videoSettings'
  const ratio = settings?.ratio || '16:9'
  const duration = settings?.duration || '5s'
  const resolution = settings?.resolution || (isSeedance ? '720p' : '1080P')
  const ratios = getRatiosForModel(settings?.model)
  const durations = isSeedance
    ? Array.from({ length: 15 }, (_, i) => `${i + 1}s`)
    : apiConfigs.find((c) => c.id === settings?.model)?.durations || ['5s', '10s']

  const renderPills = (items, current, field) =>
    items.map((item) => (
      <button
        key={item}
        onClick={() => updateNodeSettings(nodeId, { [field]: item })}
        className={`px-3 py-1.5 rounded-lg text-[10px] font-medium border transition-all ${
          current === item
            ? 'bg-[var(--primary-color)]/15 border-[var(--primary-color)] text-[var(--primary-color)]'
            : 'bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
      >
        {item}
      </button>
    ))

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setActiveDropdown(isOpen ? null : { nodeId, type: 'videoSettings' })
        }}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-mono font-medium border transition-all bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] active:scale-95"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {ratio} · {duration}
        <ChevronRight size={10} className="text-[var(--text-muted)] rotate-90 shrink-0" />
      </button>
      {isOpen && (
        <div
          className="absolute bottom-full left-0 mb-1 w-56 rounded-xl shadow-2xl p-3 z-[60] border bg-[var(--bg-panel)] border-[var(--border-color)] space-y-3"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div>
            <div className="text-[10px] font-medium text-[var(--text-muted)] mb-1.5">比例</div>
            <div className="flex flex-wrap gap-1.5">{renderPills(ratios, ratio, 'ratio')}</div>
          </div>
          <div>
            <div className="text-[10px] font-medium text-[var(--text-muted)] mb-1.5">时长</div>
            <div className="flex flex-wrap gap-1.5">{renderPills(durations, duration, 'duration')}</div>
          </div>
          {(isGrok || isSeedance) && (
            <div>
              <div className="text-[10px] font-medium text-[var(--text-muted)] mb-1.5">分辨率</div>
              <div className="flex flex-wrap gap-1.5">
                {renderPills(
                  isSeedance ? ['720p', '480p'] : VIDEO_RES_OPTIONS,
                  resolution,
                  'resolution'
                )}
              </div>
            </div>
          )}
          {settings?.model === 'sora-2' && (
            <label className="flex items-center gap-2 cursor-pointer" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={settings?.isHD || false}
                onChange={(e) => {
                  e.stopPropagation()
                  updateNodeSettings(nodeId, { isHD: e.target.checked })
                }}
                className="w-3 h-3 cursor-pointer accent-[var(--primary-color)]"
                onMouseDown={(e) => e.stopPropagation()}
              />
              <span className="text-[10px] text-[var(--text-secondary)]">HD 高清</span>
            </label>
          )}
        </div>
      )}
    </div>
  )
}
