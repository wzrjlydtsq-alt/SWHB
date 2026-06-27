import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'

import femaleRiggedModelUrl from '../../assets/director/quaternius-female-rigged.gltf?url'
import maleRiggedModelUrl from '../../assets/director/quaternius-male-rigged.gltf?url'
import type { DirectorBoneAdjustments } from './useDirectorStore.ts'

const MODEL_URLS = {
  'male-casual': maleRiggedModelUrl,
  'female-casual': femaleRiggedModelUrl
}

const VARIANT_PROFILES = {
  'male-casual': {
    labelY: 1.95,
    modelScale: 1.04
  },
  'female-casual': {
    labelY: 1.9,
    modelScale: 1.02
  }
}

const POSE_RIGS = {
  neutral: {
    root: [0, 0, 0],
    spine: [0.02, 0, 0],
    head: [-0.04, 0, 0],
    leftArm: [0, 0, -0.95],
    rightArm: [0, 0, 0.95],
    leftForearm: [0, 0, -0.08],
    rightForearm: [0, 0, 0.08],
    leftLeg: [0, 0, 0.03],
    rightLeg: [0, 0, -0.03],
    leftCalf: [0.02, 0, 0],
    rightCalf: [0.02, 0, 0]
  },
  walk: {
    root: [0.04, 0, -0.04],
    spine: [0.08, 0, 0.03],
    head: [-0.03, 0, 0],
    leftArm: [-0.72, 0, -0.86],
    rightArm: [0.56, 0, 0.86],
    leftForearm: [-0.28, 0, -0.08],
    rightForearm: [-0.38, 0, 0.08],
    leftLeg: [0.58, 0, 0.04],
    rightLeg: [-0.52, 0, -0.04],
    leftCalf: [-0.36, 0, 0],
    rightCalf: [0.58, 0, 0],
    leftFoot: [0.14, 0, 0],
    rightFoot: [-0.1, 0, 0]
  },
  run: {
    root: [0.16, 0, -0.08],
    spine: [0.2, 0, -0.04],
    head: [-0.08, 0, 0],
    leftArm: [-1.05, 0, -0.78],
    rightArm: [0.92, 0, 0.78],
    leftForearm: [-0.72, 0, -0.08],
    rightForearm: [-0.82, 0, 0.08],
    leftLeg: [0.95, 0, 0.06],
    rightLeg: [-0.86, 0, -0.08],
    leftCalf: [-0.66, 0, 0],
    rightCalf: [0.96, 0, 0],
    leftFoot: [0.18, 0, 0],
    rightFoot: [-0.2, 0, 0]
  },
  talk: {
    root: [0.03, 0, 0.04],
    spine: [0.05, 0, 0.04],
    head: [-0.02, 0.12, 0],
    leftArm: [0.06, 0, -0.9],
    rightArm: [-0.68, -0.06, 0.7],
    leftForearm: [-0.2, 0, -0.08],
    rightForearm: [-0.72, 0, 0.12],
    leftLeg: [0.06, 0, 0.03],
    rightLeg: [-0.06, 0, -0.03],
    leftCalf: [0.08, 0, 0],
    rightCalf: [0.06, 0, 0]
  },
  point: {
    root: [0.04, 0, 0.07],
    spine: [0.04, 0, 0.06],
    head: [-0.02, 0.1, 0],
    leftArm: [0, 0, -0.95],
    rightArm: [-1.58, -0.08, 0.05],
    leftForearm: [-0.22, 0, -0.08],
    rightForearm: [0.1, 0, 0],
    leftLeg: [0.02, 0, 0.03],
    rightLeg: [-0.08, 0, -0.04],
    leftCalf: [0.05, 0, 0],
    rightCalf: [0.08, 0, 0]
  },
  alert: {
    root: [0.08, 0, -0.04],
    spine: [0.1, 0, -0.02],
    head: [-0.06, 0, 0],
    leftArm: [-0.45, 0, -0.75],
    rightArm: [-0.45, 0, 0.75],
    leftForearm: [-0.55, 0, -0.08],
    rightForearm: [-0.55, 0, 0.08],
    leftLeg: [0.16, 0, 0.06],
    rightLeg: [0.08, 0, -0.06],
    leftCalf: [-0.18, 0, 0],
    rightCalf: [-0.12, 0, 0]
  },
  'half-crouch': {
    root: [0.2, 0, 0],
    spine: [0.18, 0, 0],
    head: [-0.08, 0, 0],
    leftArm: [-0.32, 0, -0.84],
    rightArm: [-0.18, 0, 0.84],
    leftForearm: [-0.38, 0, -0.08],
    rightForearm: [-0.3, 0, 0.08],
    leftLeg: [-0.92, 0, 0.08],
    rightLeg: [-0.82, 0, -0.08],
    leftCalf: [1.08, 0, 0],
    rightCalf: [0.98, 0, 0],
    leftFoot: [-0.22, 0, 0],
    rightFoot: [-0.18, 0, 0]
  },
  sit: {
    root: [0.06, 0, 0],
    spine: [0.04, 0, 0],
    head: [-0.02, 0, 0],
    leftArm: [-0.22, 0, -0.82],
    rightArm: [-0.22, 0, 0.82],
    leftForearm: [-0.35, 0, -0.08],
    rightForearm: [-0.35, 0, 0.08],
    leftLeg: [-1.32, 0, 0.08],
    rightLeg: [-1.32, 0, -0.08],
    leftCalf: [1.45, 0, 0],
    rightCalf: [1.45, 0, 0],
    leftFoot: [-0.25, 0, 0],
    rightFoot: [-0.25, 0, 0]
  },
  kneel: {
    root: [0.16, 0, 0.04],
    spine: [0.14, 0, 0.03],
    head: [-0.06, 0, 0],
    leftArm: [-0.18, 0, -0.84],
    rightArm: [-0.2, 0, 0.84],
    leftForearm: [-0.3, 0, -0.08],
    rightForearm: [-0.3, 0, 0.08],
    leftLeg: [-1.35, 0, 0.08],
    rightLeg: [-0.2, 0, -0.06],
    leftCalf: [1.55, 0, 0],
    rightCalf: [0.18, 0, 0],
    leftFoot: [-0.22, 0, 0],
    rightFoot: [0, 0, 0]
  },
  'arms-crossed': {
    root: [0.02, 0, 0],
    spine: [0.04, 0, 0],
    head: [-0.02, 0, 0],
    leftArm: [-1.0, 0.12, 0.58],
    rightArm: [-1.0, -0.12, -0.58],
    leftForearm: [-0.16, 0, -0.68],
    rightForearm: [-0.16, 0, 0.68],
    leftLeg: [-0.03, 0, 0.03],
    rightLeg: [0.03, 0, -0.03],
    leftCalf: [0.04, 0, 0],
    rightCalf: [0.04, 0, 0]
  },
  'hands-up': {
    root: [-0.04, 0, 0],
    spine: [-0.05, 0, 0],
    head: [-0.12, 0, 0],
    leftArm: [-2.15, 0, -0.28],
    rightArm: [-2.15, 0, 0.28],
    leftForearm: [-0.2, 0, -0.06],
    rightForearm: [-0.2, 0, 0.06],
    leftLeg: [-0.04, 0, 0.04],
    rightLeg: [0.04, 0, -0.04],
    leftCalf: [0.04, 0, 0],
    rightCalf: [0.04, 0, 0]
  },
  lean: {
    root: [0.18, 0, -0.16],
    spine: [0.18, 0, -0.12],
    head: [-0.08, 0.06, 0.05],
    leftArm: [-0.12, 0, -0.98],
    rightArm: [-0.76, 0, 0.76],
    leftForearm: [-0.18, 0, -0.08],
    rightForearm: [-0.3, 0, 0.34],
    leftLeg: [-0.18, 0, 0.04],
    rightLeg: [0.2, 0, -0.04],
    leftCalf: [0.12, 0, 0],
    rightCalf: [0.08, 0, 0]
  },
  fall: {
    root: [1.45, 0, 0.34],
    spine: [0.2, 0, 0.08],
    head: [0.12, 0, 0],
    leftArm: [-0.4, 0, -0.5],
    rightArm: [0.42, 0, 0.42],
    leftForearm: [-0.28, 0, -0.12],
    rightForearm: [-0.22, 0, 0.12],
    leftLeg: [-0.34, 0, 0.12],
    rightLeg: [0.42, 0, -0.1],
    leftCalf: [0.46, 0, 0],
    rightCalf: [-0.34, 0, 0]
  }
}

const BONE_MAP = {
  root: ['root', 'pelvis'],
  spine: ['spine_01', 'spine_02', 'spine_03'],
  head: ['neck_01', 'Head'],
  leftArm: ['upperarm_l'],
  rightArm: ['upperarm_r'],
  leftForearm: ['lowerarm_l'],
  rightForearm: ['lowerarm_r'],
  leftHand: ['hand_l'],
  rightHand: ['hand_r'],
  leftLeg: ['thigh_l'],
  rightLeg: ['thigh_r'],
  leftCalf: ['calf_l', 'lowerleg_l'],
  rightCalf: ['calf_r', 'lowerleg_r'],
  leftFoot: ['foot_l'],
  rightFoot: ['foot_r']
}

function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function hexToRgb(hex) {
  const normalized = (hex || '#6ea8ff').replace('#', '')
  const safeHex =
    normalized.length === 3
      ? normalized
          .split('')
          .map((part) => `${part}${part}`)
          .join('')
      : normalized.padEnd(6, '0').slice(0, 6)

  return {
    r: parseInt(safeHex.slice(0, 2), 16),
    g: parseInt(safeHex.slice(2, 4), 16),
    b: parseInt(safeHex.slice(4, 6), 16)
  }
}

function mixColor(source, target, amount) {
  const from = hexToRgb(source)
  const to = hexToRgb(target)
  const t = Math.max(0, Math.min(1, amount))

  return `#${[from.r, from.g, from.b]
    .map((channel, index) => {
      const targetChannel = [to.r, to.g, to.b][index]
      return clampChannel(channel + (targetChannel - channel) * t)
        .toString(16)
        .padStart(2, '0')
    })
    .join('')}`
}

function DirectorLabel({ label, selected, y }) {
  if (!label) return null

  return (
    <group position={[0, y, 0]}>
      <mesh>
        <sphereGeometry args={[selected ? 0.045 : 0.036, 12, 8]} />
        <meshBasicMaterial color={selected ? '#67e8f9' : '#0b1220'} transparent opacity={0.9} />
      </mesh>
    </group>
  )
}

function SelectionBase({ color, selected }) {
  const selectionColor = selected ? '#67e8f9' : mixColor(color, '#06111f', 0.56)

  return (
    <>
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.36, 36]} />
        <meshBasicMaterial color={selectionColor} transparent opacity={selected ? 0.3 : 0.12} />
      </mesh>

      {selected && (
        <>
          <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.39, 0.45, 48]} />
            <meshBasicMaterial color="#67e8f9" transparent opacity={0.9} />
          </mesh>
          <mesh position={[0, 0.024, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.52, 0.535, 54]} />
            <meshBasicMaterial color="#fef08a" transparent opacity={0.55} />
          </mesh>
        </>
      )}
    </>
  )
}

function FallbackBody({ color, selected }) {
  return (
    <group position={[0, 0.88, 0]}>
      <mesh position={[0, 0.42, 0]}>
        <capsuleGeometry args={[0.18, 0.5, 8, 18]} />
        <meshStandardMaterial
          color={color}
          roughness={0.72}
          emissive={selected ? '#1d4ed8' : '#000000'}
        />
      </mesh>
      <mesh position={[0, 0.93, 0]}>
        <sphereGeometry args={[0.16, 18, 14]} />
        <meshStandardMaterial color={mixColor(color, '#ffffff', 0.1)} roughness={0.72} />
      </mesh>
    </group>
  )
}

function getMaterialColor(name, color, selected) {
  const lowerName = (name || '').toLowerCase()
  if (lowerName.includes('eye')) return '#f8fafc'
  if (lowerName.includes('hair') || lowerName.includes('eyebrow'))
    return mixColor(color, '#06111f', 0.58)
  return mixColor(color, selected ? '#ffffff' : '#8fb7ff', selected ? 0.14 : 0.06)
}

function buildBoneIndex(scene) {
  const bones = new Map()
  scene.traverse((object) => {
    if (object instanceof THREE.Bone) bones.set(object.name, object)
  })
  return bones
}

function applyBoneRotation(bones, rigKey, rotation) {
  const boneNames = BONE_MAP[rigKey]
  if (!boneNames || !rotation) return

  const rotationValues = Array.isArray(rotation)
    ? rotation
    : [rotation.x || 0, rotation.y || 0, rotation.z || 0]

  boneNames.forEach((boneName) => {
    const bone = bones.get(boneName)
    if (!bone) return

    const amount = rigKey === 'spine' || rigKey === 'head' ? 1 / boneNames.length : 1
    const delta = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        rotationValues[0] * amount,
        rotationValues[1] * amount,
        rotationValues[2] * amount,
        'XYZ'
      )
    )
    bone.quaternion.multiply(delta)
    bone.updateMatrixWorld(true)
  })
}

function applyPoseRig(scene, pose, boneAdjustments) {
  const rig = POSE_RIGS[pose] || POSE_RIGS.neutral
  const bones = buildBoneIndex(scene)

  Object.entries(BONE_MAP).forEach(([rigKey]) => {
    applyBoneRotation(bones, rigKey, rig[rigKey])
  })

  Object.entries(boneAdjustments || {}).forEach(([rigKey, rotation]) => {
    applyBoneRotation(bones, rigKey, rotation)
  })
}

function DirectorMannequinModel({ color, selected, variant, pose, boneAdjustments }) {
  const modelUrl = MODEL_URLS[variant] || maleRiggedModelUrl
  const gltf = useGLTF(modelUrl)
  const profile = VARIANT_PROFILES[variant] || VARIANT_PROFILES['male-casual']
  const boneAdjustmentsKey = JSON.stringify(boneAdjustments || {})

  const scene = useMemo(() => {
    const clonedScene = cloneSkeleton(gltf.scene)
    const materialCache = new Map()

    clonedScene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return

      object.castShadow = true
      object.receiveShadow = true

      const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material]
      const clonedMaterials = sourceMaterials.map((sourceMaterial) => {
        if (!sourceMaterial) return sourceMaterial
        const cacheKey = `${sourceMaterial.uuid}:${color}:${selected}`
        if (materialCache.has(cacheKey)) return materialCache.get(cacheKey)

        const nextMaterial = sourceMaterial.clone()
        nextMaterial.color = new THREE.Color(getMaterialColor(sourceMaterial.name, color, selected))
        nextMaterial.roughness = Math.min(0.92, nextMaterial.roughness ?? 0.78)
        nextMaterial.metalness = 0
        nextMaterial.emissive = new THREE.Color(
          selected ? mixColor(color, '#ffffff', 0.25) : '#000000'
        )
        nextMaterial.emissiveIntensity = selected ? 0.08 : 0
        materialCache.set(cacheKey, nextMaterial)
        return nextMaterial
      })

      object.material = Array.isArray(object.material) ? clonedMaterials : clonedMaterials[0]
    })

    applyPoseRig(clonedScene, pose, boneAdjustments)
    return clonedScene
  }, [boneAdjustments, boneAdjustmentsKey, color, gltf.scene, pose, selected])

  return (
    <group scale={profile.modelScale}>
      <primitive object={scene} />
    </group>
  )
}

useGLTF.preload(maleRiggedModelUrl)
useGLTF.preload(femaleRiggedModelUrl)

export function Mannequin({
  position,
  rotation = [0, 0, 0],
  color = '#6ea8ff',
  label = '',
  selected = false,
  scale = 1,
  pose = 'neutral',
  variant = 'male-casual',
  boneAdjustments = {} as DirectorBoneAdjustments
}: any) {
  const profile = VARIANT_PROFILES[variant] || VARIANT_PROFILES['male-casual']

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <SelectionBase color={color} selected={selected} />
      <DirectorLabel label={label} selected={selected} y={profile.labelY} />
      <DirectorMannequinModel
        color={color}
        selected={selected}
        variant={variant}
        pose={pose}
        boneAdjustments={boneAdjustments}
      />
    </group>
  )
}

export function MannequinFallback({
  position,
  rotation = [0, 0, 0],
  color = '#6ea8ff',
  label = '',
  selected = false,
  scale = 1,
  variant = 'male-casual'
}: any) {
  const profile = VARIANT_PROFILES[variant] || VARIANT_PROFILES['male-casual']

  return (
    <group position={position} rotation={rotation} scale={scale}>
      <SelectionBase color={color} selected={selected} />
      <DirectorLabel label={label} selected={selected} y={profile.labelY} />
      <FallbackBody color={color} selected={selected} />
    </group>
  )
}
