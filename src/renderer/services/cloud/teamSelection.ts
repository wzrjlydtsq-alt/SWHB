import { teamsApi } from './index'
import type { CloudTeam, TeamMember } from './types'

const CURRENT_TEAM_KEY = 'xh-writing-current-team-id'

export type CloudTeamOption = {
  id: number
  name: string
  role?: string
  memberCount: number
}

export type CloudTeamMember = {
  id: string
  name: string
  role: string
  avatarUrl: string | null
  isOnline?: boolean
  lastSeenAt?: string | null
}

export function readTruthyPresence(value: unknown): boolean {
  if (value === true || value === 1) return true
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return ['1', 'true', 'online', 'active', 'idle'].includes(normalized)
  }
  return false
}

export function isRecentlySeen(value: unknown, windowMs = 90_000): boolean {
  if (!value) return false
  const seenAt = new Date(String(value)).getTime()
  if (!Number.isFinite(seenAt)) return false
  return Date.now() - seenAt <= windowMs
}

export function isCloudMemberOnline(member: Partial<TeamMember>, currentUserId?: number | string | null): boolean {
  if (currentUserId && String(member.user_id) === String(currentUserId)) return true
  return (
    readTruthyPresence(member.is_online) ||
    readTruthyPresence(member.online) ||
    readTruthyPresence(member.presence) ||
    readTruthyPresence(member.status) ||
    isRecentlySeen(member.last_seen_at) ||
    isRecentlySeen(member.last_active_at) ||
    isRecentlySeen(member.updated_at, 45_000)
  )
}

function mapTeam(team: CloudTeam): CloudTeamOption {
  return {
    id: team.id,
    name: team.name,
    role: team.role,
    memberCount: team.member_count
  }
}

function mapMember(member: TeamMember): CloudTeamMember {
  return {
    id: String(member.user_id),
    name: member.nickname || `用户 ${member.user_id}`,
    role: member.role,
    avatarUrl: member.avatar_url,
    isOnline: isCloudMemberOnline(member),
    lastSeenAt: member.last_seen_at || member.last_active_at || null
  }
}

export function getStoredCloudTeamId(): number | null {
  try {
    const raw = localStorage.getItem(CURRENT_TEAM_KEY)
    const id = raw ? Number(raw) : 0
    return Number.isSafeInteger(id) && id > 0 ? id : null
  } catch {
    return null
  }
}

export function setStoredCloudTeamId(teamId: number): void {
  try {
    localStorage.setItem(CURRENT_TEAM_KEY, String(teamId))
    window.dispatchEvent(new CustomEvent('cloud-team-change', { detail: { teamId } }))
  } catch {}
}

export async function fetchCloudTeams(): Promise<CloudTeamOption[]> {
  const teams = await teamsApi.list()
  return teams.map(mapTeam)
}

export function resolveCurrentCloudTeam(teams: CloudTeamOption[]): CloudTeamOption | null {
  const storedId = getStoredCloudTeamId()
  return teams.find((team) => team.id === storedId) || teams[0] || null
}

export async function fetchCloudTeamMembers(teamId: number): Promise<CloudTeamMember[]> {
  const members = await teamsApi.getMembers(teamId)
  return members.map(mapMember)
}
