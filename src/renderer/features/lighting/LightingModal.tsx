/**
 * LightingModal — 打光效果控制台弹窗
 *
 * 参照竞品截图设计：
 * - SVG 球体 + 拖拽光源
 * - 透视/正面 视图切换
 * - 亮度滑块 + 颜色选择器
 * - 主光源 6 方向快捷按钮
 * - 轮廓光开关 + 智能模式
 */

import { useState, useCallback, useMemo } from 'react'
import { LightSphereControl } from './LightSphereControl.tsx'
import {
  DIRECTION_ANGLE_MAP,
  SMART_PRESETS,
  buildLightingPrompt,
  inferSmartPresetName
} from './lightingPresets.ts'

const DIRECTIONS = ['左侧', '顶部', '右侧', '前方', '底部', '后方']

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Function} props.onClose
 * @param {Function} props.onApply - (promptText: string) => void
 * @param {string} [props.previewImage]
 */
export function LightingModal({ open, onClose, onApply, previewImage }) {
  const [direction, setDirection] = useState<any>('前方')
  const [brightness, setBrightness] = useState(50)
  const [color, setColor] = useState('#ffffff')
  const [rimLight, setRimLight] = useState(false)
  const [smartMode, setSmartMode] = useState(false)
  const [viewMode, setViewMode] = useState<any>('perspective')

  // 从方向获取球体角度
  const angles = DIRECTION_ANGLE_MAP[direction] || { azimuth: 0, elevation: 0 }
  const inferredSmartPreset = useMemo(
    () => inferSmartPresetName({ direction, brightness, rimLight }),
    [direction, brightness, rimLight]
  )

  const prompt = useMemo(
    () => buildLightingPrompt({ direction, brightness, color, rimLight, smartMode, viewMode }),
    [direction, brightness, color, rimLight, smartMode, viewMode]
  )

  const handleAngleChange = useCallback((az, el) => {
    // 根据角度反推最近的方向
    let best = '前方'
    let bestDist = Infinity
    for (const [dir, a] of Object.entries(DIRECTION_ANGLE_MAP)) {
      const d = Math.abs(a.azimuth - az) + Math.abs(a.elevation - el)
      if (d < bestDist) {
        bestDist = d
        best = dir
      }
    }
    setDirection(best)
  }, [])

  const handleSmartPreset = useCallback((name) => {
    const p = SMART_PRESETS[name]
    if (!p) return
    setDirection(p.direction)
    setBrightness(p.brightness)
    setRimLight(p.rimLight)
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
          <span className="text-sm font-semibold text-[var(--text-primary)]">打光效果</span>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-lg"
          >
            ✕
          </button>
        </div>

        {/* 主体 */}
        <div className="flex items-start gap-4 px-4 py-4">
          {/* 左：球体 + 视图切换 */}
          <div className="flex-shrink-0 flex flex-col items-center gap-2">
            {/* 视图切换 */}
            <div className="flex rounded-lg overflow-hidden border border-[var(--border-color)]">
              {['透视', '正面'].map((m) => (
                <button
                  key={m}
                  onClick={() => setViewMode(m === '透视' ? 'perspective' : 'front')}
                  className={`px-3 py-1 text-xs font-medium transition-all ${
                    (m === '透视' && viewMode === 'perspective') ||
                    (m === '正面' && viewMode === 'front')
                      ? 'bg-[var(--primary-color)] text-white'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            <LightSphereControl
              azimuth={angles.azimuth}
              elevation={angles.elevation}
              onAngleChange={handleAngleChange}
              mode="light"
              previewImage={previewImage}
              size={180}
            />
          </div>

          {/* 右：控制面板 */}
          <div className="flex-1 flex flex-col gap-3 min-w-0">
            {/* 全局标题 + 智能模式 */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--text-primary)]">全局</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--text-secondary)]">智能模式</span>
                <button
                  onClick={() => setSmartMode(!smartMode)}
                  className={`w-8 h-4 rounded-full transition-all relative ${
                    smartMode ? 'bg-[var(--primary-color)]' : 'bg-[var(--border-color)]'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${smartMode ? 'left-4' : 'left-0.5'}`}
                  />
                </button>
              </div>
            </div>

            {/* 智能预设（智能模式开启时显示） */}
            {smartMode && (
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(SMART_PRESETS).map((name) => (
                  <button
                    key={name}
                    onClick={() => handleSmartPreset(name)}
                    className={`px-2 py-1 rounded text-[10px] transition-all ${
                      inferredSmartPreset === name
                        ? 'bg-[var(--primary-color)] text-white'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}

            {/* 亮度 */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-secondary)] w-8 shrink-0">亮度</span>
              <input
                type="range"
                min={0}
                max={100}
                value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
                className="flex-1 accent-[var(--primary-color)]"
              />
              <span className="text-xs text-[var(--text-secondary)] font-mono w-12 text-right flex items-center gap-0.5">
                ☀ {brightness}%
              </span>
            </div>

            {/* 颜色 */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-secondary)] w-8 shrink-0">颜色</span>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-8 h-6 rounded border border-[var(--border-color)] cursor-pointer"
                style={{ padding: 0 }}
              />
              <span className="text-[10px] text-[var(--text-muted)] font-mono">{color}</span>
            </div>

            {/* 主光源方向 */}
            <div>
              <span className="text-xs text-[var(--text-secondary)] mb-1.5 block">主光源</span>
              <div className="grid grid-cols-3 gap-1.5">
                {DIRECTIONS.map((dir) => (
                  <button
                    key={dir}
                    onClick={() => setDirection(dir)}
                    className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      direction === dir
                        ? 'bg-[var(--primary-color)] text-white'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                    }`}
                  >
                    {dir}
                  </button>
                ))}
              </div>
            </div>

            {/* 轮廓光 */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-[var(--text-secondary)]">轮廓光</span>
              <button
                onClick={() => setRimLight(!rimLight)}
                className={`w-8 h-4 rounded-full transition-all relative ${
                  rimLight ? 'bg-[var(--primary-color)]' : 'bg-[var(--border-color)]'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${rimLight ? 'left-4' : 'left-0.5'}`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* 底部 */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-color)]">
          <span className="text-[10px] text-[var(--text-muted)]">⬇ {prompt.split(',').length}</span>
          <button
            onClick={handleApply}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[var(--primary-color)] text-white hover:brightness-110 transition-all flex items-center gap-1"
          >
            应用 ↑
          </button>
        </div>
      </div>
    </div>
  )
}
