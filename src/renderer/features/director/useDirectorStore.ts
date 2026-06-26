import { create } from 'zustand'

export const DIRECTOR_SHOT_TYPES = ['特写', '中景', '远景', '航拍'] as const
export type DirectorShotType = (typeof DIRECTOR_SHOT_TYPES)[number]

export const DIRECTOR_COMPOSITIONS = [
  { id: 'center', label: '中心' },
  { id: 'rule-of-thirds', label: '三分法' },
  { id: 'golden', label: '黄金分割' }
] as const
export type DirectorCompositionId = (typeof DIRECTOR_COMPOSITIONS)[number]['id']

export const DIRECTOR_ASPECT_RATIOS = [
  { id: 'free', label: '自由', value: null, prompt: '' },
  { id: '1:1', label: '1:1', value: 1, prompt: 'square frame' },
  { id: '4:3', label: '4:3', value: 4 / 3, prompt: 'classic 4:3 frame' },
  { id: '3:4', label: '3:4', value: 3 / 4, prompt: 'portrait 3:4 frame' },
  { id: '16:9', label: '16:9', value: 16 / 9, prompt: 'cinematic 16:9 frame' },
  { id: '2:1', label: '2:1', value: 2, prompt: 'wide panoramic 2:1 frame' },
  { id: '4:1', label: '4:1', value: 4, prompt: '720 panoramic 4:1 frame' },
  { id: '9:16', label: '9:16', value: 9 / 16, prompt: 'vertical 9:16 frame' },
  { id: '21:9', label: '21:9', value: 21 / 9, prompt: 'ultra wide 21:9 frame' },
  { id: '2.35:1', label: '2.35:1', value: 2.35, prompt: 'anamorphic 2.35:1 frame' },
  { id: '4:5', label: '4:5', value: 4 / 5, prompt: 'social portrait 4:5 frame' },
  { id: '5:4', label: '5:4', value: 5 / 4, prompt: 'editorial 5:4 frame' }
] as const
export type DirectorAspectRatioId = (typeof DIRECTOR_ASPECT_RATIOS)[number]['id']

export const DIRECTOR_POSE_PRESETS = [
  { id: 'neutral', label: '中性站姿', prompt: 'neutral standing pose' },
  { id: 'walk', label: '行走', prompt: 'walking pose' },
  { id: 'run', label: '奔跑', prompt: 'running action pose' },
  { id: 'talk', label: '对话', prompt: 'conversational gesture pose' },
  { id: 'point', label: '指向', prompt: 'pointing pose' },
  { id: 'alert', label: '警戒', prompt: 'alert ready pose' },
  { id: 'half-crouch', label: '半蹲', prompt: 'half crouch pose' },
  { id: 'sit', label: '坐姿', prompt: 'seated pose' },
  { id: 'kneel', label: '跪姿', prompt: 'kneeling pose' },
  { id: 'arms-crossed', label: '抱臂', prompt: 'arms crossed pose' },
  { id: 'hands-up', label: '举手', prompt: 'hands raised pose' },
  { id: 'lean', label: '倚靠', prompt: 'leaning pose' },
  { id: 'fall', label: '倒地', prompt: 'fallen pose on the ground' }
] as const
export type DirectorPoseId = (typeof DIRECTOR_POSE_PRESETS)[number]['id']

export const DIRECTOR_CHARACTER_VARIANTS = [
  { id: 'male-casual', label: '男', prompt: 'male director mannequin' },
  { id: 'female-casual', label: '女', prompt: 'female director mannequin' }
] as const
export type DirectorCharacterVariantId = (typeof DIRECTOR_CHARACTER_VARIANTS)[number]['id']

export const DIRECTOR_BONE_CONTROLS = [
  { id: 'head', label: '头颈' },
  { id: 'spine', label: '躯干' },
  { id: 'leftArm', label: '左上臂' },
  { id: 'rightArm', label: '右上臂' },
  { id: 'leftForearm', label: '左前臂' },
  { id: 'rightForearm', label: '右前臂' },
  { id: 'leftHand', label: '左手' },
  { id: 'rightHand', label: '右手' },
  { id: 'leftLeg', label: '左大腿' },
  { id: 'rightLeg', label: '右大腿' },
  { id: 'leftCalf', label: '左小腿' },
  { id: 'rightCalf', label: '右小腿' },
  { id: 'leftFoot', label: '左脚' },
  { id: 'rightFoot', label: '右脚' }
] as const
export type DirectorBoneControlId = (typeof DIRECTOR_BONE_CONTROLS)[number]['id']

export const DIRECTOR_BONE_AXES = [
  { id: 'x', label: '俯仰 X' },
  { id: 'y', label: '旋转 Y' },
  { id: 'z', label: '侧摆 Z' }
] as const
export type DirectorBoneAxisId = (typeof DIRECTOR_BONE_AXES)[number]['id']
export type DirectorBoneRotation = Partial<Record<DirectorBoneAxisId, number>>
export type DirectorBoneAdjustments = Partial<Record<DirectorBoneControlId, DirectorBoneRotation>>

export const DIRECTOR_SCENE_ASSET_PRESETS = [
  { id: 'wall', label: '墙面', prompt: 'plain background wall' },
  { id: 'door', label: '门', prompt: 'doorway set piece' },
  { id: 'window', label: '窗', prompt: 'large window set piece' },
  { id: 'table', label: '桌子', prompt: 'rectangular table prop' },
  { id: 'chair', label: '椅子', prompt: 'simple chair prop' },
  { id: 'sofa', label: '沙发', prompt: 'sofa prop' },
  { id: 'bed', label: '床', prompt: 'bedroom bed prop' },
  { id: 'stairs', label: '台阶', prompt: 'short stairs set piece' },
  { id: 'street-lamp', label: '路灯', prompt: 'street lamp prop' },
  { id: 'tree', label: '树', prompt: 'tree prop' },
  { id: 'rock', label: '石块', prompt: 'rock prop cluster' },
  { id: 'car-block', label: '车', prompt: 'parked car blocking shape' }
] as const
export type DirectorSceneAssetPresetId = (typeof DIRECTOR_SCENE_ASSET_PRESETS)[number]['id']

export const DIRECTOR_CAMERA_BIND_MODES = [
  { id: 'none', label: '自由' },
  { id: 'follow', label: '跟随' },
  { id: 'look-at', label: '注视' }
] as const
export type DirectorCameraBindModeId = (typeof DIRECTOR_CAMERA_BIND_MODES)[number]['id']

export const DIRECTOR_CAMERA_OFFSET_PRESETS = [
  {
    id: 'center-follow',
    label: '居中跟拍',
    cameraOffset: { x: 0, y: 1.45, z: 4.8 },
    focusOffset: { x: 0, y: 1.22, z: 0 },
    followPrompt: 'center follow camera on lead subject',
    lookAtPrompt: 'centered focus on lead subject'
  },
  {
    id: 'left-shoulder',
    label: '左肩跟拍',
    cameraOffset: { x: -1.25, y: 1.55, z: 3.7 },
    focusOffset: { x: -0.15, y: 1.22, z: 0.18 },
    followPrompt: 'left shoulder tracking camera',
    lookAtPrompt: 'left weighted framing on lead subject'
  },
  {
    id: 'right-shoulder',
    label: '右肩跟拍',
    cameraOffset: { x: 1.25, y: 1.55, z: 3.7 },
    focusOffset: { x: 0.15, y: 1.22, z: 0.18 },
    followPrompt: 'right shoulder tracking camera',
    lookAtPrompt: 'right weighted framing on lead subject'
  },
  {
    id: 'side-profile',
    label: '侧面跟拍',
    cameraOffset: { x: 3.8, y: 1.4, z: 0.7 },
    focusOffset: { x: 0, y: 1.18, z: 0.12 },
    followPrompt: 'side profile tracking shot',
    lookAtPrompt: 'profile focus on lead subject'
  },
  {
    id: 'frontal-push',
    label: '迎面推进',
    cameraOffset: { x: 0, y: 1.45, z: -3.6 },
    focusOffset: { x: 0, y: 1.22, z: 0 },
    followPrompt: 'frontal moving camera on lead subject',
    lookAtPrompt: 'front facing focus on lead subject'
  }
] as const
export type DirectorCameraOffsetPresetId = (typeof DIRECTOR_CAMERA_OFFSET_PRESETS)[number]['id']

export const DIRECTOR_BACKGROUND_MODES = [
  { id: 'viewport', label: '视口图', prompt: 'camera viewport background plate' },
  { id: 'panorama', label: '720全景', prompt: 'panoramic 720 environment plate' }
] as const
export type DirectorBackgroundModeId = (typeof DIRECTOR_BACKGROUND_MODES)[number]['id']

export interface DirectorCharacter {
  id: string
  label: string
  x: number
  z: number
  rotation: number
  color: string
  scale: number
  pose: DirectorPoseId
  variant: DirectorCharacterVariantId
  boneAdjustments: DirectorBoneAdjustments
}

export interface DirectorSceneAsset {
  id: string
  preset: DirectorSceneAssetPresetId
  label: string
  x: number
  z: number
  rotation: number
  scale: number
  color: string
}

export interface DirectorBackgroundPlate {
  path: string
  width: number
  height: number
  opacity: number
  mode: DirectorBackgroundModeId
  horizon: number
  depth: number
  alignStrength: number
  alignMode: boolean
}

export interface DirectorCamera {
  distance: number
  elevation: number
  azimuth: number
  fov: number
  followCharacterId: string | null
  bindMode: DirectorCameraBindModeId
  offsetPreset: DirectorCameraOffsetPresetId
}

export interface DirectorStateSnapshot {
  characters: DirectorCharacter[]
  sceneAssets: DirectorSceneAsset[]
  backgroundPlate: DirectorBackgroundPlate | null
  camera: DirectorCamera
  shotType: DirectorShotType
  composition: DirectorCompositionId
  formation: { total: number; cols: number }
  frameRatio: DirectorAspectRatioId
}

interface DirectorStore {
  nodes: Record<string, DirectorStateSnapshot>
  ensureNode: (nodeId: string, snapshot?: Partial<DirectorStateSnapshot> | null) => void
  hydrateNode: (nodeId: string, snapshot?: Partial<DirectorStateSnapshot> | null) => void
  removeNode: (nodeId: string) => void
  addCharacter: (nodeId: string) => string | null
  removeCharacter: (nodeId: string, charId: string) => void
  updateCharacter: (nodeId: string, charId: string, props: Partial<DirectorCharacter>) => void
  setCharacterPose: (nodeId: string, charId: string, pose: DirectorPoseId) => void
  setCharacterVariant: (nodeId: string, charId: string, variant: DirectorCharacterVariantId) => void
  addSceneAsset: (nodeId: string, preset?: DirectorSceneAssetPresetId) => void
  removeSceneAsset: (nodeId: string, assetId: string) => void
  updateSceneAsset: (nodeId: string, assetId: string, props: Partial<DirectorSceneAsset>) => void
  setSceneAssetPreset: (nodeId: string, assetId: string, preset: DirectorSceneAssetPresetId) => void
  setBackgroundPlate: (nodeId: string, plate: Partial<DirectorBackgroundPlate> | null) => void
  clearBackgroundPlate: (nodeId: string) => void
  setCamera: (nodeId: string, camera: Partial<DirectorCamera>) => void
  setCameraFollow: (nodeId: string, charId?: string | null) => void
  setCameraBindingMode: (nodeId: string, mode: DirectorCameraBindModeId) => void
  setCameraOffsetPreset: (nodeId: string, preset: DirectorCameraOffsetPresetId) => void
  setShotType: (nodeId: string, shotType: DirectorShotType) => void
  setComposition: (nodeId: string, composition: DirectorCompositionId) => void
  setFrameRatio: (nodeId: string, frameRatio: DirectorAspectRatioId) => void
  setFormation: (nodeId: string, formation: { total: number; cols: number }) => void
  applyFormation: (nodeId: string) => void
  resetNode: (nodeId: string) => void
}

const COLORS = [
  '#6ea8ff',
  '#70d6b6',
  '#f2b279',
  '#f38ba8',
  '#9b8cff',
  '#88d4f2',
  '#c6d66b',
  '#f6a5c0'
]

const SCENE_ASSET_COLORS = [
  '#8aa0bd',
  '#b78b67',
  '#7aa7c7',
  '#d0a85f',
  '#8dbb72',
  '#c77f7f',
  '#7f8ca3',
  '#c3b284'
]

const SHOT_CAMERA_PRESETS: Record<DirectorShotType, Partial<DirectorCamera>> = {
  特写: { distance: 2.6, elevation: 10, fov: 42 },
  中景: { distance: 5, elevation: 22, fov: 56 },
  远景: { distance: 9.5, elevation: 28, fov: 64 },
  航拍: { distance: 14, elevation: 62, fov: 70 }
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Number(value)))
}

function isShotType(value: unknown): value is DirectorShotType {
  return DIRECTOR_SHOT_TYPES.some((item) => item === value)
}

function isComposition(value: unknown): value is DirectorCompositionId {
  return DIRECTOR_COMPOSITIONS.some((item) => item.id === value)
}

function isFrameRatio(value: unknown): value is DirectorAspectRatioId {
  return DIRECTOR_ASPECT_RATIOS.some((item) => item.id === value)
}

function isPose(value: unknown): value is DirectorPoseId {
  return DIRECTOR_POSE_PRESETS.some((item) => item.id === value)
}

function isCharacterVariant(value: unknown): value is DirectorCharacterVariantId {
  return DIRECTOR_CHARACTER_VARIANTS.some((item) => item.id === value)
}

function sanitizeBoneAdjustments(value: unknown): DirectorBoneAdjustments {
  if (!value || typeof value !== 'object') return {}

  const source = value as Record<string, unknown>
  return DIRECTOR_BONE_CONTROLS.reduce<DirectorBoneAdjustments>((acc, control) => {
    const rawRotation = source[control.id]
    if (!rawRotation || typeof rawRotation !== 'object') return acc

    const rotationSource = rawRotation as Record<string, unknown>
    const nextRotation = DIRECTOR_BONE_AXES.reduce<DirectorBoneRotation>((axisAcc, axis) => {
      const nextValue = clampNumber(rotationSource[axis.id], 0, -1.6, 1.6)
      if (Math.abs(nextValue) > 0.001) {
        axisAcc[axis.id] = nextValue
      }
      return axisAcc
    }, {})

    if (Object.keys(nextRotation).length > 0) {
      acc[control.id] = nextRotation
    }
    return acc
  }, {})
}

function isSceneAssetPreset(value: unknown): value is DirectorSceneAssetPresetId {
  return DIRECTOR_SCENE_ASSET_PRESETS.some((item) => item.id === value)
}

function isCameraBindMode(value: unknown): value is DirectorCameraBindModeId {
  return DIRECTOR_CAMERA_BIND_MODES.some((item) => item.id === value)
}

function isCameraOffsetPreset(value: unknown): value is DirectorCameraOffsetPresetId {
  return DIRECTOR_CAMERA_OFFSET_PRESETS.some((item) => item.id === value)
}

function isBackgroundMode(value: unknown): value is DirectorBackgroundModeId {
  return DIRECTOR_BACKGROUND_MODES.some((item) => item.id === value)
}

function sanitizeBackgroundPlate(value: unknown): DirectorBackgroundPlate | null {
  if (!value || typeof value !== 'object') return null

  const source = value as Partial<DirectorBackgroundPlate>
  if (!source.path || typeof source.path !== 'string') return null
  const ratio =
    Number(source.width) > 0 && Number(source.height) > 0
      ? Number(source.width) / Number(source.height)
      : 1
  const inferredMode = ratio >= 2.4 ? 'panorama' : 'viewport'
  const mode = isBackgroundMode(source.mode) ? source.mode : inferredMode

  return {
    path: source.path,
    width: Math.round(clampNumber(source.width, 0, 0, 20000)),
    height: Math.round(clampNumber(source.height, 0, 0, 20000)),
    opacity: clampNumber(source.opacity, 0.82, 0.15, 1),
    mode,
    horizon: clampNumber(source.horizon, mode === 'panorama' ? 0.5 : 0.56, 0.2, 0.82),
    depth: clampNumber(source.depth, mode === 'panorama' ? 1.15 : 1, 0.45, 2.2),
    alignStrength: clampNumber(source.alignStrength, 0.85, 0, 1),
    alignMode: source.alignMode !== false
  }
}

export function getDirectorAspectRatioConfig(frameRatio?: string | null) {
  return DIRECTOR_ASPECT_RATIOS.find((item) => item.id === frameRatio) || DIRECTOR_ASPECT_RATIOS[0]
}

export function getDirectorFrameRatioValue(frameRatio?: string | null) {
  return getDirectorAspectRatioConfig(frameRatio).value
}

export function getDirectorPoseConfig(pose?: string | null) {
  return DIRECTOR_POSE_PRESETS.find((item) => item.id === pose) || DIRECTOR_POSE_PRESETS[0]
}

export function getDirectorCharacterVariantConfig(variant?: string | null) {
  return (
    DIRECTOR_CHARACTER_VARIANTS.find((item) => item.id === variant) ||
    DIRECTOR_CHARACTER_VARIANTS[0]
  )
}

export function getDirectorSceneAssetConfig(preset?: string | null) {
  return (
    DIRECTOR_SCENE_ASSET_PRESETS.find((item) => item.id === preset) ||
    DIRECTOR_SCENE_ASSET_PRESETS[0]
  )
}

export function getDirectorCameraOffsetPresetConfig(preset?: string | null) {
  return (
    DIRECTOR_CAMERA_OFFSET_PRESETS.find((item) => item.id === preset) ||
    DIRECTOR_CAMERA_OFFSET_PRESETS[0]
  )
}

export function getDefaultDirectorState(): DirectorStateSnapshot {
  return {
    characters: [],
    sceneAssets: [],
    backgroundPlate: null,
    camera: {
      distance: 5,
      elevation: 22,
      azimuth: 0,
      fov: 56,
      followCharacterId: null,
      bindMode: 'none',
      offsetPreset: 'center-follow'
    },
    shotType: '中景',
    composition: 'center',
    formation: { total: 9, cols: 3 },
    frameRatio: 'free'
  }
}

export function sanitizeDirectorState(
  snapshot?: Partial<DirectorStateSnapshot> | null
): DirectorStateSnapshot {
  const defaults = getDefaultDirectorState()

  const characters = Array.isArray(snapshot?.characters)
    ? snapshot.characters.map((char, index) => ({
        id: char?.id || `char_${Date.now()}_${index}`,
        label: char?.label || `角色${String.fromCharCode(65 + (index % 26))}`,
        x: clampNumber(char?.x, 0, -50, 50),
        z: clampNumber(char?.z, 0, -50, 50),
        rotation: clampNumber(char?.rotation, 0, -Math.PI, Math.PI),
        color: char?.color || COLORS[index % COLORS.length],
        scale: clampNumber(char?.scale, 1, 0.55, 1.8),
        pose: isPose(char?.pose) ? char.pose : 'neutral',
        variant: isCharacterVariant(char?.variant)
          ? char.variant
          : DIRECTOR_CHARACTER_VARIANTS[index % DIRECTOR_CHARACTER_VARIANTS.length].id,
        boneAdjustments: sanitizeBoneAdjustments(char?.boneAdjustments)
      }))
    : defaults.characters

  const sceneAssets = Array.isArray(snapshot?.sceneAssets)
    ? snapshot.sceneAssets.map((asset, index) => {
        const preset = isSceneAssetPreset(asset?.preset) ? asset.preset : 'wall'
        return {
          id: asset?.id || `asset_${Date.now()}_${index}`,
          preset,
          label: asset?.label || getDirectorSceneAssetConfig(preset).label,
          x: clampNumber(asset?.x, 0, -50, 50),
          z: clampNumber(asset?.z, -3, -50, 50),
          rotation: clampNumber(asset?.rotation, 0, -Math.PI, Math.PI),
          scale: clampNumber(asset?.scale, 1, 0.35, 4),
          color: asset?.color || SCENE_ASSET_COLORS[index % SCENE_ASSET_COLORS.length]
        }
      })
    : defaults.sceneAssets

  const camera = {
    distance: clampNumber(snapshot?.camera?.distance, defaults.camera.distance, 1.5, 30),
    elevation: clampNumber(snapshot?.camera?.elevation, defaults.camera.elevation, 4, 80),
    azimuth: clampNumber(snapshot?.camera?.azimuth, defaults.camera.azimuth, -180, 180),
    fov: clampNumber(snapshot?.camera?.fov, defaults.camera.fov, 24, 100),
    followCharacterId:
      typeof snapshot?.camera?.followCharacterId === 'string' &&
      characters.some((char) => char.id === snapshot.camera.followCharacterId)
        ? snapshot.camera.followCharacterId
        : null,
    bindMode: isCameraBindMode(snapshot?.camera?.bindMode)
      ? snapshot.camera.bindMode
      : defaults.camera.bindMode,
    offsetPreset: isCameraOffsetPreset(snapshot?.camera?.offsetPreset)
      ? snapshot.camera.offsetPreset
      : defaults.camera.offsetPreset
  }

  return {
    characters,
    sceneAssets,
    backgroundPlate: sanitizeBackgroundPlate(snapshot?.backgroundPlate),
    camera,
    shotType: isShotType(snapshot?.shotType) ? snapshot.shotType : defaults.shotType,
    composition: isComposition(snapshot?.composition) ? snapshot.composition : defaults.composition,
    formation: {
      total: clampNumber(snapshot?.formation?.total, defaults.formation.total, 1, 120),
      cols: clampNumber(snapshot?.formation?.cols, defaults.formation.cols, 1, 12)
    },
    frameRatio: isFrameRatio(snapshot?.frameRatio) ? snapshot.frameRatio : defaults.frameRatio
  }
}

function updateNode(
  set: (updater: (state: DirectorStore) => Partial<DirectorStore>) => void,
  nodeId: string,
  updater: (current: DirectorStateSnapshot) => DirectorStateSnapshot
) {
  set((state) => {
    const current = sanitizeDirectorState(state.nodes[nodeId])
    const next = sanitizeDirectorState(updater(current))
    return {
      nodes: {
        ...state.nodes,
        [nodeId]: next
      }
    }
  })
}

function buildCharacter(index: number): DirectorCharacter {
  const label = String.fromCharCode(65 + (index % 26))
  return {
    id: `char_${Date.now()}_${index}`,
    label: `角色${label}`,
    x: (Math.random() - 0.5) * 4,
    z: -Math.random() * 5.5,
    rotation: 0,
    color: COLORS[index % COLORS.length],
    scale: 1,
    pose: 'neutral',
    variant: DIRECTOR_CHARACTER_VARIANTS[index % DIRECTOR_CHARACTER_VARIANTS.length].id,
    boneAdjustments: {}
  }
}

function buildSceneAsset(
  index: number,
  preset: DirectorSceneAssetPresetId = 'wall'
): DirectorSceneAsset {
  const config = getDirectorSceneAssetConfig(preset)
  return {
    id: `asset_${Date.now()}_${index}`,
    preset,
    label: config.label,
    x: ((index % 4) - 1.5) * 1.8,
    z: -3 - Math.floor(index / 4) * 1.6,
    rotation: 0,
    scale: 1,
    color: SCENE_ASSET_COLORS[index % SCENE_ASSET_COLORS.length]
  }
}

export const useDirectorStore = create<DirectorStore>((set) => ({
  nodes: {},

  ensureNode: (nodeId, snapshot) => {
    if (!nodeId) return
    set((state) => {
      if (state.nodes[nodeId]) return state
      return {
        nodes: {
          ...state.nodes,
          [nodeId]: sanitizeDirectorState(snapshot)
        }
      }
    })
  },

  hydrateNode: (nodeId, snapshot) => {
    if (!nodeId) return
    set((state) => ({
      nodes: {
        ...state.nodes,
        [nodeId]: sanitizeDirectorState(snapshot)
      }
    }))
  },

  removeNode: (nodeId) => {
    set((state) => {
      if (!state.nodes[nodeId]) return state
      const nextNodes = { ...state.nodes }
      delete nextNodes[nodeId]
      return { nodes: nextNodes }
    })
  },

  addCharacter: (nodeId) => {
    let nextCharacterId: string | null = null
    updateNode(set, nodeId, (current) => ({
      ...current,
      characters: [
        ...current.characters,
        (() => {
          const character = buildCharacter(current.characters.length)
          nextCharacterId = character.id
          return character
        })()
      ]
    }))
    return nextCharacterId
  },

  removeCharacter: (nodeId, charId) => {
    updateNode(set, nodeId, (current) => ({
      ...current,
      characters: current.characters.filter((char) => char.id !== charId),
      camera: {
        ...current.camera,
        followCharacterId:
          current.camera.followCharacterId === charId ? null : current.camera.followCharacterId,
        bindMode: current.camera.followCharacterId === charId ? 'none' : current.camera.bindMode
      }
    }))
  },

  updateCharacter: (nodeId, charId, props) => {
    updateNode(set, nodeId, (current) => ({
      ...current,
      characters: current.characters.map((char) =>
        char.id === charId ? { ...char, ...props } : char
      )
    }))
  },

  addSceneAsset: (nodeId, preset = 'wall') => {
    updateNode(set, nodeId, (current) => ({
      ...current,
      sceneAssets: [...current.sceneAssets, buildSceneAsset(current.sceneAssets.length, preset)]
    }))
  },

  removeSceneAsset: (nodeId, assetId) => {
    updateNode(set, nodeId, (current) => ({
      ...current,
      sceneAssets: current.sceneAssets.filter((asset) => asset.id !== assetId)
    }))
  },

  updateSceneAsset: (nodeId, assetId, props) => {
    updateNode(set, nodeId, (current) => ({
      ...current,
      sceneAssets: current.sceneAssets.map((asset) =>
        asset.id === assetId ? { ...asset, ...props } : asset
      )
    }))
  },

  setSceneAssetPreset: (nodeId, assetId, preset) => {
    updateNode(set, nodeId, (current) => ({
      ...current,
      sceneAssets: current.sceneAssets.map((asset) =>
        asset.id === assetId
          ? {
              ...asset,
              preset,
              label: getDirectorSceneAssetConfig(preset).label
            }
          : asset
      )
    }))
  },

  setBackgroundPlate: (nodeId, plate) => {
    updateNode(set, nodeId, (current) => ({
      ...current,
      backgroundPlate: plate
        ? sanitizeBackgroundPlate({
            ...(current.backgroundPlate || {}),
            ...plate
          })
        : null
    }))
  },

  clearBackgroundPlate: (nodeId) => {
    updateNode(set, nodeId, (current) => ({
      ...current,
      backgroundPlate: null
    }))
  },

  setCharacterPose: (nodeId, charId, pose) => {
    updateNode(set, nodeId, (current) => ({
      ...current,
      characters: current.characters.map((char) => (char.id === charId ? { ...char, pose } : char))
    }))
  },

  setCharacterVariant: (nodeId, charId, variant) => {
    updateNode(set, nodeId, (current) => ({
      ...current,
      characters: current.characters.map((char) =>
        char.id === charId ? { ...char, variant } : char
      )
    }))
  },

  setCamera: (nodeId, camera) => {
    updateNode(set, nodeId, (current) => ({
      ...current,
      camera: {
        ...current.camera,
        ...camera
      }
    }))
  },

  setCameraFollow: (nodeId, charId = null) => {
    updateNode(set, nodeId, (current) => ({
      ...current,
      camera: {
        ...current.camera,
        followCharacterId:
          charId && current.characters.some((char) => char.id === charId) ? charId : null,
        bindMode:
          charId && current.characters.some((char) => char.id === charId)
            ? current.camera.bindMode === 'none'
              ? 'follow'
              : current.camera.bindMode
            : 'none'
      }
    }))
  },

  setCameraBindingMode: (nodeId, mode) => {
    updateNode(set, nodeId, (current) => ({
      ...current,
      camera: {
        ...current.camera,
        bindMode: mode,
        followCharacterId: mode === 'none' ? null : current.camera.followCharacterId
      }
    }))
  },

  setCameraOffsetPreset: (nodeId, preset) => {
    updateNode(set, nodeId, (current) => ({
      ...current,
      camera: {
        ...current.camera,
        offsetPreset: preset
      }
    }))
  },

  setShotType: (nodeId, shotType) => {
    const preset = SHOT_CAMERA_PRESETS[shotType]

    updateNode(set, nodeId, (current) => ({
      ...current,
      shotType,
      camera: {
        ...current.camera,
        ...preset
      }
    }))
  },

  setComposition: (nodeId, composition) => {
    updateNode(set, nodeId, (current) => ({
      ...current,
      composition
    }))
  },

  setFrameRatio: (nodeId, frameRatio) => {
    updateNode(set, nodeId, (current) => ({
      ...current,
      frameRatio
    }))
  },

  setFormation: (nodeId, formation) => {
    updateNode(set, nodeId, (current) => ({
      ...current,
      formation: {
        ...current.formation,
        ...formation
      }
    }))
  },

  applyFormation: (nodeId) => {
    updateNode(set, nodeId, (current) => {
      const spacing = 1.45
      const total = Math.max(1, Number(current.formation.total) || 1)
      const cols = Math.max(1, Number(current.formation.cols) || 1)
      const characters: DirectorCharacter[] = []

      for (let index = 0; index < total; index++) {
        const col = index % cols
        const row = Math.floor(index / cols)
        const previous = current.characters[index]

        characters.push({
          id: previous?.id || `char_${Date.now()}_${index}`,
          label: previous?.label || `${index + 1}`,
          x: (col - (cols - 1) / 2) * spacing,
          z: -row * spacing * 1.08,
          rotation: previous?.rotation ?? 0,
          color: previous?.color || COLORS[index % COLORS.length],
          scale: previous?.scale ?? 1,
          pose: previous?.pose || 'neutral',
          variant:
            previous?.variant ||
            DIRECTOR_CHARACTER_VARIANTS[index % DIRECTOR_CHARACTER_VARIANTS.length].id,
          boneAdjustments: previous?.boneAdjustments || {}
        })
      }

      return {
        ...current,
        characters,
        camera: {
          ...current.camera,
          followCharacterId:
            current.camera.followCharacterId &&
            characters.some((char) => char.id === current.camera.followCharacterId)
              ? current.camera.followCharacterId
              : null
        }
      }
    })
  },

  resetNode: (nodeId) => {
    set((state) => ({
      nodes: {
        ...state.nodes,
        [nodeId]: getDefaultDirectorState()
      }
    }))
  }
}))

export function getDirectorNodeState(nodeId: string): DirectorStateSnapshot {
  return sanitizeDirectorState(useDirectorStore.getState().nodes[nodeId])
}

export function buildDirectorPrompt(state: DirectorStateSnapshot): string {
  const parts: string[] = []
  const count = state.characters.length

  if (count <= 1) parts.push('single person')
  else if (count === 2) parts.push('two people')
  else if (count <= 6) parts.push(`${count} people`)
  else parts.push(`crowd of ${count} people`)

  const shotMap: Record<DirectorShotType, string> = {
    特写: 'close-up shot',
    中景: 'medium shot',
    远景: 'wide shot',
    航拍: "bird\'s eye view"
  }
  parts.push(shotMap[state.shotType] || 'medium shot')

  const compositionMap: Record<DirectorCompositionId, string> = {
    center: 'centered composition',
    'rule-of-thirds': 'rule of thirds composition',
    golden: 'golden ratio composition'
  }
  parts.push(compositionMap[state.composition] || 'centered composition')

  const aspectConfig = getDirectorAspectRatioConfig(state.frameRatio)
  if (aspectConfig.prompt) {
    parts.push(aspectConfig.prompt)
  }

  if (state.backgroundPlate?.path) {
    const backgroundMode =
      DIRECTOR_BACKGROUND_MODES.find((item) => item.id === state.backgroundPlate?.mode) ||
      DIRECTOR_BACKGROUND_MODES[0]
    parts.push(backgroundMode.prompt)
  }

  const nonNeutralPoses = state.characters.filter((character) => character.pose !== 'neutral')
  if (nonNeutralPoses.length === 1 && count === 1) {
    parts.push(getDirectorPoseConfig(nonNeutralPoses[0].pose).prompt)
  } else if (nonNeutralPoses.length > 0) {
    const uniquePoses = new Set(nonNeutralPoses.map((character) => character.pose))
    if (uniquePoses.size === 1) {
      parts.push(
        `${nonNeutralPoses.length} subjects in ${getDirectorPoseConfig(nonNeutralPoses[0].pose).prompt}`
      )
    } else {
      parts.push('varied natural body poses')
    }
  }

  if (state.camera.followCharacterId) {
    const cameraPreset = getDirectorCameraOffsetPresetConfig(state.camera.offsetPreset)
    if (state.camera.bindMode === 'follow') {
      parts.push(cameraPreset.followPrompt)
    } else if (state.camera.bindMode === 'look-at') {
      parts.push(cameraPreset.lookAtPrompt)
    } else {
      parts.push('camera blocked around a lead subject')
    }
  }

  const adjustedPoseCount = state.characters.filter(
    (character) => Object.keys(character.boneAdjustments || {}).length > 0
  ).length
  if (adjustedPoseCount === 1) {
    parts.push('hand adjusted skeletal pose')
  } else if (adjustedPoseCount > 1) {
    parts.push(`${adjustedPoseCount} hand adjusted skeletal poses`)
  }

  const variants = new Set(state.characters.map((character) => character.variant))
  if (variants.size === 1 && state.characters.length > 0) {
    parts.push(getDirectorCharacterVariantConfig(state.characters[0].variant).prompt)
  } else if (variants.size > 1) {
    parts.push('male and female director mannequins')
  }

  if (count > 1) {
    const sorted = [...state.characters].sort((a, b) => a.z - b.z)
    const frontCount = sorted.filter((char) => char.z > -2).length
    const backCount = sorted.length - frontCount
    if (frontCount > 0 && backCount > 0) {
      parts.push(`${frontCount} in foreground, ${backCount} in background`)
    }
  }

  if (state.sceneAssets.length > 0) {
    const assetCounts = state.sceneAssets.reduce<Record<string, number>>((acc, asset) => {
      const prompt = getDirectorSceneAssetConfig(asset.preset).prompt
      acc[prompt] = (acc[prompt] || 0) + 1
      return acc
    }, {})
    parts.push(
      Object.entries(assetCounts)
        .map(([assetPrompt, total]) => (total > 1 ? `${total} ${assetPrompt}` : assetPrompt))
        .join(', ')
    )
  }

  return parts.join(', ')
}
