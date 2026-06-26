import { Sparkles, Zap } from '../../../utils/icons'
import { getPetStateLabel } from './PetStateMachine'
import type { PetState } from './petConfig'
import type { DragEvent } from 'react'
import './PetStage.css'

const stateBubble = {
  idle: '尾巴轻轻晃着',
  listening: '耳朵竖起来了',
  thinking: '正在整理灵感',
  typing: '爪子敲键盘中',
  happy: '收到你的互动啦'
}

export function PetStage({
  state,
  profile,
  onPatHead,
  onFeed,
  onDragEnter,
  onDragLeave,
  onDrop
}: {
  state: PetState
  profile: {
    level: number
    exp: number
    intimacy: number
    mood: number
    streakDays: number
  }
  onPatHead: () => void
  onFeed: () => void
  onDragEnter: (event: DragEvent<HTMLDivElement>) => void
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void
  onDrop: (event: DragEvent<HTMLDivElement>) => void
}) {
  const levelProgress = Math.max(0, Math.min(100, profile.exp || 0))

  return (
    <div
      className={`pet-stage pet-stage-${state} border-b border-[var(--border-color)]`}
      onDragEnter={onDragEnter}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="pet-orbit" aria-hidden="true" />
      <button className="pet-planet" onClick={onPatHead} title="轻触小星球">
        <span className="pet-planet-core">
          <span className="pet-planet-shine" />
          <span className="pet-planet-band" />
          <span className="pet-dot-eye pet-dot-eye-left" />
          <span className="pet-dot-eye pet-dot-eye-right" />
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">星河小猫</div>
            <div className="text-[11px] text-[var(--text-muted)]">
              {getPetStateLabel(state)} · {stateBubble[state]}
            </div>
          </div>
          <button
            onClick={onFeed}
            className="h-8 w-8 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] flex items-center justify-center"
            title="喂一点灵感"
          >
            <Zap size={15} />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] text-[var(--text-muted)]">
          <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-2 py-1">
            Lv.{profile.level}
            <div className="mt-1 h-1 rounded-full bg-black/20">
              <div
                className="h-full rounded-full bg-[var(--primary-color)]"
                style={{ width: `${levelProgress}%` }}
              />
            </div>
          </div>
          <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-2 py-1">
            亲密 {profile.intimacy}
          </div>
          <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-2 py-1">
            心情 {profile.mood}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
          <Sparkles size={12} />
          连续陪伴 {profile.streakDays || 1} 天
        </div>
      </div>
    </div>
  )
}
