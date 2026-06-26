/**
 * 团队素材库 Mock 数据
 * 用于 UI 开发阶段，后续替换为真实 API 调用
 */
import type { CloudTeam, CloudAsset, TeamMember } from '../../services/cloud/types'

export const mockTeams: CloudTeam[] = [
  {
    id: 1,
    name: '灵境星河动画组',
    invite_code: 'XH2026A',
    owner_id: 1,
    member_count: 5,
    role: 'owner',
    created_at: '2026-04-01T08:00:00Z'
  },
  {
    id: 2,
    name: '场景设计部',
    invite_code: 'SC2026B',
    owner_id: 3,
    member_count: 3,
    role: 'member',
    created_at: '2026-04-15T10:00:00Z'
  }
]

export const mockMembers: TeamMember[] = [
  { user_id: 1, nickname: '瑞凡', avatar_url: null, role: 'owner', joined_at: '2026-04-01T08:00:00Z' },
  { user_id: 2, nickname: '小明', avatar_url: null, role: 'admin', joined_at: '2026-04-02T09:00:00Z' },
  { user_id: 3, nickname: '晓雯', avatar_url: null, role: 'member', joined_at: '2026-04-05T14:00:00Z' },
  { user_id: 4, nickname: '志远', avatar_url: null, role: 'member', joined_at: '2026-04-10T11:00:00Z' },
  { user_id: 5, nickname: '诗韵', avatar_url: null, role: 'viewer', joined_at: '2026-04-20T16:00:00Z' }
]

export const mockAssets: CloudAsset[] = [
  {
    id: 1, team_id: 1, uploader_id: 1, uploader_nickname: '瑞凡',
    name: '森林场景_主视角.png', asset_type: 'image', mime_type: 'image/png',
    file_size: 4_200_000, oss_key: 'teams/1/assets/abc123/original/forest.png',
    thumb_oss_key: null, thumb_url: null,
    width: 1920, height: 1080, duration_sec: null,
    tags: ['场景', '森林', '日景'], description: '第三集森林追逐戏主角视角',
    current_version: 2, status: 'active',
    created_at: '2026-04-25T10:00:00Z', updated_at: '2026-04-28T15:00:00Z'
  },
  {
    id: 2, team_id: 1, uploader_id: 2, uploader_nickname: '小明',
    name: '角色_小星球_行走.mp4', asset_type: 'video', mime_type: 'video/mp4',
    file_size: 18_500_000, oss_key: 'teams/1/assets/def456/original/walk.mp4',
    thumb_oss_key: null, thumb_url: null,
    width: 1280, height: 720, duration_sec: 5.2,
    tags: ['角色', '动画', '行走'], description: '小星球行走循环动画',
    current_version: 1, status: 'active',
    created_at: '2026-04-26T14:30:00Z', updated_at: '2026-04-26T14:30:00Z'
  },
  {
    id: 3, team_id: 1, uploader_id: 3, uploader_nickname: '晓雯',
    name: '配乐_主题曲_初稿.mp3', asset_type: 'audio', mime_type: 'audio/mpeg',
    file_size: 6_800_000, oss_key: 'teams/1/assets/ghi789/original/theme.mp3',
    thumb_oss_key: null, thumb_url: null,
    width: null, height: null, duration_sec: 180,
    tags: ['音乐', '主题曲'], description: '主题曲初稿，待确认节奏',
    current_version: 1, status: 'active',
    created_at: '2026-04-27T09:00:00Z', updated_at: '2026-04-27T09:00:00Z'
  },
  {
    id: 4, team_id: 1, uploader_id: 1, uploader_nickname: '瑞凡',
    name: '分镜脚本_第三集.pdf', asset_type: 'document', mime_type: 'application/pdf',
    file_size: 2_100_000, oss_key: 'teams/1/assets/jkl012/original/storyboard.pdf',
    thumb_oss_key: null, thumb_url: null,
    width: null, height: null, duration_sec: null,
    tags: ['分镜', '第三集'], description: null,
    current_version: 3, status: 'active',
    created_at: '2026-04-20T08:00:00Z', updated_at: '2026-04-29T11:00:00Z'
  },
  {
    id: 5, team_id: 1, uploader_id: 4, uploader_nickname: '志远',
    name: '城市夜景_远景.png', asset_type: 'image', mime_type: 'image/png',
    file_size: 5_600_000, oss_key: 'teams/1/assets/mno345/original/city_night.png',
    thumb_oss_key: null, thumb_url: null,
    width: 2560, height: 1440, duration_sec: null,
    tags: ['场景', '城市', '夜景'], description: '第五集城市远景 matte painting',
    current_version: 1, status: 'active',
    created_at: '2026-04-28T16:00:00Z', updated_at: '2026-04-28T16:00:00Z'
  },
  {
    id: 6, team_id: 1, uploader_id: 2, uploader_nickname: '小明',
    name: '特效_爆炸粒子.mp4', asset_type: 'video', mime_type: 'video/mp4',
    file_size: 32_000_000, oss_key: 'teams/1/assets/pqr678/original/explosion.mp4',
    thumb_oss_key: null, thumb_url: null,
    width: 1920, height: 1080, duration_sec: 3.5,
    tags: ['特效', '粒子', '爆炸'], description: null,
    current_version: 1, status: 'active',
    created_at: '2026-04-29T13:00:00Z', updated_at: '2026-04-29T13:00:00Z'
  }
]
