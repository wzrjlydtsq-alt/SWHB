/**
 * CameraAngleModal — 多角度编辑器弹窗
 *
 * 参照竞品截图设计：
 * - 线框球体 + 拖拽控制
 * - 水平环绕/垂直俯仰/景别缩放 三滑块
 * - 7 个快捷预设按钮
 * - 实时生成 Prompt 并可应用到节点
 */

import { useState, useCallback, useMemo } from 'react'
import { LightSphereControl } from '../lighting/LightSphereControl.tsx'
import { CAMERA_PRESETS, buildCameraPrompt, getScaleLabel } from './cameraPresets.ts'

/**
 * @param {Object} props
 * @param {boolean} props.open - 是否显示
 * @param {Function} props.onClose - 关闭回调
 * @param {Function} props.onApply - (promptText: string) => void 应用 Prompt 到节点
 * @param {string} [props.previewImage] - 中心预览图
 */
export function CameraAngleModal({ open, onClose, onApply, previewImage }) {
  const [azimuth, setAzimuth] = useState(0)
  const [elevation, setElevation] = useState(0)
  const [scale, setScale] = useState(0.8)
  const [showPrompt, setShowPrompt] = useState(false)
  const [activePreset, setActivePreset] = useState('自定义')
  const [presetPrompt, setPresetPrompt] = useState('')

  const prompt = useMemo(
    () => buildCameraPrompt(azimuth, elevation, scale, presetPrompt),
    [azimuth, elevation, scale, presetPrompt]
  )

  const handleAngleChange = useCallback((az, el) => {
    setAzimuth(az)
    setElevation(el)
    setActivePreset('自定义')
    setPresetPrompt('')
  }, [])

  const handlePreset = useCallback((preset) => {
    setAzimuth(preset.azimuth)
    setElevation(preset.elevation)
    setScale(preset.scale)
    setActivePreset(preset.label)
    setPresetPrompt(preset.prompt || '')
  }, [])

  const handleReset = useCallback(() => {
    setAzimuth(0)
    setElevation(0)
    setScale(0.8)
    setActivePreset('自定义')
    setPresetPrompt('')
  }, [])

  const handleApply = useCallback(() => {
    onApply?.(prompt)
    onClose?.()
  }, [prompt, onApply, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-2xl shadow-2xl w-[520px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
          <span className="text-sm font-semibold text-[var(--text-primary)]">多角度编辑器</span>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-lg"
          >
            ✕
          </button>
        </div>

        {/* 预设按钮 */}
        <div className="flex flex-wrap gap-1.5 px-4 pt-3">
          {CAMERA_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => handlePreset(preset)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                activePreset === preset.label
                  ? 'bg-[var(--primary-color)] text-white'
                  : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* 主体内容 */}
        <div className="flex items-start gap-4 px-4 py-4">
          {/* 左：球体控制器 */}
          <div className="flex-shrink-0">
            <LightSphereControl
              azimuth={azimuth}
              elevation={elevation}
              onAngleChange={handleAngleChange}
              mode="camera"
              previewImage={previewImage}
              size={180}
            />
          </div>

          {/* 右：滑块控制 */}
          <div className="flex-1 flex flex-col gap-4 min-w-0">
            {/* 水平环绕 */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-secondary)] w-14 shrink-0">水平环绕</span>
              <input
                type="range"
                min={-180}
                max={180}
                value={azimuth}
                onChange={(e) => {
                  setAzimuth(Number(e.target.value))
                  setActivePreset('自定义')
                  setPresetPrompt('')
                }}
                className="flex-1 accent-[var(--primary-color)]"
              />
              <span className="text-xs text-[var(--primary-color)] font-mono w-10 text-right">
                {azimuth}°
              </span>
            </div>

            {/* 垂直俯仰 */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-secondary)] w-14 shrink-0">垂直俯仰</span>
              <input
                type="range"
                min={-90}
                max={90}
                value={elevation}
                onChange={(e) => {
                  setElevation(Number(e.target.value))
                  setActivePreset('自定义')
                  setPresetPrompt('')
                }}
                className="flex-1 accent-[var(--primary-color)]"
              />
              <span className="text-xs text-[var(--primary-color)] font-mono w-10 text-right">
                {elevation}°
              </span>
            </div>

            {/* 景别缩放 */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-secondary)] w-14 shrink-0">景别缩放</span>
              <input
                type="range"
                min={0}
                max={200}
                value={scale * 100}
                onChange={(e) => {
                  setScale(Number(e.target.value) / 100)
                  setActivePreset('自定义')
                  setPresetPrompt('')
                }}
                className="flex-1 accent-[var(--primary-color)]"
              />
              <span className="text-xs text-[var(--primary-color)] font-medium w-10 text-right">
                {getScaleLabel(scale)}
              </span>
            </div>

            {/* 提示词开关 */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-secondary)]">提示词</span>
              <button
                onClick={() => setShowPrompt(!showPrompt)}
                className={`w-8 h-4 rounded-full transition-all relative ${
                  showPrompt ? 'bg-[var(--primary-color)]' : 'bg-[var(--border-color)]'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${
                    showPrompt ? 'left-4' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Prompt 预览 */}
        {showPrompt && (
          <div className="mx-4 mb-2 p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)]">
            <p className="text-[10px] text-[var(--text-secondary)] font-mono break-all">{prompt}</p>
          </div>
        )}

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-color)]">
          <button
            onClick={handleReset}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1"
          >
            🔄 重置参数
          </button>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-[var(--text-muted)]">
              ⬇ {prompt.split(',').length}
            </span>
            <button
              onClick={handleApply}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[var(--primary-color)] text-white hover:brightness-110 transition-all flex items-center gap-1"
            >
              应用 ↑
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
