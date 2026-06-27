/**
 * LightSphereControl — SVG 可交互线框球体控制器
 *
 * 复用于多角度编辑器(拖拽相机位置)和打光效果(拖拽光源位置)
 * 纯 SVG + CSS 实现，零依赖
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { getXingheMediaSrc } from '../../utils/fileHelpers.ts'

/**
 * @param {Object} props
 * @param {number} props.azimuth - 水平角度 (-180 ~ 180)
 * @param {number} props.elevation - 垂直角度 (-90 ~ 90)
 * @param {Function} props.onAngleChange - (azimuth, elevation) => void
 * @param {'camera'|'light'} props.mode - 控制器模式
 * @param {string} [props.previewImage] - 中心预览图 URL
 * @param {number} [props.size] - 控件尺寸(px), 默认 200
 */
export function LightSphereControl({
  azimuth = 0,
  elevation = 0,
  onAngleChange,
  mode = 'camera',
  previewImage,
  size = 200
}) {
  const svgRef = useRef(null)
  const dragging = useRef(false)
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 16

  // 角度转球面投影坐标
  const angleTo2D = useCallback(
    (az, el) => {
      const azRad = (az * Math.PI) / 180
      const elRad = (el * Math.PI) / 180
      const x = cx + r * Math.sin(azRad) * Math.cos(elRad) * 0.85
      const y = cy - r * Math.sin(elRad) * 0.85
      return { x, y }
    },
    [cx, cy, r]
  )

  // 2D坐标转角度
  const coord2DToAngle = useCallback(
    (clientX, clientY) => {
      const svg = svgRef.current
      if (!svg) return { az: azimuth, el: elevation }
      const rect = svg.getBoundingClientRect()
      const px = clientX - rect.left - cx
      const py = -(clientY - rect.top - cy)

      const dist = Math.sqrt(px * px + py * py)
      const maxDist = r * 0.85

      const clampedDist = Math.min(dist, maxDist)
      const el = Math.asin(Math.min(1, py / maxDist)) * (180 / Math.PI)
      const az =
        Math.atan2(px, Math.max(0.01, Math.cos((el * Math.PI) / 180) * maxDist)) * (180 / Math.PI)

      return {
        az: Math.max(-180, Math.min(180, az * (dist / maxDist > 0.1 ? 1 : 0))),
        el: Math.max(-90, Math.min(90, el))
      }
    },
    [cx, cy, r, azimuth, elevation]
  )

  const handlePointerDown = useCallback(
    (e) => {
      e.preventDefault()
      dragging.current = true
      const { az, el } = coord2DToAngle(e.clientX, e.clientY)
      onAngleChange?.(Math.round(az), Math.round(el))
    },
    [coord2DToAngle, onAngleChange]
  )

  const handlePointerMove = useCallback(
    (e) => {
      if (!dragging.current) return
      const { az, el } = coord2DToAngle(e.clientX, e.clientY)
      onAngleChange?.(Math.round(az), Math.round(el))
    },
    [coord2DToAngle, onAngleChange]
  )

  const handlePointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  useEffect(() => {
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [handlePointerMove, handlePointerUp])

  const pos = angleTo2D(azimuth, elevation)
  const isCamera = mode === 'camera'
  const dotColor = isCamera ? '#3b82f6' : '#f59e0b'
  const dotGlow = isCamera ? '#3b82f680' : '#f59e0b80'
  const previewSrc = previewImage ? getXingheMediaSrc(previewImage) : null

  // 生成线框球体的经纬线
  const meridians = []
  const parallels = []
  for (let lng = 0; lng < 180; lng += 30) {
    const points = []
    for (let lat = -90; lat <= 90; lat += 5) {
      const p = angleTo2D(lng - 90, lat)
      points.push(`${p.x},${p.y}`)
    }
    meridians.push(points.join(' '))
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const points = []
    for (let lng = -180; lng <= 180; lng += 5) {
      const p = angleTo2D(lng, lat)
      points.push(`${p.x},${p.y}`)
    }
    parallels.push(points.join(' '))
  }

  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      onPointerDown={handlePointerDown}
      style={{ cursor: 'crosshair', userSelect: 'none', touchAction: 'none' }}
    >
      {/* 外圈 */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={1} />

      {/* 经线 */}
      {meridians.map((pts, i) => (
        <polyline
          key={`m${i}`}
          points={pts}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={0.5}
        />
      ))}

      {/* 纬线 */}
      {parallels.map((pts, i) => (
        <polyline
          key={`p${i}`}
          points={pts}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={0.5}
        />
      ))}

      {/* 十字轴 */}
      <line
        x1={cx - r}
        y1={cy}
        x2={cx + r}
        y2={cy}
        stroke="rgba(255,255,255,0.12)"
        strokeWidth={0.5}
      />
      <line
        x1={cx}
        y1={cy - r}
        x2={cx}
        y2={cy + r}
        stroke="rgba(255,255,255,0.12)"
        strokeWidth={0.5}
      />

      {/* 中心预览图 */}
      {previewSrc && (
        <image
          href={previewSrc}
          x={cx - 40}
          y={cy - 30}
          width={80}
          height={60}
          preserveAspectRatio="xMidYMid slice"
          opacity={0.85}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* 控制点光晕 */}
      <circle cx={pos.x} cy={pos.y} r={14} fill={dotGlow} style={{ pointerEvents: 'none' }} />

      {/* 控制点 */}
      <circle
        cx={pos.x}
        cy={pos.y}
        r={7}
        fill={dotColor}
        stroke="white"
        strokeWidth={2}
        style={{ pointerEvents: 'none' }}
      />

      {/* 控制点标签 */}
      <text
        x={pos.x}
        y={pos.y - 14}
        textAnchor="middle"
        fill="white"
        fontSize={10}
        fontWeight="bold"
        style={{ pointerEvents: 'none' }}
      >
        {isCamera ? '🎬' : '☀️'}
      </text>

      {/* 方向标识 */}
      <text x={cx} y={14} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={9}>
        ↑
      </text>
      <text x={cx} y={size - 6} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={9}>
        ↓
      </text>
      <text x={8} y={cy + 3} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={9}>
        ←
      </text>
      <text x={size - 8} y={cy + 3} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={9}>
        →
      </text>
    </svg>
  )
}
