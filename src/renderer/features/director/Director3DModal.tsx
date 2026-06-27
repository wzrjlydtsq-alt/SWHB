import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Suspense } from 'react'
import { Canvas, useLoader, useThree } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import { BackSide, PerspectiveCamera, SRGBColorSpace, TextureLoader } from 'three'
import { Mannequin, MannequinFallback } from './Mannequin.tsx'
import {
  DIRECTOR_ASPECT_RATIOS,
  DIRECTOR_BACKGROUND_MODES,
  DIRECTOR_BONE_AXES,
  DIRECTOR_BONE_CONTROLS,
  DIRECTOR_CAMERA_BIND_MODES,
  DIRECTOR_CAMERA_OFFSET_PRESETS,
  DIRECTOR_CHARACTER_VARIANTS,
  DIRECTOR_COMPOSITIONS,
  DIRECTOR_POSE_PRESETS,
  DIRECTOR_SCENE_ASSET_PRESETS,
  DIRECTOR_SHOT_TYPES,
  buildDirectorPrompt,
  getDefaultDirectorState,
  getDirectorCameraOffsetPresetConfig,
  getDirectorFrameRatioValue,
  useDirectorStore
} from './useDirectorStore.ts'
import { addAssetToLibrary } from '../../utils/assetLibrary.ts'
import { apiClient } from '../../services/apiClient.ts'
import { DEFAULT_BASE_URL } from '../../utils/constants.ts'
import {
  addImagePathToReferenceNode,
  copyImagePathToClipboard,
  findBestReferenceTargetNodeId,
  saveDataUrlToLocalCache
} from '../../utils/snapshotUtils.ts'
import { useAppStore } from '../../store/useAppStore.ts'
import { getImageDimensions, getXingheMediaSrc } from '../../utils/fileHelpers.ts'

const FALLBACK_DIRECTOR_STATE = Object.freeze(getDefaultDirectorState())

function clampNumber(value, fallback, min, max) {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Number(value)))
}

function computeFrameRect(width, height, frameRatio) {
  const ratio = getDirectorFrameRatioValue(frameRatio)

  if (!ratio) {
    return {
      left: 0,
      top: 0,
      width,
      height,
      ratio: null
    }
  }

  const safeWidth = width * 0.84
  const safeHeight = height * 0.82
  let frameWidth = safeWidth
  let frameHeight = frameWidth / ratio

  if (frameHeight > safeHeight) {
    frameHeight = safeHeight
    frameWidth = frameHeight * ratio
  }

  return {
    left: (width - frameWidth) / 2,
    top: (height - frameHeight) / 2,
    width: frameWidth,
    height: frameHeight,
    ratio
  }
}

function computeContainRect(containerWidth, containerHeight, contentWidth, contentHeight) {
  if (!containerWidth || !containerHeight || !contentWidth || !contentHeight) {
    return { left: 0, top: 0, width: containerWidth, height: containerHeight }
  }

  const scale = Math.min(containerWidth / contentWidth, containerHeight / contentHeight)
  const width = contentWidth * scale
  const height = contentHeight * scale
  return {
    left: (containerWidth - width) / 2,
    top: (containerHeight - height) / 2,
    width,
    height
  }
}

function computeCoverRect(containerWidth, containerHeight, contentWidth, contentHeight) {
  if (!containerWidth || !containerHeight || !contentWidth || !contentHeight) {
    return { left: 0, top: 0, width: containerWidth, height: containerHeight }
  }

  const scale = Math.max(containerWidth / contentWidth, containerHeight / contentHeight)
  const width = contentWidth * scale
  const height = contentHeight * scale
  return {
    left: (containerWidth - width) / 2,
    top: (containerHeight - height) / 2,
    width,
    height
  }
}

function getPanoramaObjectPosition(cameraAzimuth) {
  const normalized = ((((cameraAzimuth || 0) / 360 + 0.5) % 1) + 1) % 1
  return normalized
}

function getPlateObjectPosition(backgroundPlate, camera) {
  if (!backgroundPlate) return { x: 0.5, y: 0.5 }
  return {
    x: backgroundPlate.mode === 'panorama' ? getPanoramaObjectPosition(camera?.azimuth || 0) : 0.5,
    y: backgroundPlate.horizon ?? 0.5
  }
}

function computeCoverSourceRect(
  containerWidth,
  containerHeight,
  imageWidth,
  imageHeight,
  position
) {
  if (!containerWidth || !containerHeight || !imageWidth || !imageHeight) {
    return { sx: 0, sy: 0, sw: imageWidth || 1, sh: imageHeight || 1 }
  }

  const scale = Math.max(containerWidth / imageWidth, containerHeight / imageHeight)
  const sw = Math.min(imageWidth, containerWidth / scale)
  const sh = Math.min(imageHeight, containerHeight / scale)
  const sx = (imageWidth - sw) * clampNumber(position.x, 0.5, 0, 1)
  const sy = (imageHeight - sh) * clampNumber(position.y, 0.5, 0, 1)
  return { sx, sy, sw, sh }
}

function imagePersonToViewportPerson(
  person,
  backgroundPlate,
  viewportWidth,
  viewportHeight,
  camera
) {
  if (!backgroundPlate?.width || !backgroundPlate?.height || !viewportWidth || !viewportHeight) {
    return person
  }

  const position = getPlateObjectPosition(backgroundPlate, camera)
  const crop = computeCoverSourceRect(
    viewportWidth,
    viewportHeight,
    backgroundPlate.width,
    backgroundPlate.height,
    position
  )
  const x = (person.x * backgroundPlate.width - crop.sx) / crop.sw
  const y = (person.y * backgroundPlate.height - crop.sy) / crop.sh
  const width = (person.width * backgroundPlate.width) / crop.sw
  const height = (person.height * backgroundPlate.height) / crop.sh

  return {
    ...person,
    x: clampNumber(x, 0, 0, 1),
    y: clampNumber(y, 0, 0, 1),
    width: clampNumber(width, 0, 0, 1),
    height: clampNumber(height, 0, 0, 1)
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function mapViewportPersonToWorld(person, backgroundPlate) {
  const centerX = person.x + person.width / 2
  const footY = person.y + person.height
  const heightRatio = person.height
  const horizon = backgroundPlate?.horizon ?? 0.55
  const depth = backgroundPlate?.depth ?? 1
  const strength = backgroundPlate?.alignStrength ?? 0.85

  const groundT = clampNumber((footY - horizon) / Math.max(0.12, 1 - horizon), 0.5, 0, 1)
  const easedGroundT = Math.pow(groundT, 0.78)
  const oldX = (centerX - 0.5) * 10
  const oldZ = 1.2 - (1 - footY) * 9.5
  const oldScale = 0.45 + heightRatio * 2.25
  const xSpan = lerp(16.5, 5.5, easedGroundT) * depth
  const nextX = (centerX - 0.5) * xSpan
  const nextZ = lerp(-11.5 * depth, 2.1, easedGroundT)
  const expectedHeight = lerp(0.12, 0.46, easedGroundT)
  const nextScale = (heightRatio / Math.max(0.08, expectedHeight)) * lerp(0.82, 1.18, easedGroundT)

  return {
    x: Number(lerp(oldX, nextX, strength).toFixed(2)),
    z: Number(lerp(oldZ, nextZ, strength).toFixed(2)),
    scale: Number(clampNumber(lerp(oldScale, nextScale, strength), 1, 0.45, 2.3).toFixed(2))
  }
}

function loadImageElement(src): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to load background plate'))
    image.src = src
  })
}

function imagePathToVisionDataUrl(path, maxSize = 1280) {
  return loadImageElement(getXingheMediaSrc(path)).then((image) => {
    const sourceWidth = image.naturalWidth || image.width || 1
    const sourceHeight = image.naturalHeight || image.height || 1
    const scale = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight))
    const width = Math.max(1, Math.round(sourceWidth * scale))
    const height = Math.max(1, Math.round(sourceHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return ''
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', 0.86)
  })
}

function extractJsonObject(text) {
  if (!text || typeof text !== 'string') return null
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const source = fenced?.[1] || text
  const start = source.indexOf('{')
  const end = source.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(source.slice(start, end + 1))
  } catch {
    return null
  }
}

function sanitizeDetectedPeople(rawPeople) {
  if (!Array.isArray(rawPeople)) return []

  return rawPeople
    .map((person, index) => {
      const x = clampNumber(person?.x, 0, 0, 1)
      const y = clampNumber(person?.y, 0, 0, 1)
      const width = clampNumber(person?.width, 0, 0, 1 - x)
      const height = clampNumber(person?.height, 0, 0, 1 - y)
      const gender = String(person?.gender || '').toLowerCase()
      return {
        id: `detected_${index}`,
        x,
        y,
        width,
        height,
        gender: gender === 'female' || gender === 'male' ? gender : 'unknown',
        confidence: clampNumber(person?.confidence, 0.6, 0, 1)
      }
    })
    .filter((person) => person.width >= 0.025 && person.height >= 0.06)
    .sort((a, b) => a.y + a.height - (b.y + b.height))
}

async function captureCanvasFrame(canvas, directorState) {
  const backgroundPlate = directorState?.backgroundPlate || null
  const frameRatio = directorState?.frameRatio || 'free'
  const compositeCanvas = document.createElement('canvas')
  compositeCanvas.width = canvas.width
  compositeCanvas.height = canvas.height
  const compositeContext = compositeCanvas.getContext('2d')

  if (!compositeContext) {
    return canvas.toDataURL('image/png')
  }

  compositeContext.clearRect(0, 0, compositeCanvas.width, compositeCanvas.height)

  if (backgroundPlate?.path && backgroundPlate.mode !== 'panorama') {
    try {
      const image = await loadImageElement(getXingheMediaSrc(backgroundPlate.path))
      const position = getPlateObjectPosition(backgroundPlate, directorState?.camera)
      const crop = computeCoverSourceRect(
        compositeCanvas.width,
        compositeCanvas.height,
        backgroundPlate.width || image.naturalWidth,
        backgroundPlate.height || image.naturalHeight,
        position
      )
      compositeContext.globalAlpha = backgroundPlate.opacity ?? 0.82
      compositeContext.drawImage(
        image,
        crop.sx,
        crop.sy,
        crop.sw,
        crop.sh,
        0,
        0,
        compositeCanvas.width,
        compositeCanvas.height
      )
      compositeContext.globalAlpha = 1
    } catch (error) {
      console.warn('导演台底图合成失败:', error)
    }
  } else {
    compositeContext.fillStyle = '#17233d'
    compositeContext.fillRect(0, 0, compositeCanvas.width, compositeCanvas.height)
  }

  compositeContext.drawImage(canvas, 0, 0)

  const ratio = getDirectorFrameRatioValue(frameRatio)
  if (!ratio) {
    return compositeCanvas.toDataURL('image/png')
  }

  const rect = computeFrameRect(compositeCanvas.width, compositeCanvas.height, frameRatio)
  const cropWidth = Math.max(1, Math.round(rect.width))
  const cropHeight = Math.max(1, Math.round(rect.height))
  const cropLeft = Math.max(0, Math.round(rect.left))
  const cropTop = Math.max(0, Math.round(rect.top))
  const outputCanvas = document.createElement('canvas')
  outputCanvas.width = cropWidth
  outputCanvas.height = cropHeight

  const context = outputCanvas.getContext('2d')
  if (!context) {
    return canvas.toDataURL('image/png')
  }

  context.imageSmoothingEnabled = true
  context.drawImage(
    compositeCanvas,
    cropLeft,
    cropTop,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight
  )

  return outputCanvas.toDataURL('image/png')
}

function rotateOffset(offset, radians) {
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return {
    x: offset.x * cos - offset.z * sin,
    y: offset.y,
    z: offset.x * sin + offset.z * cos
  }
}

function DirectorCameraSync({ directorState, controlsRef }) {
  const { camera } = useThree()

  useEffect(() => {
    const isBound = Boolean(
      directorState.camera.followCharacterId && directorState.camera.bindMode !== 'none'
    )
    const followCharacter = isBound
      ? directorState.characters.find(
          (char) => char.id === directorState.camera.followCharacterId
        ) || null
      : null
    const offsetPreset = getDirectorCameraOffsetPresetConfig(directorState.camera.offsetPreset)
    const focusOffset = followCharacter
      ? rotateOffset(offsetPreset.focusOffset, followCharacter.rotation)
      : { x: 0, y: 1.15, z: 0 }
    const focusTarget = {
      x: (followCharacter?.x || 0) + focusOffset.x,
      y: (followCharacter ? 1.05 * followCharacter.scale : 0) + focusOffset.y,
      z: (followCharacter?.z || 0) + focusOffset.z
    }

    const elevation = (directorState.camera.elevation * Math.PI) / 180
    const azimuth = (directorState.camera.azimuth * Math.PI) / 180
    const radius = directorState.camera.distance
    const orbitVector = {
      x: radius * Math.sin(azimuth) * Math.cos(elevation),
      y: radius * Math.sin(elevation),
      z: radius * Math.cos(azimuth) * Math.cos(elevation)
    }

    let x = focusTarget.x + orbitVector.x
    let y = focusTarget.y + orbitVector.y
    let z = focusTarget.z + orbitVector.z

    if (followCharacter && directorState.camera.bindMode === 'follow') {
      const distanceScale = directorState.camera.distance / 5
      const followOffset = rotateOffset(
        {
          x: offsetPreset.cameraOffset.x * distanceScale,
          y: offsetPreset.cameraOffset.y + (directorState.camera.elevation - 22) * 0.03,
          z: offsetPreset.cameraOffset.z * distanceScale
        },
        followCharacter.rotation
      )
      x = followCharacter.x + followOffset.x
      y = followOffset.y
      z = followCharacter.z + followOffset.z
    } else if (followCharacter && directorState.camera.bindMode === 'look-at') {
      const subtleOffset = rotateOffset(
        {
          x: offsetPreset.cameraOffset.x * 0.18,
          y: (offsetPreset.cameraOffset.y - 1.4) * 0.35,
          z: offsetPreset.cameraOffset.z * 0.14
        },
        followCharacter.rotation
      )
      x += subtleOffset.x
      y += subtleOffset.y
      z += subtleOffset.z
    }

    const perspectiveCamera = camera as PerspectiveCamera
    perspectiveCamera.position.set(x, y, z)
    perspectiveCamera.fov = directorState.camera.fov
    perspectiveCamera.lookAt(focusTarget.x, focusTarget.y, focusTarget.z)
    perspectiveCamera.updateProjectionMatrix()

    if (controlsRef.current) {
      controlsRef.current.target.set(focusTarget.x, focusTarget.y, focusTarget.z)
      controlsRef.current.update()
    }
  }, [camera, controlsRef, directorState])

  return null
}

function getPanoramaProjection(backgroundPlate) {
  const ratio =
    backgroundPlate?.width && backgroundPlate?.height
      ? backgroundPlate.width / backgroundPlate.height
      : 2

  if (ratio >= 1.85 && ratio <= 2.15) {
    return { type: 'sphere', ratio }
  }

  return {
    type: 'cylinder',
    ratio,
    height: clampNumber((2 * Math.PI * 85) / Math.max(1.2, ratio), 120, 72, 190)
  }
}

function PanoramaEnvironment({ backgroundPlate }) {
  const texture = useLoader(TextureLoader, getXingheMediaSrc(backgroundPlate.path)) as any
  const projection = useMemo(() => getPanoramaProjection(backgroundPlate), [backgroundPlate])

  useEffect(() => {
    texture.colorSpace = SRGBColorSpace
    texture.needsUpdate = true
  }, [texture])

  if (projection.type === 'cylinder') {
    return (
      <mesh
        position={[0, 0.8, 0]}
        scale={[-1, 1, 1]}
        rotation={[0, Math.PI, 0]}
        raycast={() => null}
      >
        <cylinderGeometry args={[85, 85, projection.height, 128, 1, true]} />
        <meshBasicMaterial
          map={texture}
          side={BackSide}
          transparent
          opacity={backgroundPlate.opacity ?? 1}
          depthWrite={false}
        />
      </mesh>
    )
  }

  return (
    <mesh scale={[-1, 1, 1]} rotation={[0, Math.PI, 0]} raycast={() => null}>
      <sphereGeometry args={[85, 96, 48]} />
      <meshBasicMaterial
        map={texture}
        side={BackSide}
        transparent
        opacity={backgroundPlate.opacity ?? 1}
        depthWrite={false}
      />
    </mesh>
  )
}

function CanvasClearSync({ hasViewportPlate }) {
  const { gl } = useThree()

  useEffect(() => {
    gl.setClearColor(hasViewportPlate ? '#000000' : '#17233d', hasViewportPlate ? 0 : 1)
    gl.setClearAlpha(hasViewportPlate ? 0 : 1)
  }, [gl, hasViewportPlate])

  return null
}

function CompositionLines({ composition }) {
  const lineClass = 'absolute bg-white/45 shadow-[0_0_8px_rgba(255,255,255,0.15)]'

  if (composition === 'center') {
    return (
      <>
        <div className={`${lineClass} left-1/2 top-0 h-full w-px -translate-x-1/2`} />
        <div className={`${lineClass} left-0 top-1/2 h-px w-full -translate-y-1/2`} />
      </>
    )
  }

  if (composition === 'rule-of-thirds') {
    return (
      <>
        <div className={`${lineClass} left-[33.333%] top-0 h-full w-px`} />
        <div className={`${lineClass} left-[66.666%] top-0 h-full w-px`} />
        <div className={`${lineClass} left-0 top-[33.333%] h-px w-full`} />
        <div className={`${lineClass} left-0 top-[66.666%] h-px w-full`} />
      </>
    )
  }

  if (composition === 'golden') {
    return (
      <>
        <div className={`${lineClass} left-[38.2%] top-0 h-full w-px`} />
        <div className={`${lineClass} left-[61.8%] top-0 h-full w-px`} />
        <div className={`${lineClass} left-0 top-[38.2%] h-px w-full`} />
        <div className={`${lineClass} left-0 top-[61.8%] h-px w-full`} />
      </>
    )
  }

  return null
}

function FrameOverlay({ frameRatio, composition, viewportSize, bindingLabel }) {
  const frameRect = useMemo(
    () => computeFrameRect(viewportSize.width, viewportSize.height, frameRatio),
    [frameRatio, viewportSize.height, viewportSize.width]
  )

  if (!viewportSize.width || !viewportSize.height) return null

  const showAspectFrame = Boolean(frameRect.ratio)

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div
        className={`absolute overflow-hidden rounded-[28px] ${
          showAspectFrame
            ? 'border border-white/70 bg-white/[0.02]'
            : 'border border-white/15 bg-transparent'
        }`}
        style={{
          left: `${frameRect.left}px`,
          top: `${frameRect.top}px`,
          width: `${frameRect.width}px`,
          height: `${frameRect.height}px`,
          boxShadow: showAspectFrame ? '0 0 0 9999px rgba(5, 11, 24, 0.22)' : 'none'
        }}
      >
        <CompositionLines composition={composition} />
        <div className="absolute left-4 top-4 rounded-full border border-white/15 bg-black/35 px-3 py-1 text-[11px] font-medium text-white/80 backdrop-blur-sm">
          {showAspectFrame ? frameRatio : '自由画幅'}
        </div>
        {bindingLabel && (
          <div className="absolute right-4 top-4 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-[11px] font-medium text-cyan-100 backdrop-blur-sm">
            {bindingLabel}
          </div>
        )}
      </div>
    </div>
  )
}

const CHARACTER_SLIDERS = [
  { key: 'x', label: 'X', min: -15, max: 15, step: 0.1 },
  { key: 'z', label: 'Z', min: -20, max: 5, step: 0.1 },
  { key: 'rotation', label: '朝向', min: -Math.PI, max: Math.PI, step: 0.05 },
  { key: 'scale', label: '大小', min: 0.55, max: 1.8, step: 0.01 }
]

const CAMERA_VIEW_PRESETS = [
  {
    id: 'front-medium',
    label: '正面中景',
    camera: { distance: 5, elevation: 18, azimuth: 0, fov: 56 }
  },
  {
    id: 'front-close',
    label: '正面特写',
    camera: { distance: 2.8, elevation: 10, azimuth: 0, fov: 42 }
  },
  {
    id: 'front-wide',
    label: '正面全景',
    camera: { distance: 9.5, elevation: 22, azimuth: 0, fov: 64 }
  },
  {
    id: 'side-follow',
    label: '侧面跟拍',
    camera: { distance: 5.2, elevation: 14, azimuth: 76, fov: 56 }
  },
  {
    id: 'side-close',
    label: '侧面近景',
    camera: { distance: 3.2, elevation: 10, azimuth: 90, fov: 48 }
  },
  { id: 'overhead', label: '俯拍', camera: { distance: 12, elevation: 62, azimuth: 35, fov: 70 } }
]

const SCENE_ASSET_SLIDERS = [
  { key: 'x', label: 'X', min: -18, max: 18, step: 0.1 },
  { key: 'z', label: 'Z', min: -24, max: 8, step: 0.1 },
  { key: 'rotation', label: '朝向', min: -Math.PI, max: Math.PI, step: 0.05 },
  { key: 'scale', label: '大小', min: 0.35, max: 4, step: 0.01 }
]

function SceneAssetModel({ asset, selected = false }) {
  const baseColor = asset.color || '#8aa0bd'
  const darkColor = '#1f2937'
  const lightColor = '#dbeafe'
  const accentColor = selected ? '#67e8f9' : '#93c5fd'

  const selectionRing = (
    <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.72, 0.78, 36]} />
      <meshBasicMaterial color={accentColor} transparent opacity={selected ? 0.9 : 0.18} />
    </mesh>
  )

  const material = (color = baseColor, roughness = 0.88) => (
    <meshStandardMaterial color={color} flatShading roughness={roughness} />
  )

  let body = null

  if (asset.preset === 'wall') {
    body = (
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[2.3, 2, 0.16]} />
        {material(baseColor)}
      </mesh>
    )
  } else if (asset.preset === 'door') {
    body = (
      <>
        <mesh position={[0, 1, 0]}>
          <boxGeometry args={[1.15, 2, 0.14]} />
          {material('#7c4a2d')}
        </mesh>
        <mesh position={[0.33, 1, 0.09]}>
          <sphereGeometry args={[0.045, 8, 8]} />
          {material('#f3c969', 0.72)}
        </mesh>
      </>
    )
  } else if (asset.preset === 'window') {
    body = (
      <>
        <mesh position={[0, 1.25, 0]}>
          <boxGeometry args={[1.55, 1.1, 0.08]} />
          {material('#9cc9e6', 0.42)}
        </mesh>
        <mesh position={[0, 1.25, 0.07]}>
          <boxGeometry args={[1.72, 0.08, 0.12]} />
          {material(darkColor)}
        </mesh>
        <mesh position={[0, 1.25, 0.08]}>
          <boxGeometry args={[0.08, 1.22, 0.12]} />
          {material(darkColor)}
        </mesh>
      </>
    )
  } else if (asset.preset === 'table') {
    body = (
      <>
        <mesh position={[0, 0.72, 0]}>
          <boxGeometry args={[1.35, 0.12, 0.78]} />
          {material('#9a6b42')}
        </mesh>
        {[-0.52, 0.52].map((x) =>
          [-0.26, 0.26].map((z) => (
            <mesh key={`${x}-${z}`} position={[x, 0.35, z]}>
              <boxGeometry args={[0.08, 0.66, 0.08]} />
              {material('#6b4328')}
            </mesh>
          ))
        )}
      </>
    )
  } else if (asset.preset === 'chair') {
    body = (
      <>
        <mesh position={[0, 0.48, 0]}>
          <boxGeometry args={[0.56, 0.1, 0.5]} />
          {material('#8b5a34')}
        </mesh>
        <mesh position={[0, 0.86, -0.22]}>
          <boxGeometry args={[0.58, 0.72, 0.08]} />
          {material('#704626')}
        </mesh>
        {[-0.2, 0.2].map((x) =>
          [-0.16, 0.16].map((z) => (
            <mesh key={`${x}-${z}`} position={[x, 0.22, z]}>
              <boxGeometry args={[0.06, 0.42, 0.06]} />
              {material('#57351f')}
            </mesh>
          ))
        )}
      </>
    )
  } else if (asset.preset === 'sofa') {
    body = (
      <>
        <mesh position={[0, 0.45, 0]}>
          <boxGeometry args={[1.55, 0.36, 0.72]} />
          {material(baseColor)}
        </mesh>
        <mesh position={[0, 0.85, -0.28]}>
          <boxGeometry args={[1.65, 0.7, 0.22]} />
          {material(baseColor)}
        </mesh>
        <mesh position={[-0.88, 0.62, 0]}>
          <boxGeometry args={[0.18, 0.52, 0.75]} />
          {material(baseColor)}
        </mesh>
        <mesh position={[0.88, 0.62, 0]}>
          <boxGeometry args={[0.18, 0.52, 0.75]} />
          {material(baseColor)}
        </mesh>
      </>
    )
  } else if (asset.preset === 'bed') {
    body = (
      <>
        <mesh position={[0, 0.36, 0]}>
          <boxGeometry args={[1.45, 0.26, 2]} />
          {material('#dbeafe')}
        </mesh>
        <mesh position={[0, 0.58, -0.72]}>
          <boxGeometry args={[1.35, 0.18, 0.42]} />
          {material(lightColor)}
        </mesh>
        <mesh position={[0, 0.72, 0.92]}>
          <boxGeometry args={[1.5, 0.72, 0.12]} />
          {material('#475569')}
        </mesh>
      </>
    )
  } else if (asset.preset === 'stairs') {
    body = (
      <>
        {[0, 1, 2].map((index) => (
          <mesh key={index} position={[0, 0.13 + index * 0.18, -0.36 + index * 0.32]}>
            <boxGeometry args={[1.45, 0.22, 0.34]} />
            {material('#76849a')}
          </mesh>
        ))}
      </>
    )
  } else if (asset.preset === 'street-lamp') {
    body = (
      <>
        <mesh position={[0, 1.05, 0]}>
          <cylinderGeometry args={[0.035, 0.045, 2.1, 8]} />
          {material('#1f2937')}
        </mesh>
        <mesh position={[0, 2.18, 0]}>
          <boxGeometry args={[0.34, 0.22, 0.34]} />
          {material('#fef3c7', 0.45)}
        </mesh>
      </>
    )
  } else if (asset.preset === 'tree') {
    body = (
      <>
        <mesh position={[0, 0.75, 0]}>
          <cylinderGeometry args={[0.1, 0.14, 1.5, 7]} />
          {material('#6b4423')}
        </mesh>
        <mesh position={[0, 1.65, 0]}>
          <sphereGeometry args={[0.55, 8, 8]} />
          {material('#4d8a55')}
        </mesh>
        <mesh position={[0.28, 1.45, -0.08]}>
          <sphereGeometry args={[0.38, 8, 8]} />
          {material('#3f7f4c')}
        </mesh>
      </>
    )
  } else if (asset.preset === 'rock') {
    body = (
      <>
        <mesh position={[-0.22, 0.18, 0]} rotation={[0.2, 0.1, -0.1]}>
          <dodecahedronGeometry args={[0.28, 0]} />
          {material('#7b8494')}
        </mesh>
        <mesh position={[0.18, 0.14, 0.08]} rotation={[0.1, -0.2, 0.24]}>
          <dodecahedronGeometry args={[0.22, 0]} />
          {material('#687386')}
        </mesh>
      </>
    )
  } else if (asset.preset === 'car-block') {
    body = (
      <>
        <mesh position={[0, 0.42, 0]}>
          <boxGeometry args={[1.75, 0.42, 0.82]} />
          {material(baseColor)}
        </mesh>
        <mesh position={[0.06, 0.75, -0.02]}>
          <boxGeometry args={[0.92, 0.32, 0.68]} />
          {material('#93c5fd', 0.55)}
        </mesh>
        {[-0.62, 0.62].map((x) =>
          [-0.36, 0.36].map((z) => (
            <mesh key={`${x}-${z}`} position={[x, 0.18, z]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.16, 0.16, 0.08, 10]} />
              {material('#0f172a')}
            </mesh>
          ))
        )}
      </>
    )
  }

  return (
    <group position={[asset.x, 0, asset.z]} rotation={[0, asset.rotation, 0]} scale={asset.scale}>
      {selectionRing}
      {body}
    </group>
  )
}

export default function Director3DModal({ nodeId, onClose, onSnapshotSaved }) {
  const [selectedId, setSelectedId] = useState(null)
  const [selectedAssetId, setSelectedAssetId] = useState(null)
  const [activeBoneControl, setActiveBoneControl] = useState<string>(DIRECTOR_BONE_CONTROLS[0].id)
  const [draggingId, setDraggingId] = useState(null)
  const [boxSelectMode, setBoxSelectMode] = useState(false)
  const [draftPersonBox, setDraftPersonBox] = useState(null)
  const [detectingPeople, setDetectingPeople] = useState(false)
  const [toast, setToast] = useState(null)
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  const canvasRef = useRef(null)
  const stageViewportRef = useRef(null)
  const orbitControlsRef = useRef(null)

  const directorState = useDirectorStore((state) => state.nodes[nodeId] || FALLBACK_DIRECTOR_STATE)
  const addCharacter = useDirectorStore((state) => state.addCharacter)
  const removeCharacter = useDirectorStore((state) => state.removeCharacter)
  const updateCharacter = useDirectorStore((state) => state.updateCharacter)
  const setCharacterPose = useDirectorStore((state) => state.setCharacterPose)
  const setCharacterVariant = useDirectorStore((state) => state.setCharacterVariant)
  const addSceneAsset = useDirectorStore((state) => state.addSceneAsset)
  const removeSceneAsset = useDirectorStore((state) => state.removeSceneAsset)
  const updateSceneAsset = useDirectorStore((state) => state.updateSceneAsset)
  const setSceneAssetPreset = useDirectorStore((state) => state.setSceneAssetPreset)
  const setBackgroundPlate = useDirectorStore((state) => state.setBackgroundPlate)
  const clearBackgroundPlate = useDirectorStore((state) => state.clearBackgroundPlate)
  const setCamera = useDirectorStore((state) => state.setCamera)
  const setCameraFollow = useDirectorStore((state) => state.setCameraFollow)
  const setCameraBindingMode = useDirectorStore((state) => state.setCameraBindingMode)
  const setCameraOffsetPreset = useDirectorStore((state) => state.setCameraOffsetPreset)
  const setShotType = useDirectorStore((state) => state.setShotType)
  const setComposition = useDirectorStore((state) => state.setComposition)
  const setFrameRatio = useDirectorStore((state) => state.setFrameRatio)
  const setFormation = useDirectorStore((state) => state.setFormation)
  const applyFormation = useDirectorStore((state) => state.applyFormation)
  const resetNode = useDirectorStore((state) => state.resetNode)
  const apiConfigs = useAppStore((state) => state.apiConfigs || [])
  const globalApiKey = useAppStore((state) => state.globalApiKey || '')
  const groupApiKeys = useAppStore((state) => state.groupApiKeys || {})

  const prompt = useMemo(() => buildDirectorPrompt(directorState), [directorState])
  const selectedCharacter = useMemo(
    () => directorState.characters.find((item) => item.id === selectedId) || null,
    [directorState.characters, selectedId]
  )
  const selectedSceneAsset = useMemo(
    () => directorState.sceneAssets.find((item) => item.id === selectedAssetId) || null,
    [directorState.sceneAssets, selectedAssetId]
  )
  const followCharacter = useMemo(
    () =>
      directorState.camera.followCharacterId
        ? directorState.characters.find(
            (char) => char.id === directorState.camera.followCharacterId
          ) || null
        : null,
    [directorState.camera.followCharacterId, directorState.characters]
  )
  const selectedBoneControl = useMemo(
    () =>
      DIRECTOR_BONE_CONTROLS.find((control) => control.id === activeBoneControl) ||
      DIRECTOR_BONE_CONTROLS[0],
    [activeBoneControl]
  )
  const selectedBoneRotation = selectedCharacter?.boneAdjustments?.[selectedBoneControl.id] || {}
  const backgroundPlate = directorState.backgroundPlate
  const backgroundImageSrc = backgroundPlate?.path ? getXingheMediaSrc(backgroundPlate.path) : ''
  const backgroundRect = useMemo(
    () =>
      backgroundPlate
        ? {
            left: 0,
            top: 0,
            width: viewportSize.width,
            height: viewportSize.height
          }
        : null,
    [backgroundPlate, viewportSize.height, viewportSize.width]
  )
  const backgroundObjectPosition = useMemo(() => {
    const position = getPlateObjectPosition(backgroundPlate, directorState.camera)
    return `${Math.round(position.x * 100)}% ${Math.round(position.y * 100)}%`
  }, [backgroundPlate, directorState.camera])
  const backgroundModeLabel = useMemo(
    () =>
      DIRECTOR_BACKGROUND_MODES.find((item) => item.id === backgroundPlate?.mode)?.label ||
      '视口图',
    [backgroundPlate?.mode]
  )
  const backgroundProjectionLabel = useMemo(() => {
    if (!backgroundPlate || backgroundPlate.mode !== 'panorama') return ''
    const projection = getPanoramaProjection(backgroundPlate)
    return projection.type === 'sphere' ? '球幕' : '环幕'
  }, [backgroundPlate])
  const cameraBindingLabel = useMemo(() => {
    if (!followCharacter || directorState.camera.bindMode === 'none') return null
    const modeLabel =
      DIRECTOR_CAMERA_BIND_MODES.find((item) => item.id === directorState.camera.bindMode)?.label ||
      '绑定'
    const presetLabel =
      DIRECTOR_CAMERA_OFFSET_PRESETS.find((item) => item.id === directorState.camera.offsetPreset)
        ?.label || '居中跟拍'
    return `${modeLabel} · ${followCharacter.label} · ${presetLabel}`
  }, [directorState.camera.bindMode, directorState.camera.offsetPreset, followCharacter])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 1800)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!selectedId) return
    const exists = directorState.characters.some((char) => char.id === selectedId)
    if (!exists) {
      setSelectedId(null)
    }
  }, [directorState.characters, selectedId])

  useEffect(() => {
    if (!selectedAssetId) return
    const exists = directorState.sceneAssets.some((asset) => asset.id === selectedAssetId)
    if (!exists) {
      setSelectedAssetId(null)
    }
  }, [directorState.sceneAssets, selectedAssetId])

  useEffect(() => {
    return () => {
      document.body.style.cursor = ''
    }
  }, [])

  useEffect(() => {
    const element = stageViewportRef.current
    if (!element) return

    const syncSize = () => {
      setViewportSize({
        width: element.clientWidth,
        height: element.clientHeight
      })
    }

    syncSize()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', syncSize)
      return () => window.removeEventListener('resize', syncSize)
    }

    const observer = new ResizeObserver(() => syncSize())
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const handleImportBackgroundPlate = useCallback(async () => {
    try {
      const result = await window.api.localCacheAPI.openFiles({
        filters: [{ name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }],
        multiple: false
      })

      if (!result?.success || !result.paths?.[0]) return

      const path = result.paths[0]
      const dimensions = (await getImageDimensions(path)) as any
      const ratio = dimensions.w && dimensions.h ? dimensions.w / dimensions.h : 1
      const mode = ratio >= 2.4 || ratio >= 16 / 9 ? 'panorama' : 'viewport'
      setBackgroundPlate(nodeId, {
        path,
        width: dimensions.w,
        height: dimensions.h,
        opacity: 0.82,
        mode,
        horizon: mode === 'panorama' ? 0.5 : 0.56,
        depth: mode === 'panorama' ? 1.15 : 1,
        alignStrength: 0.9,
        alignMode: true
      })
      setBoxSelectMode(true)
      setToast(mode === 'panorama' ? '全景底图已导入，拖框标出人物' : '底图已导入，拖框标出人物')
    } catch (error) {
      console.error('导演台导入底图失败:', error)
      setToast('导入底图失败')
    }
  }, [nodeId, setBackgroundPlate])

  const handleClearBackgroundPlate = useCallback(() => {
    clearBackgroundPlate(nodeId)
    setBoxSelectMode(false)
    setDraftPersonBox(null)
  }, [clearBackgroundPlate, nodeId])

  const getBackgroundPoint = useCallback(
    (event) => {
      if (!backgroundRect || !stageViewportRef.current) return null
      const rect = stageViewportRef.current.getBoundingClientRect()
      const x = event.clientX - rect.left - backgroundRect.left
      const y = event.clientY - rect.top - backgroundRect.top
      return {
        x: Math.min(backgroundRect.width, Math.max(0, x)),
        y: Math.min(backgroundRect.height, Math.max(0, y))
      }
    },
    [backgroundRect]
  )

  const addCharacterFromImageBox = useCallback(
    (box) => {
      if (!backgroundRect || box.width < 18 || box.height < 28) return

      const characterId = addCharacter(nodeId)
      if (!characterId) return
      const world = mapViewportPersonToWorld(
        {
          x: box.x / backgroundRect.width,
          y: box.y / backgroundRect.height,
          width: box.width / backgroundRect.width,
          height: box.height / backgroundRect.height
        },
        backgroundPlate
      )

      updateCharacter(nodeId, characterId, {
        ...world
      })
      setSelectedId(characterId)
      setSelectedAssetId(null)
      setToast('已按底图位置生成角色')
    },
    [addCharacter, backgroundPlate, backgroundRect, nodeId, updateCharacter]
  )

  const addCharactersFromDetectedPeople = useCallback(
    (people) => {
      if (!people.length) return 0

      let lastCharacterId = null
      people.forEach((person, index) => {
        const characterId = addCharacter(nodeId)
        if (!characterId) return
        lastCharacterId = characterId

        const viewportPerson = imagePersonToViewportPerson(
          person,
          backgroundPlate,
          viewportSize.width,
          viewportSize.height,
          directorState.camera
        )
        const world = mapViewportPersonToWorld(viewportPerson, backgroundPlate)
        const variant =
          person.gender === 'female'
            ? 'female-casual'
            : person.gender === 'male'
              ? 'male-casual'
              : index % 2 === 0
                ? 'male-casual'
                : 'female-casual'

        updateCharacter(nodeId, characterId, {
          ...world,
          variant
        })
      })

      if (lastCharacterId) {
        setSelectedId(lastCharacterId)
        setSelectedAssetId(null)
      }

      return people.length
    },
    [addCharacter, backgroundPlate, directorState.camera, nodeId, updateCharacter, viewportSize]
  )

  const handleAutoDetectPeople = useCallback(async () => {
    if (!backgroundPlate?.path) {
      setToast('先导入底图')
      return
    }

    const chatModels = (apiConfigs || []).filter((config) => config.type === 'Chat')
    const preferredModel =
      chatModels.find((config) =>
        /gemini|gpt|vision|multi|omni/i.test(`${config.modelName || ''} ${config.provider || ''}`)
      ) || chatModels[0]

    if (!preferredModel) {
      setToast('没有可用 Chat 模型，先用框选人物')
      setBoxSelectMode(true)
      return
    }

    const apiKey = preferredModel.key || groupApiKeys?.Chat || globalApiKey
    if (!apiKey) {
      setToast('未配置 Chat API Key，先用框选人物')
      setBoxSelectMode(true)
      return
    }

    setDetectingPeople(true)
    try {
      const dataUrl = await imagePathToVisionDataUrl(backgroundPlate.path)
      if (!dataUrl) throw new Error('底图读取失败')

      const baseUrl = (preferredModel.url || DEFAULT_BASE_URL).replace(/\/+$/, '')
      const response = await apiClient(
        '/v1/chat/completions',
        {
          method: 'POST',
          body: JSON.stringify({
            model: preferredModel.modelName || preferredModel.id || 'gpt-4o',
            temperature: 0,
            messages: [
              {
                role: 'system',
                content:
                  'You detect full human bodies in an image for a 3D blocking tool. Return strict JSON only.'
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Find every visible person. Return only JSON in this exact shape: {"people":[{"x":0,"y":0,"width":0,"height":0,"gender":"male|female|unknown","confidence":0.0}]}. Coordinates are normalized 0-1 relative to the full image. Use the full visible body bounding box, including head and feet when visible. If only part of a person is visible, still include the visible body box.'
                  },
                  {
                    type: 'image_url',
                    image_url: { url: dataUrl }
                  }
                ]
              }
            ]
          })
        },
        { baseUrl, apiKey }
      )

      const content = response?.choices?.[0]?.message?.content || ''
      const parsed = extractJsonObject(content)
      const people = sanitizeDetectedPeople(parsed?.people)

      if (!people.length) {
        setToast('没识别到人物，改用框选')
        setBoxSelectMode(true)
        return
      }

      const count = addCharactersFromDetectedPeople(people)
      setBoxSelectMode(false)
      setToast(`已识别 ${count} 个人物`)
    } catch (error) {
      console.error('导演台自动识别人物失败:', error)
      setToast('自动识别失败，改用框选')
      setBoxSelectMode(true)
    } finally {
      setDetectingPeople(false)
    }
  }, [
    addCharactersFromDetectedPeople,
    apiConfigs,
    backgroundPlate?.path,
    globalApiKey,
    groupApiKeys?.Chat
  ])

  const handlePlatePointerDown = useCallback(
    (event) => {
      if (!boxSelectMode || !backgroundRect) return
      event.preventDefault()
      event.stopPropagation()
      const point = getBackgroundPoint(event)
      if (!point) return
      setDraftPersonBox({
        startX: point.x,
        startY: point.y,
        x: point.x,
        y: point.y,
        width: 0,
        height: 0
      })
    },
    [backgroundRect, boxSelectMode, getBackgroundPoint]
  )

  const handlePlatePointerMove = useCallback(
    (event) => {
      if (!boxSelectMode || !draftPersonBox) return
      event.preventDefault()
      event.stopPropagation()
      const point = getBackgroundPoint(event)
      if (!point) return
      const x = Math.min(draftPersonBox.startX, point.x)
      const y = Math.min(draftPersonBox.startY, point.y)
      setDraftPersonBox({
        ...draftPersonBox,
        x,
        y,
        width: Math.abs(point.x - draftPersonBox.startX),
        height: Math.abs(point.y - draftPersonBox.startY)
      })
    },
    [boxSelectMode, draftPersonBox, getBackgroundPoint]
  )

  const handlePlatePointerUp = useCallback(
    (event) => {
      if (!boxSelectMode || !draftPersonBox) return
      event.preventDefault()
      event.stopPropagation()
      addCharacterFromImageBox(draftPersonBox)
      setDraftPersonBox(null)
    },
    [addCharacterFromImageBox, boxSelectMode, draftPersonBox]
  )

  const captureDataUrl = useCallback(async () => {
    const canvas = canvasRef.current?.querySelector('canvas')
    if (!canvas) return null
    return captureCanvasFrame(canvas, directorState)
  }, [directorState])

  const persistSnapshot = useCallback(async () => {
    const dataUrl = await captureDataUrl()
    if (!dataUrl) {
      setToast('快照失败')
      return null
    }

    const path = await saveDataUrlToLocalCache(dataUrl, {
      idPrefix: 'director',
      category: 'director_snapshot',
      ext: '.png',
      type: 'image'
    })

    onSnapshotSaved?.(path)
    return { dataUrl, path }
  }, [captureDataUrl, onSnapshotSaved])

  const handleSnapshot = useCallback(async () => {
    try {
      const result = await persistSnapshot()
      if (!result?.path) return
      setToast('快照已保存')
    } catch (error) {
      console.error('导演台快照失败:', error)
      setToast('快照失败')
    }
  }, [persistSnapshot])

  const handleAddToAssets = useCallback(async () => {
    try {
      const result = await persistSnapshot()
      if (!result?.path) return

      const assetResult = addAssetToLibrary({
        category: 'scenes',
        path: result.path,
        name: `director_snapshot_${Date.now()}.png`
      })

      if (!assetResult?.success) {
        throw new Error(assetResult?.error || '加入资产库失败')
      }

      useAppStore.getState().setAssetLibraryOpen?.(true)
      setToast('已加入资产库')
    } catch (error) {
      console.error('导演台快照加入资产库失败:', error)
      setToast('加入资产库失败')
    }
  }, [persistSnapshot])

  const handleAddToReference = useCallback(async () => {
    try {
      const result = await persistSnapshot()
      if (!result?.path) return

      const targetNodeId = findBestReferenceTargetNodeId(nodeId)
      if (!targetNodeId) {
        await copyImagePathToClipboard(result.path)
        setToast('没找到下游生图节点，已复制到剪贴板')
        return
      }

      const refResult = await addImagePathToReferenceNode(targetNodeId, result.path)
      if (!refResult?.success) {
        throw new Error(refResult?.error || '加入参考图失败')
      }

      setToast('已加入参考图')
    } catch (error) {
      console.error('导演台快照加入参考图失败:', error)
      setToast('加入参考图失败')
    }
  }, [nodeId, persistSnapshot])

  const stopDraggingCharacter = useCallback(() => {
    if (!draggingId) return
    setDraggingId(null)
    document.body.style.cursor = ''
  }, [draggingId])

  const handleCharacterPointerDown = useCallback((event, characterId) => {
    event.stopPropagation()
    setSelectedId(characterId)
    setSelectedAssetId(null)
    setDraggingId(characterId)
    document.body.style.cursor = 'grabbing'
  }, [])

  const handleStagePointerMove = useCallback(
    (event) => {
      if (!draggingId) return
      event.stopPropagation()
      if (backgroundPlate?.alignMode && stageViewportRef.current) {
        const rect = stageViewportRef.current.getBoundingClientRect()
        const clientX = event.nativeEvent?.clientX ?? event.clientX
        const clientY = event.nativeEvent?.clientY ?? event.clientY
        const character = directorState.characters.find((item) => item.id === draggingId)
        if (Number.isFinite(clientX) && Number.isFinite(clientY) && character) {
          const footX = clampNumber((clientX - rect.left) / Math.max(1, rect.width), 0.5, 0, 1)
          const footY = clampNumber((clientY - rect.top) / Math.max(1, rect.height), 0.7, 0, 1)
          const height = clampNumber(character.scale * 0.28, 0.26, 0.08, 0.58)
          const world = mapViewportPersonToWorld(
            {
              x: clampNumber(footX - 0.03, 0, 0, 1),
              y: clampNumber(footY - height, 0, 0, 1),
              width: 0.06,
              height
            },
            backgroundPlate
          )
          updateCharacter(nodeId, draggingId, {
            x: world.x,
            z: world.z
          })
          return
        }
      }
      updateCharacter(nodeId, draggingId, {
        x: Number(event.point.x.toFixed(2)),
        z: Number(event.point.z.toFixed(2))
      })
    },
    [backgroundPlate, directorState.characters, draggingId, nodeId, updateCharacter]
  )

  const handleSliderChange = useCallback(
    (key, rawValue) => {
      if (!selectedCharacter) return
      const nextValue = Number(rawValue)
      updateCharacter(nodeId, selectedCharacter.id, {
        [key]: nextValue
      })
    },
    [nodeId, selectedCharacter, updateCharacter]
  )

  const handleBoneSliderChange = useCallback(
    (axis, rawValue) => {
      if (!selectedCharacter) return

      const currentBoneAdjustments = selectedCharacter.boneAdjustments || {}
      const currentRotation = currentBoneAdjustments[activeBoneControl] || {}
      updateCharacter(nodeId, selectedCharacter.id, {
        boneAdjustments: {
          ...currentBoneAdjustments,
          [activeBoneControl]: {
            ...currentRotation,
            [axis]: Number(rawValue)
          }
        }
      })
    },
    [activeBoneControl, nodeId, selectedCharacter, updateCharacter]
  )

  const resetBoneControl = useCallback(() => {
    if (!selectedCharacter) return

    const nextBoneAdjustments = { ...(selectedCharacter.boneAdjustments || {}) }
    delete nextBoneAdjustments[activeBoneControl]
    updateCharacter(nodeId, selectedCharacter.id, {
      boneAdjustments: nextBoneAdjustments
    })
  }, [activeBoneControl, nodeId, selectedCharacter, updateCharacter])

  const resetAllBoneControls = useCallback(() => {
    if (!selectedCharacter) return
    updateCharacter(nodeId, selectedCharacter.id, {
      boneAdjustments: {}
    })
  }, [nodeId, selectedCharacter, updateCharacter])

  const handleAssetSliderChange = useCallback(
    (key, rawValue) => {
      if (!selectedSceneAsset) return
      updateSceneAsset(nodeId, selectedSceneAsset.id, {
        [key]: Number(rawValue)
      })
    },
    [nodeId, selectedSceneAsset, updateSceneAsset]
  )

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex pointer-events-auto"
      style={{ backgroundColor: 'rgba(7, 11, 23, 0.82)' }}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex min-w-0 flex-1 flex-col px-5 py-4">
        <div className="relative z-20 mb-3 flex shrink-0 items-center justify-between pointer-events-auto">
          <div>
            <div className="text-sm font-semibold text-white">3D 导演台</div>
            <div className="mt-1 text-[11px] text-white/50">
              站位、动作、画幅和机位都能一起预演，快照会按当前画幅输出。
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleImportBackgroundPlate}
              className="rounded-full border border-sky-300/30 bg-sky-300/14 px-3.5 py-1.5 text-xs font-medium text-sky-100 transition-all hover:bg-sky-300/22"
            >
              导入全景/底图
            </button>
            {backgroundPlate && (
              <>
                <button
                  type="button"
                  onClick={handleAutoDetectPeople}
                  disabled={detectingPeople}
                  className="rounded-full border border-emerald-300/35 bg-emerald-300/15 px-3.5 py-1.5 text-xs font-medium text-emerald-50 transition-all hover:bg-emerald-300/22 disabled:cursor-wait disabled:opacity-60"
                >
                  {detectingPeople ? '识别中...' : '自动识别'}
                </button>
                <button
                  type="button"
                  onClick={() => setBoxSelectMode((value) => !value)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all ${
                    boxSelectMode
                      ? 'border-amber-300/35 bg-amber-300/18 text-amber-50'
                      : 'border-white/15 bg-white/10 text-white/75 hover:bg-white/16'
                  }`}
                >
                  框选人物
                </button>
                <button
                  type="button"
                  onClick={handleClearBackgroundPlate}
                  className="rounded-full border border-white/12 bg-white/8 px-3.5 py-1.5 text-xs font-medium text-white/55 transition-all hover:bg-white/14 hover:text-white/75"
                >
                  清底图
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleSnapshot}
              className="rounded-full border border-white/15 bg-white/12 px-3.5 py-1.5 text-xs font-medium text-white/85 transition-all hover:bg-white/20"
            >
              快照
            </button>
            <button
              type="button"
              onClick={handleAddToReference}
              className="rounded-full border border-cyan-400/30 bg-cyan-400/15 px-3.5 py-1.5 text-xs font-medium text-cyan-100 transition-all hover:bg-cyan-400/22"
            >
              参考图
            </button>
            <button
              type="button"
              onClick={handleAddToAssets}
              className="rounded-full border border-emerald-400/35 bg-emerald-400/15 px-3.5 py-1.5 text-xs font-medium text-emerald-100 transition-all hover:bg-emerald-400/22"
            >
              资产库
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-white/15 bg-white/8 px-3.5 py-1.5 text-xs font-medium text-white/75 transition-all hover:bg-white/15"
            >
              关闭
            </button>
          </div>
        </div>

        <div
          ref={stageViewportRef}
          className="relative z-0 min-h-0 flex-1 overflow-hidden rounded-[30px] border border-white/15 bg-gradient-to-br from-[#1a2642] via-[#15203b] to-[#101726] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
        >
          <div ref={canvasRef} className="absolute inset-0">
            {backgroundPlate && backgroundPlate.mode !== 'panorama' && backgroundRect && (
              <div
                className="absolute overflow-hidden bg-black/20"
                style={{
                  left: `${backgroundRect.left}px`,
                  top: `${backgroundRect.top}px`,
                  width: `${backgroundRect.width}px`,
                  height: `${backgroundRect.height}px`
                }}
              >
                <img
                  src={backgroundImageSrc}
                  alt="导演台底图"
                  className="h-full w-full select-none object-cover"
                  draggable={false}
                  style={{
                    opacity: backgroundPlate.opacity,
                    objectPosition: backgroundObjectPosition
                  }}
                />
                <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/15 bg-black/35 px-3 py-1 text-[11px] font-medium text-white/75 backdrop-blur-sm">
                  {backgroundModeLabel}
                </div>
              </div>
            )}
            <FrameOverlay
              frameRatio={directorState.frameRatio}
              composition={directorState.composition}
              viewportSize={viewportSize}
              bindingLabel={cameraBindingLabel}
            />
            <Canvas
              camera={{ position: [0, 2.5, 5], fov: directorState.camera.fov }}
              gl={{ preserveDrawingBuffer: true, alpha: true }}
              style={{ background: 'transparent' }}
              onPointerMissed={() => {
                setSelectedId(null)
                setSelectedAssetId(null)
                stopDraggingCharacter()
              }}
            >
              <CanvasClearSync hasViewportPlate={backgroundPlate?.mode === 'viewport'} />
              {(!backgroundPlate || backgroundPlate.mode === 'panorama') && (
                <color attach="background" args={['#17233d']} />
              )}
              <ambientLight intensity={1.15} />
              <hemisphereLight args={['#dce8ff', '#33415f', 1.15]} />
              <directionalLight position={[6, 10, 6]} intensity={1.45} color="#fff6ea" />
              <directionalLight position={[-5, 5, -3]} intensity={0.8} color="#8fc7ff" />
              <DirectorCameraSync directorState={directorState} controlsRef={orbitControlsRef} />
              {backgroundPlate?.mode === 'panorama' && (
                <Suspense fallback={null}>
                  <PanoramaEnvironment backgroundPlate={backgroundPlate} />
                </Suspense>
              )}

              {backgroundPlate?.mode !== 'viewport' && (
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
                  <planeGeometry args={[120, 120]} />
                  <meshStandardMaterial
                    color="#101a30"
                    roughness={0.98}
                    metalness={0.03}
                    transparent={Boolean(backgroundPlate)}
                    opacity={backgroundPlate?.mode === 'panorama' ? 0.08 : 1}
                    depthWrite={!backgroundPlate}
                  />
                </mesh>
              )}

              <Grid
                args={[40, 40]}
                cellSize={1}
                sectionSize={5}
                fadeDistance={45}
                fadeStrength={1}
                cellColor="#35527d"
                sectionColor="#77b7ff"
                position={[0, 0.002, 0]}
              />

              <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, 0.01, 0]}
                onPointerMove={handleStagePointerMove}
                onPointerUp={stopDraggingCharacter}
              >
                <planeGeometry args={[120, 120]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>

              {directorState.characters.map((character) => (
                <group
                  key={character.id}
                  onClick={(event) => {
                    event.stopPropagation()
                    setSelectedId(character.id)
                    setSelectedAssetId(null)
                  }}
                  onPointerDown={(event) => handleCharacterPointerDown(event, character.id)}
                  onPointerUp={stopDraggingCharacter}
                >
                  <Suspense
                    fallback={
                      <MannequinFallback
                        position={[character.x, 0, character.z]}
                        rotation={[0, character.rotation, 0]}
                        color={character.color}
                        label={character.label}
                        selected={selectedId === character.id}
                        scale={character.scale}
                        variant={character.variant}
                      />
                    }
                  >
                    <Mannequin
                      position={[character.x, 0, character.z]}
                      rotation={[0, character.rotation, 0]}
                      color={character.color}
                      label={character.label}
                      selected={selectedId === character.id}
                      scale={character.scale}
                      pose={character.pose}
                      variant={character.variant}
                      boneAdjustments={character.boneAdjustments}
                    />
                  </Suspense>
                </group>
              ))}

              {directorState.sceneAssets.map((asset) => (
                <group
                  key={asset.id}
                  onClick={(event) => {
                    event.stopPropagation()
                    setSelectedAssetId(asset.id)
                    setSelectedId(null)
                  }}
                >
                  <SceneAssetModel asset={asset} selected={selectedAssetId === asset.id} />
                </group>
              ))}

              <OrbitControls
                ref={orbitControlsRef}
                enabled={!draggingId}
                enableDamping
                dampingFactor={0.07}
                maxPolarAngle={Math.PI * 0.86}
                minPolarAngle={Math.PI * 0.08}
                minDistance={1.5}
                maxDistance={30}
              />
            </Canvas>

            {backgroundPlate && backgroundRect && (
              <div
                className={`absolute z-30 ${
                  boxSelectMode ? 'cursor-crosshair' : 'pointer-events-none'
                }`}
                style={{
                  left: `${backgroundRect.left}px`,
                  top: `${backgroundRect.top}px`,
                  width: `${backgroundRect.width}px`,
                  height: `${backgroundRect.height}px`
                }}
                onPointerDown={handlePlatePointerDown}
                onPointerMove={handlePlatePointerMove}
                onPointerUp={handlePlatePointerUp}
                onPointerCancel={() => setDraftPersonBox(null)}
              >
                {boxSelectMode && (
                  <div className="absolute left-3 top-3 rounded-full border border-amber-200/40 bg-black/45 px-3 py-1 text-[11px] font-medium text-amber-50 backdrop-blur-sm">
                    拖框标出人物，按脚底投到 3D 地面
                  </div>
                )}
                {draftPersonBox && (
                  <div
                    className="absolute border-2 border-amber-200 bg-amber-200/12 shadow-[0_0_0_9999px_rgba(0,0,0,0.12)]"
                    style={{
                      left: `${draftPersonBox.x}px`,
                      top: `${draftPersonBox.y}px`,
                      width: `${draftPersonBox.width}px`,
                      height: `${draftPersonBox.height}px`
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        <div className="relative z-20 mt-3 shrink-0 pointer-events-auto">
          <div className="rounded-2xl border border-white/12 bg-white/[0.06] px-4 py-2.5 backdrop-blur-sm">
            <span className="text-[10px] text-white/45">自动 Prompt: </span>
            <span className="font-mono text-[10px] text-white/78">{prompt}</span>
          </div>
        </div>
      </div>

      <div className="relative z-20 flex w-[340px] flex-col overflow-y-auto border-l border-white/10 bg-[#202c49] px-4 py-4 pointer-events-auto custom-scrollbar">
        <section className="mb-4 rounded-[24px] border border-white/10 bg-white/[0.05] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white/90">全景底图</div>
              <div className="mt-1 text-[11px] text-white/45">
                支持 720 全景或普通视口图，人物会按脚底落到地面。
              </div>
            </div>
            <button
              type="button"
              onClick={handleImportBackgroundPlate}
              className="rounded-full border border-sky-300/25 bg-sky-300/12 px-3 py-1 text-[11px] font-medium text-sky-100 transition-all hover:bg-sky-300/20"
            >
              导入
            </button>
          </div>

          {backgroundPlate ? (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                <img
                  src={backgroundImageSrc}
                  alt="底图预览"
                  className="h-28 w-full object-contain"
                  draggable={false}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-white/45">
                <span>
                  {backgroundModeLabel} · {backgroundPlate.width || 0} x{' '}
                  {backgroundPlate.height || 0}
                  {backgroundProjectionLabel ? ` · ${backgroundProjectionLabel}` : ''}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleAutoDetectPeople}
                    disabled={detectingPeople}
                    className="rounded-full border border-emerald-300/25 bg-emerald-300/12 px-2 py-1 font-medium text-emerald-50 transition-all hover:bg-emerald-300/20 disabled:cursor-wait disabled:opacity-60"
                  >
                    {detectingPeople ? '识别中' : '自动识别'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBoxSelectMode((value) => !value)}
                    className={`rounded-full px-2 py-1 font-medium transition-all ${
                      boxSelectMode
                        ? 'border border-amber-300/35 bg-amber-300/18 text-amber-50'
                        : 'border border-white/10 bg-white/[0.04] text-white/62 hover:bg-white/[0.08]'
                    }`}
                  >
                    框选人物
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {DIRECTOR_BACKGROUND_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() =>
                      setBackgroundPlate(nodeId, {
                        mode: mode.id,
                        horizon: mode.id === 'panorama' ? 0.5 : 0.56,
                        depth: mode.id === 'panorama' ? 1.15 : 1
                      })
                    }
                    className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-all ${
                      (backgroundPlate.mode || 'viewport') === mode.id
                        ? 'border border-cyan-300/35 bg-cyan-300/18 text-cyan-50'
                        : 'border border-white/10 bg-white/[0.04] text-white/62 hover:bg-white/[0.08]'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setBackgroundPlate(nodeId, { alignMode: !(backgroundPlate.alignMode ?? true) })
                  }
                  className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-all ${
                    (backgroundPlate.alignMode ?? true)
                      ? 'border border-amber-300/35 bg-amber-300/18 text-amber-50'
                      : 'border border-white/10 bg-white/[0.04] text-white/62 hover:bg-white/[0.08]'
                  }`}
                >
                  贴图对齐
                </button>
              </div>
              <div className="space-y-2.5 rounded-2xl border border-white/10 bg-[#17233d]/65 p-3">
                <div className="flex items-center gap-3">
                  <span className="w-14 text-[11px] text-white/52">
                    {backgroundPlate.mode === 'panorama' ? '俯仰中心' : '地平线'}
                  </span>
                  <input
                    type="range"
                    min={0.28}
                    max={0.78}
                    step={0.01}
                    value={backgroundPlate.horizon ?? 0.55}
                    onInput={(event) =>
                      setBackgroundPlate(nodeId, { horizon: Number(event.currentTarget.value) })
                    }
                    onChange={(event) =>
                      setBackgroundPlate(nodeId, { horizon: Number(event.target.value) })
                    }
                    className="flex-1 accent-cyan-300"
                  />
                  <span className="w-9 text-right font-mono text-[10px] text-white/52">
                    {Math.round((backgroundPlate.horizon ?? 0.55) * 100)}%
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-14 text-[11px] text-white/52">透视深度</span>
                  <input
                    type="range"
                    min={0.45}
                    max={2.2}
                    step={0.01}
                    value={backgroundPlate.depth ?? 1}
                    onInput={(event) =>
                      setBackgroundPlate(nodeId, { depth: Number(event.currentTarget.value) })
                    }
                    onChange={(event) =>
                      setBackgroundPlate(nodeId, { depth: Number(event.target.value) })
                    }
                    className="flex-1 accent-cyan-300"
                  />
                  <span className="w-9 text-right font-mono text-[10px] text-white/52">
                    {(backgroundPlate.depth ?? 1).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-14 text-[11px] text-white/52">对齐强度</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={backgroundPlate.alignStrength ?? 0.85}
                    onInput={(event) =>
                      setBackgroundPlate(nodeId, {
                        alignStrength: Number(event.currentTarget.value)
                      })
                    }
                    onChange={(event) =>
                      setBackgroundPlate(nodeId, { alignStrength: Number(event.target.value) })
                    }
                    className="flex-1 accent-amber-300"
                  />
                  <span className="w-9 text-right font-mono text-[10px] text-white/52">
                    {Math.round((backgroundPlate.alignStrength ?? 0.85) * 100)}%
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-10 text-[11px] text-white/52">透明</span>
                <input
                  type="range"
                  min={0.15}
                  max={1}
                  step={0.01}
                  value={backgroundPlate.opacity}
                  onInput={(event) =>
                    setBackgroundPlate(nodeId, { opacity: Number(event.currentTarget.value) })
                  }
                  onChange={(event) =>
                    setBackgroundPlate(nodeId, { opacity: Number(event.target.value) })
                  }
                  className="flex-1 accent-sky-300"
                />
                <span className="w-9 text-right font-mono text-[10px] text-white/52">
                  {Math.round(backgroundPlate.opacity * 100)}%
                </span>
              </div>
              <button
                type="button"
                onClick={handleClearBackgroundPlate}
                className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-medium text-white/58 transition-all hover:bg-white/[0.08] hover:text-white/75"
              >
                清除底图
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.03] px-3 py-5 text-center text-[11px] text-white/38">
              先导入一张有场景或人物的图片。
            </div>
          )}
        </section>

        <section className="mb-4 rounded-[24px] border border-white/10 bg-white/[0.05] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white/90">角色控制</div>
              <div className="mt-1 text-[11px] text-white/45">
                选中当前对象后，移动、动作和机位绑定优先作用在它身上。
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const characterId = addCharacter(nodeId)
                if (!characterId) return
                setSelectedId(characterId)
                setSelectedAssetId(null)
              }}
              className="rounded-full border border-cyan-400/25 bg-cyan-400/12 px-3 py-1 text-[11px] font-medium text-cyan-100 transition-all hover:bg-cyan-400/20"
            >
              + 添加
            </button>
          </div>

          <div className="mb-3 flex max-h-32 flex-col gap-1.5 overflow-y-auto pr-1 custom-scrollbar">
            {directorState.characters.map((character) => {
              const isFollowing = directorState.camera.followCharacterId === character.id
              return (
                <div
                  key={character.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelectedId(character.id)
                    setSelectedAssetId(null)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    setSelectedId(character.id)
                    setSelectedAssetId(null)
                  }}
                  className={`flex items-center justify-between rounded-2xl border px-3 py-2 text-left transition-all ${
                    selectedId === character.id
                      ? 'border-white/20 bg-white/12'
                      : 'border-transparent bg-white/[0.03] hover:bg-white/[0.07]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: character.color }}
                      />
                      <span className="truncate text-xs font-medium text-white/85">
                        {character.label}
                      </span>
                      {isFollowing && (
                        <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] text-cyan-100">
                          机位跟随
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[10px] text-white/38">
                      {(DIRECTOR_CHARACTER_VARIANTS.find((item) => item.id === character.variant)
                        ?.label || '男') +
                        ' · ' +
                        (DIRECTOR_POSE_PRESETS.find((item) => item.id === character.pose)?.label ||
                          '中性站姿')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      removeCharacter(nodeId, character.id)
                    }}
                    className="ml-3 text-lg leading-none text-white/35 transition-colors hover:text-red-300"
                  >
                    ×
                  </button>
                </div>
              )
            })}

            {directorState.characters.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.03] px-3 py-5 text-center text-[11px] text-white/38">
                先添加角色，或者直接用矩阵排列生成站位。
              </div>
            )}
          </div>

          {selectedCharacter ? (
            <>
              <div className="mb-3 rounded-2xl border border-white/10 bg-[#17233d]/70 p-3">
                <div className="mb-2">
                  <div className="text-xs font-semibold text-white/88">
                    {selectedCharacter.label}
                  </div>
                  <div className="mt-1 text-[10px] text-white/42">
                    {followCharacter?.id === selectedCharacter.id &&
                    directorState.camera.bindMode !== 'none'
                      ? `当前机位已绑定到这个角色，模式：${
                          DIRECTOR_CAMERA_BIND_MODES.find(
                            (item) => item.id === directorState.camera.bindMode
                          )?.label || '跟随'
                        }`
                      : '拖动画面里的角色，也可以切换机位绑定模式和偏移预设'}
                  </div>
                </div>

                <div className="mb-3">
                  <div className="mb-2 text-[11px] font-semibold text-white/72">机位绑定</div>
                  <div className="flex flex-wrap gap-2">
                    {DIRECTOR_CAMERA_BIND_MODES.map((mode) => {
                      const active =
                        mode.id === 'none'
                          ? directorState.camera.bindMode === 'none'
                          : directorState.camera.bindMode === mode.id &&
                            followCharacter?.id === selectedCharacter.id

                      return (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => {
                            if (mode.id === 'none') {
                              setCameraBindingMode(nodeId, 'none')
                              setCameraFollow(nodeId, null)
                              return
                            }

                            setCameraFollow(nodeId, selectedCharacter.id)
                            setCameraBindingMode(nodeId, mode.id)
                          }}
                          className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-all ${
                            active
                              ? 'border border-cyan-300/35 bg-cyan-300/18 text-cyan-50'
                              : 'border border-white/10 bg-white/[0.04] text-white/62 hover:bg-white/[0.08]'
                          }`}
                        >
                          {mode.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="mb-3">
                  <div className="mb-2 text-[11px] font-semibold text-white/72">偏移预设</div>
                  <div className="flex flex-wrap gap-2">
                    {DIRECTOR_CAMERA_OFFSET_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setCameraOffsetPreset(nodeId, preset.id)
                          if (directorState.camera.bindMode !== 'none') {
                            setCameraFollow(nodeId, selectedCharacter.id)
                          }
                        }}
                        className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-all ${
                          directorState.camera.offsetPreset === preset.id
                            ? 'border border-violet-300/35 bg-violet-300/18 text-violet-50'
                            : 'border border-white/10 bg-white/[0.04] text-white/62 hover:bg-white/[0.08]'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2.5">
                  {CHARACTER_SLIDERS.map((slider) => {
                    const rawValue = selectedCharacter[slider.key]
                    const displayValue =
                      slider.key === 'rotation'
                        ? `${Math.round((rawValue * 180) / Math.PI)}°`
                        : rawValue.toFixed(slider.key === 'scale' ? 2 : 1)

                    return (
                      <div key={slider.key} className="flex items-center gap-3">
                        <span className="w-10 text-[11px] text-white/52">{slider.label}</span>
                        <input
                          type="range"
                          min={slider.min}
                          max={slider.max}
                          step={slider.step}
                          value={rawValue}
                          onInput={(event) =>
                            handleSliderChange(slider.key, event.currentTarget.value)
                          }
                          onChange={(event) => handleSliderChange(slider.key, event.target.value)}
                          className="flex-1 accent-cyan-300"
                        />
                        <span className="w-11 text-right font-mono text-[10px] text-white/52">
                          {displayValue}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2 text-[11px] font-semibold text-white/72">性别</div>
                <div className="mb-3 flex flex-wrap gap-2">
                  {DIRECTOR_CHARACTER_VARIANTS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setCharacterVariant(nodeId, selectedCharacter.id, preset.id)}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-all ${
                        selectedCharacter.variant === preset.id
                          ? 'border border-cyan-300/35 bg-cyan-300/18 text-cyan-50'
                          : 'border border-white/10 bg-white/[0.04] text-white/62 hover:bg-white/[0.08]'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="mb-2 text-[11px] font-semibold text-white/72">动作预设</div>
                <div className="flex flex-wrap gap-2">
                  {DIRECTOR_POSE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setCharacterPose(nodeId, selectedCharacter.id, preset.id)}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-all ${
                        selectedCharacter.pose === preset.id
                          ? 'border border-amber-300/35 bg-amber-300/18 text-amber-50'
                          : 'border border-white/10 bg-white/[0.04] text-white/62 hover:bg-white/[0.08]'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-[11px] font-semibold text-white/72">骨骼微调</div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={resetBoneControl}
                        className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-medium text-white/48 transition-all hover:bg-white/[0.08] hover:text-white/70"
                      >
                        清当前
                      </button>
                      <button
                        type="button"
                        onClick={resetAllBoneControls}
                        className="rounded-full border border-red-300/18 bg-red-300/[0.06] px-2 py-1 text-[10px] font-medium text-red-100/70 transition-all hover:bg-red-300/12"
                      >
                        清全部
                      </button>
                    </div>
                  </div>

                  <div className="mb-3 grid grid-cols-2 gap-1.5">
                    {DIRECTOR_BONE_CONTROLS.map((control) => (
                      <button
                        key={control.id}
                        type="button"
                        onClick={() => setActiveBoneControl(control.id)}
                        className={`min-w-0 rounded-xl px-2 py-1.5 text-[10px] font-medium transition-all ${
                          selectedBoneControl.id === control.id
                            ? 'border border-cyan-300/35 bg-cyan-300/18 text-cyan-50'
                            : 'border border-white/10 bg-white/[0.035] text-white/58 hover:bg-white/[0.07]'
                        }`}
                      >
                        {control.label}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-2.5 rounded-2xl border border-white/10 bg-black/10 p-3">
                    {DIRECTOR_BONE_AXES.map((axis) => {
                      const rawValue = selectedBoneRotation[axis.id] || 0
                      return (
                        <div key={axis.id} className="flex items-center gap-3">
                          <span className="w-12 text-[10px] text-white/52">{axis.label}</span>
                          <input
                            type="range"
                            min={-1.6}
                            max={1.6}
                            step={0.02}
                            value={rawValue}
                            onInput={(event) =>
                              handleBoneSliderChange(axis.id, event.currentTarget.value)
                            }
                            onChange={(event) =>
                              handleBoneSliderChange(axis.id, event.target.value)
                            }
                            className="flex-1 accent-cyan-300"
                          />
                          <span className="w-10 text-right font-mono text-[10px] text-white/52">
                            {Math.round((rawValue * 180) / Math.PI)}°
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </section>

        <section className="mb-4 rounded-[24px] border border-white/10 bg-white/[0.05] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white/90">场景素材</div>
              <div className="mt-1 text-[11px] text-white/45">
                添加低模道具，快速搭出门窗、街景、室内和障碍物关系。
              </div>
            </div>
            <button
              type="button"
              onClick={() => addSceneAsset(nodeId, 'wall')}
              className="rounded-full border border-emerald-300/25 bg-emerald-300/12 px-3 py-1 text-[11px] font-medium text-emerald-100 transition-all hover:bg-emerald-300/20"
            >
              + 添加
            </button>
          </div>

          <div className="mb-3 flex max-h-28 flex-col gap-1.5 overflow-y-auto pr-1 custom-scrollbar">
            {directorState.sceneAssets.map((asset) => (
              <div
                key={asset.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setSelectedAssetId(asset.id)
                  setSelectedId(null)
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  setSelectedAssetId(asset.id)
                  setSelectedId(null)
                }}
                className={`flex items-center justify-between rounded-2xl border px-3 py-2 text-left transition-all ${
                  selectedAssetId === asset.id
                    ? 'border-white/20 bg-white/12'
                    : 'border-transparent bg-white/[0.03] hover:bg-white/[0.07]'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: asset.color }}
                    />
                    <span className="truncate text-xs font-medium text-white/85">
                      {asset.label}
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-white/38">
                    {DIRECTOR_SCENE_ASSET_PRESETS.find((item) => item.id === asset.preset)?.label ||
                      '墙面'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    removeSceneAsset(nodeId, asset.id)
                  }}
                  className="ml-3 text-lg leading-none text-white/35 transition-colors hover:text-red-300"
                >
                  ×
                </button>
              </div>
            ))}

            {directorState.sceneAssets.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.03] px-3 py-5 text-center text-[11px] text-white/38">
                添加几个场景素材，可以更清楚地表达空间关系。
              </div>
            )}
          </div>

          <div className="mb-3 grid grid-cols-3 gap-2">
            {DIRECTOR_SCENE_ASSET_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  if (selectedSceneAsset) {
                    setSceneAssetPreset(nodeId, selectedSceneAsset.id, preset.id)
                    return
                  }
                  addSceneAsset(nodeId, preset.id)
                }}
                className={`rounded-2xl border px-2 py-1.5 text-[11px] font-medium transition-all ${
                  selectedSceneAsset?.preset === preset.id
                    ? 'border-emerald-300/35 bg-emerald-300/18 text-emerald-50'
                    : 'border-white/10 bg-white/[0.04] text-white/62 hover:bg-white/[0.08]'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {selectedSceneAsset && (
            <div className="rounded-2xl border border-white/10 bg-[#17233d]/70 p-3">
              <div className="mb-3">
                <div className="text-xs font-semibold text-white/88">
                  {selectedSceneAsset.label}
                </div>
                <div className="mt-1 text-[10px] text-white/42">
                  切换上方素材类型，或用滑杆调整在舞台里的位置、朝向和大小。
                </div>
              </div>

              <div className="space-y-2.5">
                {SCENE_ASSET_SLIDERS.map((slider) => {
                  const rawValue = selectedSceneAsset[slider.key]
                  const displayValue =
                    slider.key === 'rotation'
                      ? `${Math.round((rawValue * 180) / Math.PI)}°`
                      : rawValue.toFixed(slider.key === 'scale' ? 2 : 1)

                  return (
                    <div key={slider.key} className="flex items-center gap-3">
                      <span className="w-10 text-[11px] text-white/52">{slider.label}</span>
                      <input
                        type="range"
                        min={slider.min}
                        max={slider.max}
                        step={slider.step}
                        value={rawValue}
                        onInput={(event) =>
                          handleAssetSliderChange(slider.key, event.currentTarget.value)
                        }
                        onChange={(event) =>
                          handleAssetSliderChange(slider.key, event.target.value)
                        }
                        className="flex-1 accent-emerald-300"
                      />
                      <span className="w-11 text-right font-mono text-[10px] text-white/52">
                        {displayValue}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        <section className="mb-4 rounded-[24px] border border-white/10 bg-white/[0.05] p-4">
          <div className="mb-2 text-sm font-semibold text-white/90">画幅比例</div>
          <div className="mb-3 text-[11px] text-white/45">
            选择后，预览框和快照都会按这个比例裁切输出。
          </div>
          <div className="flex flex-wrap gap-2">
            {DIRECTOR_ASPECT_RATIOS.map((ratio) => (
              <button
                key={ratio.id}
                type="button"
                onClick={() => setFrameRatio(nodeId, ratio.id)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-all ${
                  directorState.frameRatio === ratio.id
                    ? 'border border-cyan-300/35 bg-cyan-300/18 text-cyan-50'
                    : 'border border-white/10 bg-white/[0.04] text-white/62 hover:bg-white/[0.08]'
                }`}
              >
                {ratio.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mb-4 rounded-[24px] border border-white/10 bg-white/[0.05] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white/90">矩阵排列</div>
              <div className="mt-1 text-[11px] text-white/45">
                一键生成路人阵列，再继续微调位置和动作。
              </div>
            </div>
            <button
              type="button"
              onClick={() => applyFormation(nodeId)}
              className="rounded-full border border-violet-300/28 bg-violet-300/14 px-3 py-1 text-[11px] font-medium text-violet-50 transition-all hover:bg-violet-300/22"
            >
              生成矩阵
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="rounded-2xl border border-white/10 bg-[#17233d]/60 px-3 py-2">
              <div className="text-[10px] text-white/42">总数</div>
              <input
                type="number"
                min={1}
                max={120}
                value={directorState.formation.total}
                onChange={(event) =>
                  setFormation(nodeId, {
                    ...directorState.formation,
                    total: clampNumber(event.target.value, directorState.formation.total, 1, 120)
                  })
                }
                className="mt-1 w-full bg-transparent text-sm text-white outline-none"
              />
            </label>
            <label className="rounded-2xl border border-white/10 bg-[#17233d]/60 px-3 py-2">
              <div className="text-[10px] text-white/42">列数</div>
              <input
                type="number"
                min={1}
                max={12}
                value={directorState.formation.cols}
                onChange={(event) =>
                  setFormation(nodeId, {
                    ...directorState.formation,
                    cols: clampNumber(event.target.value, directorState.formation.cols, 1, 12)
                  })
                }
                className="mt-1 w-full bg-transparent text-sm text-white outline-none"
              />
            </label>
          </div>
        </section>

        <section className="mb-4 rounded-[24px] border border-white/10 bg-white/[0.05] p-4">
          <div className="mb-2 text-sm font-semibold text-white/90">镜头</div>
          <div className="mb-3 flex flex-wrap gap-2">
            {DIRECTOR_SHOT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setShotType(nodeId, type)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-all ${
                  directorState.shotType === type
                    ? 'border border-cyan-300/35 bg-cyan-300/18 text-cyan-50'
                    : 'border border-white/10 bg-white/[0.04] text-white/62 hover:bg-white/[0.08]'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
          <div className="mb-3">
            <div className="mb-2 text-[11px] font-semibold text-white/72">机位预设</div>
            <div className="grid grid-cols-2 gap-2">
              {CAMERA_VIEW_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setCamera(nodeId, preset.camera)}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-medium text-white/68 transition-all hover:bg-white/[0.08] hover:text-white/86"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2.5">
            <div className="flex items-center gap-3">
              <span className="w-10 text-[11px] text-white/50">FOV</span>
              <input
                type="range"
                min={24}
                max={100}
                value={directorState.camera.fov}
                onChange={(event) => setCamera(nodeId, { fov: Number(event.target.value) })}
                className="flex-1 accent-cyan-300"
              />
              <span className="w-10 text-right font-mono text-[10px] text-white/48">
                {directorState.camera.fov}°
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-10 text-[11px] text-white/50">方位</span>
              <input
                type="range"
                min={-180}
                max={180}
                value={directorState.camera.azimuth}
                onChange={(event) => setCamera(nodeId, { azimuth: Number(event.target.value) })}
                className="flex-1 accent-cyan-300"
              />
              <span className="w-10 text-right font-mono text-[10px] text-white/48">
                {Math.round(directorState.camera.azimuth)}°
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-10 text-[11px] text-white/50">仰角</span>
              <input
                type="range"
                min={4}
                max={80}
                value={directorState.camera.elevation}
                onChange={(event) => setCamera(nodeId, { elevation: Number(event.target.value) })}
                className="flex-1 accent-cyan-300"
              />
              <span className="w-10 text-right font-mono text-[10px] text-white/48">
                {Math.round(directorState.camera.elevation)}°
              </span>
            </div>
          </div>
        </section>

        <section className="mb-4 rounded-[24px] border border-white/10 bg-white/[0.05] p-4">
          <div className="mb-2 text-sm font-semibold text-white/90">构图</div>
          <div className="flex flex-wrap gap-2">
            {DIRECTOR_COMPOSITIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setComposition(nodeId, item.id)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-all ${
                  directorState.composition === item.id
                    ? 'border border-amber-300/35 bg-amber-300/18 text-amber-50'
                    : 'border border-white/10 bg-white/[0.04] text-white/62 hover:bg-white/[0.08]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <button
          type="button"
          onClick={() => resetNode(nodeId)}
          className="rounded-[20px] border border-red-300/18 bg-red-300/10 px-4 py-3 text-sm font-semibold text-red-100 transition-all hover:bg-red-300/16"
        >
          重置所有
        </button>
      </div>

      {toast && (
        <div className="pointer-events-none fixed left-1/2 top-5 z-[10000] -translate-x-1/2 rounded-full border border-white/12 bg-black/60 px-4 py-2 text-xs text-white/90 shadow-[0_12px_30px_rgba(0,0,0,0.25)] backdrop-blur-sm">
          {toast}
        </div>
      )}
    </div>
  )

  if (typeof document !== 'undefined') {
    return createPortal(modal, document.body)
  }

  return modal
}
