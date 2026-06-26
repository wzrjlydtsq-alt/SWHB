/**
 * W12: 剧集制素材 Mock 数据
 *
 * 覆盖：剧项目 → 剧集 → 文本资产 → 分镜资产 → 媒体候选
 * W8/W9 UI 统一从这里取数据，后续接后端时平滑替换。
 */
import type {
  SeriesProject,
  SeriesEpisode,
  SeriesTextAsset,
  SeriesShotAsset,
  ShotMediaCandidate
} from './seriesTypes'

// ═══════════════════════════════════
//  辅助 — 分镜媒体候选
// ═══════════════════════════════════

function mockMedia(shotId: string, count: number, type: 'image' | 'video' = 'image'): ShotMediaCandidate[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${shotId}-media-${i + 1}`,
    shotId,
    type,
    url: `https://placehold.co/640x360/1a1a2e/e0e0ff?text=${type === 'image' ? 'Shot' : 'Video'}+${shotId.slice(-1)}-${i + 1}`,
    thumbUrl: `https://placehold.co/160x90/1a1a2e/e0e0ff?text=thumb`,
    creator: ['瑞凡', '小明', '晓雯', '志远'][i % 4],
    createdAt: `2026-05-0${1 + i}T10:00:00Z`,
    selected: i === 0
  }))
}

// ═══════════════════════════════════
//  辅助 — 文本资产
// ═══════════════════════════════════

function makeTextAssets(epId: string): SeriesTextAsset[] {
  return [
    {
      id: `${epId}-txt-script`,
      episodeId: epId,
      type: 'script',
      title: '剧本',
      content: `场景一  夜  室内  林晓家客厅\n\n林晓坐在窗边，手里攥着一张旧照片。\n\n林晓\n你真的回来了吗？\n\n（门外传来钥匙声）\n\n切至：\n\n场景二  夜  室外  楼道\n\n苏然站在门口，手里提着行李箱。\n\n苏然\n我回来了。\n`,
      lastModified: '2026-05-01T14:00:00Z'
    },
    {
      id: `${epId}-txt-worldview`,
      episodeId: epId,
      type: 'worldview',
      title: '世界观补充',
      content: '2042 年，地球气候异变后人类建立了地下城市网络。林晓和苏然在"星河城"相识。',
      lastModified: '2026-04-28T09:00:00Z'
    },
    {
      id: `${epId}-txt-inspiration`,
      episodeId: epId,
      type: 'inspiration',
      title: '灵感笔记',
      content: '参考《银翼杀手 2049》的色调和《她》的情感节奏。雨夜戏用蓝紫冷色调，重逢戏暖橙。',
      lastModified: '2026-04-25T16:00:00Z'
    },
    {
      id: `${epId}-txt-storyboard`,
      episodeId: epId,
      type: 'storyboard_text',
      title: '分镜文本稿',
      content: '镜头 1：全景，客厅，月光从窗户洒入。\n镜头 2：特写，林晓手中的照片。\n镜头 3：中景，门把手转动。\n镜头 4：双人中景，苏然出现在门口。',
      lastModified: '2026-05-02T11:00:00Z'
    }
  ]
}

// ═══════════════════════════════════
//  辅助 — 分镜资产
// ═══════════════════════════════════

function makeShots(epId: string): SeriesShotAsset[] {
  const shotsData = [
    {
      n: 1, desc: '全景，月光洒入客厅，林晓独坐窗边', cam: '全景', move: '静止',
      chars: ['林晓'], scene: '林晓家客厅', props: ['旧照片', '窗帘'],
      prompt: 'wide shot, moonlit living room, woman sitting by window, melancholic atmosphere, blue-purple tone',
      status: 'approved' as const, assignee: '志远'
    },
    {
      n: 2, desc: '特写，手中旧照片，照片上两人合影', cam: '特写', move: '缓慢推近',
      chars: ['林晓'], scene: '林晓家客厅', props: ['旧照片'],
      prompt: 'extreme close-up, weathered photograph in trembling hands, old couple photo, warm vintage filter',
      status: 'approved' as const, assignee: '小明'
    },
    {
      n: 3, desc: '中景，门把手缓缓转动，门缝透出走廊灯光', cam: '中景', move: '静止',
      chars: [], scene: '林晓家客厅', props: ['门把手'],
      prompt: 'medium shot, door handle slowly turning, warm corridor light through crack, suspenseful',
      status: 'in_progress' as const, assignee: '晓雯'
    },
    {
      n: 4, desc: '双人中景，苏然提着行李箱站在门口，与林晓对视', cam: '中景', move: '轻微手持晃动',
      chars: ['林晓', '苏然'], scene: '楼道 → 客厅', props: ['行李箱'],
      prompt: 'medium two-shot, man with suitcase at doorway facing woman, emotional reunion, warm orange backlight',
      status: 'draft' as const, assignee: '志远'
    },
    {
      n: 5, desc: '特写，林晓眼中泪光', cam: '特写', move: '慢速推近',
      chars: ['林晓'], scene: '林晓家客厅', props: [],
      prompt: 'extreme close-up, tear glistening in eye, bokeh background, emotional',
      status: 'review' as const, assignee: '小明'
    }
  ]

  return shotsData.map((s) => ({
    id: `${epId}-shot-${s.n}`,
    episodeId: epId,
    shotNumber: s.n,
    description: s.desc,
    cameraAngle: s.cam,
    cameraMovement: s.move,
    characters: s.chars,
    scene: s.scene,
    props: s.props,
    promptDraft: s.prompt,
    status: s.status,
    assignee: s.assignee,
    lastModified: `2026-05-0${s.n}T${10 + s.n}:00:00Z`,
    mediaCandidates: [
      ...mockMedia(`${epId}-shot-${s.n}`, s.status === 'approved' ? 3 : s.status === 'review' ? 2 : 1, 'image'),
      ...(s.n <= 2 ? mockMedia(`${epId}-shot-${s.n}`, 1, 'video') : [])
    ]
  }))
}

// ═══════════════════════════════════
//  剧集
// ═══════════════════════════════════

function makeEpisodes(seriesId: string, count: number): SeriesEpisode[] {
  const titles = [
    '重逢', '秘密', '裂痕', '风暴', '抉择',
    '黎明', '迷局', '真相', '归途', '终章',
    '序幕', '暗流'
  ]
  return Array.from({ length: count }, (_, i) => {
    const epId = `${seriesId}-ep-${i + 1}`
    const completed = i < 2
    const inProgress = i >= 2 && i < 4
    return {
      id: epId,
      seriesId,
      episodeNumber: i + 1,
      title: titles[i] || `第${i + 1}集`,
      synopsis: `第${i + 1}集剧情简介 — ${titles[i] || '待填写'}`,
      status: completed ? 'completed' as const : inProgress ? 'in_progress' as const : 'not_started' as const,
      assignee: ['瑞凡', '小明', '晓雯', '志远', '诗韵'][i % 5],
      lastModified: `2026-05-0${Math.min(i + 1, 6)}T08:00:00Z`,
      characters: i < 4 ? ['林晓', '苏然', '老陈'] : ['林晓', '苏然'],
      scenes: i < 3 ? ['客厅', '楼道', '咖啡馆'] : ['客厅', '街道'],
      props: ['旧照片', '行李箱'],
      textAssets: i < 4 ? makeTextAssets(epId) : [],
      shots: i < 3 ? makeShots(epId) : []
    }
  })
}

// ═══════════════════════════════════
//  剧项目
// ═══════════════════════════════════

export const MOCK_SERIES_PROJECTS: SeriesProject[] = [
  {
    id: 'series-1',
    title: '星河归途',
    genre: '科幻 / 情感',
    coverUrl: 'https://placehold.co/400x240/0d1b2a/e0e0ff?text=星河归途',
    synopsis: '2042 年，气候异变后的地下城市。林晓等待失踪三年的苏然归来，两人在星河城重逢后卷入更大的阴谋。',
    totalEpisodes: 12,
    completedEpisodes: 2,
    status: 'active',
    lastModified: '2026-05-05T18:00:00Z',
    characters: ['林晓', '苏然', '老陈', '方婷', '陆教授'],
    scenes: ['客厅', '楼道', '咖啡馆', '地下实验室', '星河广场', '废弃车站'],
    props: ['旧照片', '行李箱', '全息投影仪', '身份芯片', '旧日记本'],
    episodes: makeEpisodes('series-1', 12)
  },
  {
    id: 'series-2',
    title: '画中仙',
    genre: '古风 / 奇幻',
    coverUrl: 'https://placehold.co/400x240/1a0a2e/f0d0ff?text=画中仙',
    synopsis: '青年画师沈墨无意中画出了一个活人——画中女子自称来自千年前的仙境，需要沈墨帮她找到回去的路。',
    totalEpisodes: 8,
    completedEpisodes: 0,
    status: 'active',
    lastModified: '2026-04-30T12:00:00Z',
    characters: ['沈墨', '画中仙子', '师父', '柳掌柜'],
    scenes: ['画室', '古镇街巷', '仙境入口', '山间瀑布'],
    props: ['画卷', '毛笔', '灵石', '古琴'],
    episodes: makeEpisodes('series-2', 8)
  }
]

/** 按 ID 查找剧项目 */
export function findSeriesById(id: string): SeriesProject | undefined {
  return MOCK_SERIES_PROJECTS.find((s) => s.id === id)
}

/** 按 ID 查找某集 */
export function findEpisodeById(seriesId: string, episodeId: string): SeriesEpisode | undefined {
  const series = findSeriesById(seriesId)
  return series?.episodes.find((ep) => ep.id === episodeId)
}
