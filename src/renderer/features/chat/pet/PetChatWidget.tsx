import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { marked } from 'marked'
import {
  ChevronUp,
  Copy,
  MessageCircle,
  Mic,
  PackageOpen,
  Plus,
  Send,
  Shirt,
  Sparkles,
  Trash2,
  UploadCloud,
  X
} from 'lucide-react'

import { usePetCompanion } from './usePetCompanion'
import { PET_RADAR_EVENT, usePetTaskRadar } from './usePetTaskRadar'
import { getWardrobeItem, PET_UNLOCK_CHAR_STEP, PET_WARDROBE_ITEMS } from './petWardrobe'
import { useAppStore } from '../../../store/useAppStore'
import { useSpeechRecognitionInput } from '../../../hooks/useSpeechRecognitionInput'
import { canReadFileAsDataUrl, getXingheMediaSrc, isVideoUrl } from '../../../utils/fileHelpers'
import { assetsApi, CLOUD_AUTH_CHANGE_EVENT, getUserInfo, isLoggedIn, teamCanvasApi, teamsApi, transfersApi } from '../../../services/cloud'
import {
  fetchCloudTeamMembers,
  fetchCloudTeams,
  resolveCurrentCloudTeam,
  setStoredCloudTeamId,
  type CloudTeamMember,
  type CloudTeamOption
} from '../../../services/cloud/teamSelection'
import type { AssetType } from '../../../services/cloud/types'
import './PetChatWidget.css'

function cls(...parts) {
  return parts.filter(Boolean).join(' ')
}

const PET_TEXT_FIXES = [
  ['甯垜鐪嬩竴涓嬪垰鎵嶅け璐ョ殑浠诲姟鍘熷洜銆?', '帮我看一下刚才失败的任务原因。'],
  ['鏄熸渤鐞冪悆', '星河球球'],
  ['鏂板璇?', '新对话'],
  ['姝ｅ湪鎯?..', '正在思考...'],
  ['鍙屽嚮灏忔槦鐞冩墦寮€锛屽崟鍑诲揩閫熼棶', '双击小星球打开，单击快速问']
]

function normalizePetText(value) {
  let text = String(value ?? '')
  for (const [bad, good] of PET_TEXT_FIXES) {
    text = text.split(bad).join(good)
  }
  return text
}

const PET_POSITION_KEY = 'tapnow_pet_widget_position'
const CHAT_PANEL_POSITION_KEY = 'tapnow_pet_chat_panel_position'
const CHAT_PANEL_SIZE_KEY = 'tapnow_pet_chat_panel_size'
const TYPEWRITTEN_MESSAGE_IDS = new Set<string>()
const TEAM_PRESENCE_REFRESH_MS = 15000

function fileToChatFile(file: File) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result
      const fileExt = file.name.split('.').pop()?.toLowerCase() || ''
      const isImage = file.type.startsWith('image/')
      const isVideo = file.type.startsWith('video/')
      const isAudio = file.type.startsWith('audio/')
      const isPDF = file.type === 'application/pdf' || fileExt === 'pdf'
      const isDoc = ['doc', 'docx'].includes(fileExt) || file.type.includes('word')
      const isExcel =
        ['xls', 'xlsx'].includes(fileExt) ||
        file.type.includes('excel') ||
        file.type.includes('spreadsheet')
      const isCode = [
        'js',
        'jsx',
        'ts',
        'tsx',
        'py',
        'java',
        'cpp',
        'c',
        'html',
        'css',
        'json',
        'xml',
        'yaml',
        'yml',
        'md',
        'txt',
        'sh',
        'bash'
      ].includes(fileExt)

      resolve({
        name: file.name,
        type: file.type,
        content,
        isImage,
        isVideo,
        isAudio,
        isPDF,
        isDoc,
        isExcel,
        isCode,
        fileExt
      })
    }

    if (
      file.type.startsWith('image/') ||
      file.type.startsWith('video/') ||
      file.type.startsWith('audio/') ||
      file.type === 'application/pdf'
    ) {
      if (!canReadFileAsDataUrl(file, 'Pet chat attachment')) return
      reader.readAsDataURL(file)
    } else if (
      file.name.match(/\.(txt|md|js|jsx|ts|tsx|py|html|css|json|csv|xml|yaml|yml|sh|bash|java|cpp|c)$/i)
    ) {
      reader.readAsText(file)
    } else {
      if (!canReadFileAsDataUrl(file, 'Pet chat attachment')) return
      reader.readAsDataURL(file)
    }
  })
}

function isPetDeliverableFile(file: File) {
  return file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/')
}

function inferPetDeliveryAssetType(file: File): AssetType {
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  if (file.type.startsWith('image/')) return 'image'
  return 'other'
}

function inferFilenameFromUrl(url: string, fallbackType: string) {
  const clean = String(url || '').split('?')[0].split('#')[0]
  const last = decodeURIComponent(clean.split(/[/\\]/).pop() || '').trim()
  if (last && last.includes('.')) return last
  if (fallbackType.startsWith('video/')) return `video-${Date.now()}.mp4`
  if (fallbackType.startsWith('audio/')) return `audio-${Date.now()}.mp3`
  if (fallbackType.startsWith('image/')) return `image-${Date.now()}.png`
  return `asset-${Date.now()}`
}

function inferMimeFromAsset(assetPath: string, assetType = '') {
  const normalizedType = assetType.toLowerCase()
  const path = assetPath.toLowerCase().split('?')[0].split('#')[0]
  if (normalizedType.includes('/')) return normalizedType
  if (normalizedType === 'video' || isVideoUrl(assetPath) || /\.(mp4|webm|mov|ogg)$/i.test(path)) return 'video/mp4'
  if (normalizedType === 'audio' || /\.(mp3|wav|m4a|aac|flac)$/i.test(path)) return 'audio/mpeg'
  if (normalizedType === 'image' || /\.(png|jpe?g|webp|gif)$/i.test(path)) {
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg'
    if (path.endsWith('.webp')) return 'image/webp'
    if (path.endsWith('.gif')) return 'image/gif'
    return 'image/png'
  }
  return 'application/octet-stream'
}

async function assetPathToFile(assetPath: string, assetType = ''): Promise<File | null> {
  const source = assetPath?.trim()
  if (!source) return null
  const mime = inferMimeFromAsset(source, assetType)
  const response = await fetch(getXingheMediaSrc(source))
  if (!response.ok) throw new Error(`读取拖拽素材失败：HTTP ${response.status}`)
  const blob = await response.blob()
  const typedBlob = blob.type ? blob : new Blob([blob], { type: mime })
  return new File([typedBlob], inferFilenameFromUrl(source, typedBlob.type || mime), {
    type: typedBlob.type || mime
  })
}

function readableFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '0 KB'
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / 1024 / 1024).toFixed(size > 10 * 1024 * 1024 ? 0 : 1)} MB`
}

function getInitialPosition() {
  if (typeof window === 'undefined') return { x: 0, y: 0 }
  try {
    const saved = JSON.parse(window.localStorage.getItem(PET_POSITION_KEY) || 'null')
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) return saved
  } catch {}
  return {
    x: Math.max(16, window.innerWidth - 152),
    y: Math.max(16, window.innerHeight - 136)
  }
}

function clampPosition(position) {
  if (typeof window === 'undefined') return position
  const dockSize = 92
  return {
    x: Math.min(Math.max(6, position.x), Math.max(6, window.innerWidth - dockSize)),
    y: Math.min(Math.max(6, position.y), Math.max(6, window.innerHeight - dockSize))
  }
}

function getInitialChatPanelPosition() {
  if (typeof window === 'undefined') return { x: 0, y: 0 }
  try {
    const saved = JSON.parse(window.localStorage.getItem(CHAT_PANEL_POSITION_KEY) || 'null')
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) return saved
  } catch {}
  return {
    x: Math.max(16, window.innerWidth - 500),
    y: 38
  }
}

function clampChatPanelPosition(position) {
  if (typeof window === 'undefined') return position
  const savedSize = getInitialChatPanelSize()
  const panelWidth = Math.min(savedSize.width, window.innerWidth - 24)
  const panelHeight = Math.min(savedSize.height, window.innerHeight - 24)
  return {
    x: Math.min(Math.max(12, position.x), Math.max(12, window.innerWidth - panelWidth - 12)),
    y: Math.min(Math.max(12, position.y), Math.max(12, window.innerHeight - panelHeight - 12))
  }
}

function getInitialChatPanelSize() {
  if (typeof window === 'undefined') return { width: 440, height: 640 }
  try {
    const saved = JSON.parse(window.localStorage.getItem(CHAT_PANEL_SIZE_KEY) || 'null')
    if (saved && Number.isFinite(saved.width) && Number.isFinite(saved.height)) return saved
  } catch {}
  return {
    width: Math.min(460, Math.max(360, window.innerWidth - 80)),
    height: Math.min(660, Math.max(420, window.innerHeight - 120))
  }
}

function clampChatPanelSize(size) {
  if (typeof window === 'undefined') return size
  return {
    width: Math.min(Math.max(340, size.width), Math.max(340, window.innerWidth - 24)),
    height: Math.min(Math.max(380, size.height), Math.max(380, window.innerHeight - 24))
  }
}

function PetAvatar({ profile, petState, reaction, badgeCount = 0 }) {
  const skin = getWardrobeItem(profile.equippedSkinId) || PET_WARDROBE_ITEMS[0]

  return (
    <button
      className={cls('pet-orb-shell', skin?.spriteClass, `is-${petState}`)}
      style={{ '--pet-glow': skin?.glow } as CSSProperties}
      aria-label="打开小助手 AI"
      type="button"
      tabIndex={-1}
    >
      <span className={cls('pet-reaction-burst', reaction && `is-${reaction}`)}>
        <b />
        <b />
        <b />
      </span>
      <span className="petdex-motion" aria-hidden="true">
        <span className="petdex-sprite" />
      </span>
      <span className="pet-sprout" aria-hidden="true">
        <i />
        <i />
      </span>
      <span className="pet-orb">
        <span className="pet-orb-shine" />
        <span className="pet-orb-ripple pet-orb-ripple-one" />
        <span className="pet-orb-ripple pet-orb-ripple-two" />
        <span className="pet-face pet-face-dot">
          <i />
          <i />
        </span>
      </span>
      <span className="pet-bot-body" aria-hidden="true" />
      <span className="pet-laptop" aria-hidden="true">
        <i />
        <b />
      </span>
      {badgeCount > 0 ? <span className="pet-task-badge">{badgeCount > 99 ? '99+' : badgeCount}</span> : null}
    </button>
  )
}

function getRemotePetSkinId(member: CloudTeamMember, index: number) {
  const numericId = Number(member.id)
  const seed = Number.isFinite(numericId) ? numericId : index
  return PET_WARDROBE_ITEMS[Math.abs(seed + index) % PET_WARDROBE_ITEMS.length]?.id || PET_WARDROBE_ITEMS[0]?.id
}

function getRemotePetPosition(basePosition, index: number) {
  if (typeof window === 'undefined') return basePosition
  const spacing = 78
  const dockSize = 82
  const placeLeft = basePosition.x > window.innerWidth / 2
  const rawX = placeLeft ? basePosition.x - spacing * (index + 1) : basePosition.x + spacing * (index + 1)
  const rawY = basePosition.y + ((index % 3) - 1) * 10
  return {
    x: Math.min(Math.max(6, rawX), Math.max(6, window.innerWidth - dockSize)),
    y: Math.min(Math.max(6, rawY), Math.max(6, window.innerHeight - dockSize))
  }
}

function MessageBubble({ message, shouldTypewrite = false, onTypeStep }) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  const fullContent = normalizePetText(message.content || '')
  const canTypewrite = !isUser && !message.isError && shouldTypewrite
  const [visibleContent, setVisibleContent] = useState(() =>
    canTypewrite && !TYPEWRITTEN_MESSAGE_IDS.has(message.id) ? '' : fullContent
  )

  useEffect(() => {
    if (!canTypewrite || TYPEWRITTEN_MESSAGE_IDS.has(message.id)) {
      setVisibleContent(fullContent)
      return
    }

    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      TYPEWRITTEN_MESSAGE_IDS.add(message.id)
      setVisibleContent(fullContent)
      return
    }

    let index = 0
    const step = Math.max(1, Math.ceil(fullContent.length / 90))
    const timer = window.setInterval(() => {
      index = Math.min(fullContent.length, index + step)
      setVisibleContent(fullContent.slice(0, index))
      onTypeStep?.()

      if (index >= fullContent.length) {
        TYPEWRITTEN_MESSAGE_IDS.add(message.id)
        window.clearInterval(timer)
      }
    }, 22)

    return () => window.clearInterval(timer)
  }, [canTypewrite, fullContent, message.id, onTypeStep])

  const html = useMemo(
    () => (isUser ? '' : marked.parse(visibleContent || '')),
    [isUser, visibleContent]
  )

  const copyMessage = async () => {
    const text = normalizePetText(message.content || '')
    if (!text.trim()) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch (error) {
      console.error('Copy assistant message failed', error)
    }
  }

  const handleContextMenu = async (event) => {
    if (isUser) return
    event.preventDefault()
    await copyMessage()
  }

  return (
    <div className={cls('pet-message-row', isUser ? 'is-user' : 'is-assistant')}>
      <div
        className={cls('pet-message-bubble', !isUser && 'can-copy', message.isError && 'is-error')}
        title={isUser ? undefined : '右键复制这条回复'}
        onContextMenu={handleContextMenu}
      >
        {isUser ? (
          <span>{fullContent}</span>
        ) : (
          <div
            className={cls(
              'pet-message-markdown',
              canTypewrite && visibleContent.length < fullContent.length && 'is-typewriting'
            )}
            dangerouslySetInnerHTML={{ __html: html as string }}
          />
        )}
      </div>
      {!isUser ? (
        <button
          className={cls('pet-message-copy', copied && 'copied')}
          onClick={copyMessage}
          type="button"
          title={copied ? '已复制' : '复制这条回复'}
          aria-label={copied ? '已复制' : '复制这条回复'}
        >
          <Copy size={14} />
          <span>{copied ? '已复制' : ''}</span>
        </button>
      ) : null}
    </div>
  )
}

function getSpeechButtonTitle(speech) {
  if (!speech.supported) return '\u5f53\u524d\u73af\u5883\u4e0d\u652f\u6301\u8bed\u97f3\u8bc6\u522b'
  if (speech.isProcessing) return '\u6b63\u5728\u8bc6\u522b\u8bed\u97f3...'
  if (speech.isListening) return '\u6b63\u5728\u5f55\u97f3\uff0c\u518d\u70b9\u4e00\u6b21\u7ed3\u675f\u5e76\u8bc6\u522b'
  if (speech.error === 'speech-api-missing') return '\u8bf7\u5148\u5728\u6a21\u578b\u63a5\u53e3\u914d\u7f6e\u91cc\u8bbe\u7f6e\u6587\u672c\u7ec4 API Key'
  if (speech.error === 'speech-permission-denied') return '\u9ea6\u514b\u98ce\u6743\u9650\u88ab\u62d2\u7edd\uff0c\u8bf7\u5728\u7cfb\u7edf\u9690\u79c1\u8bbe\u7f6e\u91cc\u5141\u8bb8'
  if (speech.error) return '\u8bed\u97f3\u8bc6\u522b\u5931\u8d25\uff0c\u8bf7\u518d\u8bd5\u4e00\u6b21'
  return '\u70b9\u51fb\u5f00\u59cb\u8bed\u97f3\u8f93\u5165'
}

function QuickInput({ value, onChange, onSend, sending, speech }) {
  return (
    <form className="pet-quick-input" onSubmit={onSend}>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="悄悄问小助手..."
        disabled={sending}
      />
      <button
        type="button"
        className={cls('pet-speech-button', (speech.isListening || speech.isProcessing) && 'is-listening')}
        onClick={speech.toggle}
        disabled={sending || speech.isProcessing || !speech.supported}
        aria-label={getSpeechButtonTitle(speech)}
        title={getSpeechButtonTitle(speech)}
      >
        <Mic size={15} />
      </button>
      <button type="submit" disabled={sending || !value.trim()} aria-label="发送">
        <Send size={15} />
      </button>
    </form>
  )
}

function BasketPanel({ profile, actions }) {
  const equippedSkinId = getWardrobeItem(profile.equippedSkinId)?.id || PET_WARDROBE_ITEMS[0]?.id

  return (
    <div className="pet-basket-panel pet-skins-only-panel">
      <div className="pet-skin-panel-title">
        <Shirt size={14} />
        <span>皮肤</span>
      </div>
      <div className="pet-wardrobe-list">
        {PET_WARDROBE_ITEMS.map((item) => {
          const equipped = equippedSkinId === item.id
          return (
            <button
              className={cls('pet-wardrobe-item', equipped && 'is-equipped')}
              key={item.id}
              onClick={() => actions.equipItem(item)}
              type="button"
              title={item.name}
            >
              <span className={cls('pet-wardrobe-preview', item.previewClass)} />
              <small>{item.name}</small>
            </button>
          )
        })}
      </div>
    </div>
  )

}
function PetDeliveryPanel({ files, onClose, onDelivered }) {
  const [teams, setTeams] = useState<CloudTeamOption[]>([])
  const [members, setMembers] = useState<CloudTeamMember[]>([])
  const [teamId, setTeamId] = useState('')
  const [receiverId, setReceiverId] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const currentUserId = String(getUserInfo()?.id || '')

  useEffect(() => {
    let alive = true
    const load = async () => {
      if (!isLoggedIn()) {
        setError('请先登录云端账号，再使用投递功能')
        setLoading(false)
        return
      }
      try {
        setLoading(true)
        const nextTeams = await fetchCloudTeams()
        if (!alive) return
        setTeams(nextTeams)
        const activeTeam = resolveCurrentCloudTeam(nextTeams)
        if (!activeTeam) {
          setError('当前账号还没有可投递的团队')
          return
        }
        setTeamId(String(activeTeam.id))
        setStoredCloudTeamId(activeTeam.id)
        const nextMembers = await fetchCloudTeamMembers(activeTeam.id)
        if (!alive) return
        setMembers(nextMembers)
        const firstReceiver = nextMembers.find((member) => String(member.id) !== currentUserId) || nextMembers[0]
        setReceiverId(firstReceiver?.id || '')
      } catch (loadError: any) {
        setError(loadError?.message || '加载团队成员失败')
      } finally {
        if (alive) setLoading(false)
      }
    }
    void load()
    return () => {
      alive = false
    }
  }, [currentUserId])

  const handleTeamChange = async (nextTeamId: string) => {
    setTeamId(nextTeamId)
    setReceiverId('')
    setMembers([])
    setError('')
    const numericTeamId = Number(nextTeamId)
    if (!numericTeamId) return
    try {
      setLoading(true)
      setStoredCloudTeamId(numericTeamId)
      const nextMembers = await fetchCloudTeamMembers(numericTeamId)
      setMembers(nextMembers)
      const firstReceiver = nextMembers.find((member) => String(member.id) !== currentUserId) || nextMembers[0]
      setReceiverId(firstReceiver?.id || '')
    } catch (teamError: any) {
      setError(teamError?.message || '切换团队失败')
    } finally {
      setLoading(false)
    }
  }

  const deliverFiles = async () => {
    const numericTeamId = Number(teamId)
    const numericReceiverId = Number(receiverId)
    if (!numericTeamId || !numericReceiverId || files.length === 0 || sending) return
    if (String(numericReceiverId) === currentUserId) {
      setError('不能投递给自己，请换一个成员')
      return
    }

    setSending(true)
    setError('')
    try {
      window.dispatchEvent(new CustomEvent(PET_RADAR_EVENT, {
        detail: { type: 'cloudSync', message: `正在投递 ${files.length} 个素材` }
      }))

      for (const file of files) {
        const contentType = file.type || 'application/octet-stream'
        const signed = await assetsApi.getUploadUrl(numericTeamId, {
          filename: file.name,
          content_type: contentType,
          file_size: file.size
        })
        const uploadResp = await fetch(signed.upload_url, {
          method: signed.method || 'PUT',
          headers: signed.headers || { 'Content-Type': contentType },
          body: file
        })
        if (!uploadResp.ok) {
          throw new Error(`上传 ${file.name} 失败：${uploadResp.status}`)
        }
        const asset = await assetsApi.create(numericTeamId, {
          name: file.name,
          asset_type: inferPetDeliveryAssetType(file),
          mime_type: contentType,
          file_size: file.size,
          oss_key: signed.oss_key,
          tags: ['pet-delivery'],
          description: message || '由小助手投递'
        })
        await transfersApi.send(numericTeamId, {
          asset_id: asset.id,
          receiver_id: numericReceiverId,
          message: message || undefined
        })
      }

      onDelivered?.(files.length)
      onClose()
    } catch (deliverError: any) {
      const text = deliverError?.message || '投递失败'
      setError(text)
      window.dispatchEvent(new CustomEvent(PET_RADAR_EVENT, {
        detail: { type: 'cloudUploadFailed', error: text }
      }))
    } finally {
      setSending(false)
    }
  }

  const selectedTeam = teams.find((team) => String(team.id) === teamId)
  const receiverOptions = members.filter((member) => String(member.id) !== currentUserId)

  return (
    <div className="pet-delivery-panel" onPointerDown={(event) => event.stopPropagation()}>
      <header>
        <div>
          <strong>投递素材</strong>
          <span>{files.length} 个文件会先上传团队云素材，再发给成员</span>
        </div>
        <button onClick={onClose} type="button" aria-label="关闭投递面板">
          <X size={15} />
        </button>
      </header>

      <div className="pet-delivery-files">
        {files.slice(0, 4).map((file) => (
          <span key={`${file.name}-${file.size}`}>
            {file.name}
            <small>{readableFileSize(file.size)}</small>
          </span>
        ))}
        {files.length > 4 ? <span>+{files.length - 4}</span> : null}
      </div>

      <label>
        团队
        <select value={teamId} disabled={loading || sending} onChange={(event) => void handleTeamChange(event.target.value)}>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>{team.name}</option>
          ))}
        </select>
      </label>

      <label>
        接收人
        <select value={receiverId} disabled={loading || sending || receiverOptions.length === 0} onChange={(event) => setReceiverId(event.target.value)}>
          {receiverOptions.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name} / {member.role || '成员'}
            </option>
          ))}
        </select>
      </label>

      <label>
        留言
        <textarea
          value={message}
          maxLength={120}
          disabled={sending}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="可选：告诉对方这个素材用在哪里"
        />
      </label>

      {error ? <div className="pet-delivery-error">{error}</div> : null}
      <button
        className="pet-delivery-submit"
        type="button"
        disabled={loading || sending || !selectedTeam || !receiverId}
        onClick={deliverFiles}
      >
        <UploadCloud size={15} />
        {sending ? '正在投递...' : '发送给对方资产库'}
      </button>
    </div>
  )
}

function ModelPicker({ chatModel, setChatModel, chatModels }) {
  const [open, setOpen] = useState(false)
  const activeModel =
    chatModels.find((config) => config.id === chatModel) ||
    chatModels[0] || {
      id: chatModel,
      provider: '',
      modelName: chatModel
    }
  const label = activeModel.provider || activeModel.modelName || activeModel.id

  return (
    <div className="pet-model-picker">
      <button type="button" onClick={() => setOpen((value) => !value)}>
        <span>{label}</span>
        <i>⌄</i>
      </button>
      {open ? (
        <div className="pet-model-options">
          {chatModels.map((config) => {
            const optionLabel = config.provider || config.modelName || config.id
            return (
              <button
                className={config.id === chatModel ? 'active' : ''}
                key={config.id}
                onClick={() => {
                  setChatModel(config.id)
                  setOpen(false)
                }}
                type="button"
              >
                {optionLabel}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function ChatHistoryPicker({
  chatSessions,
  currentChatId,
  setCurrentChatId,
  deleteChatSession
}) {
  const [open, setOpen] = useState(false)
  const activeSession =
    chatSessions.find((session) => session.id === currentChatId) || chatSessions[0]
  const label = normalizePetText(activeSession?.title || '新对话')

  const selectSession = (sessionId) => {
    setCurrentChatId(sessionId)
    setOpen(false)
  }

  return (
    <div className="pet-history-picker">
      <button type="button" onClick={() => setOpen((value) => !value)} title={label}>
        <MessageCircle size={13} />
        <span>{label}</span>
        <i>⌄</i>
      </button>
      {open ? (
        <div className="pet-history-options">
          {chatSessions.map((session) => (
            <div
              className={session.id === currentChatId ? 'active' : ''}
              key={session.id}
            >
              <button onClick={() => selectSession(session.id)} type="button">
                <strong>{normalizePetText(session.title || '新对话')}</strong>
                <small>{session.messages?.length || 0} 条消息</small>
              </button>
              <button
                className="pet-history-delete"
                onClick={(event) => deleteChatSession(event, session.id)}
                type="button"
                aria-label="删除历史对话"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function PetChatWidget({
  theme,
  apiConfigs,
  isChatOpen,
  setIsChatOpen,
  chatModel,
  setChatModel,
  chatSessions = [],
  currentChatId,
  setCurrentChatId,
  deleteChatSession,
  currentSession,
  chatInput,
  setChatInput,
  chatFiles,
  setChatFiles,
  handleChatFileUpload,
  removeChatFile,
  sendChatMessage,
  isChatSending,
  chatEndRef,
  createNewChat
}) {
  const [quickOpen, setQuickOpen] = useState(false)
  const [basketOpen, setBasketOpen] = useState(false)
  const [petMenuOpen, setPetMenuOpen] = useState(false)
  const [deliveryOpen, setDeliveryOpen] = useState(false)
  const [deliveryFiles, setDeliveryFiles] = useState<File[]>([])
  const [isReplyTyping, setIsReplyTyping] = useState(false)
  const [reaction, setReaction] = useState('')
  const [position, setPosition] = useState(getInitialPosition)
  const [chatPanelPosition, setChatPanelPosition] = useState(getInitialChatPanelPosition)
  const [chatPanelSize, setChatPanelSize] = useState(getInitialChatPanelSize)
  const [isDragging, setIsDragging] = useState(false)
  const [isDropActive, setIsDropActive] = useState(false)
  const [isChatPanelDragging, setIsChatPanelDragging] = useState(false)
  const [isChatPanelResizing, setIsChatPanelResizing] = useState(false)
  const dragRef = useRef(null)
  const chatPanelDragRef = useRef(null)
  const chatPanelResizeRef = useRef(null)
  const chatFileInputRef = useRef<HTMLInputElement | null>(null)
  const incomingTransferIdsRef = useRef<Set<number> | null>(null)
  const reactionTimersRef = useRef<number[]>([])
  const movedRef = useRef(false)
  const messages = currentSession?.messages || []
  const latestAssistantId = [...messages].reverse().find((message) => message.role === 'assistant')?.id
  const handleTypeStep = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ block: 'end' })
  }, [chatEndRef])
  const pet = usePetCompanion({
    isChatSending,
    chatInput,
    isReplyTyping,
    isDragActive: isDragging || isDropActive
  })
  const radar = usePetTaskRadar({ disabled: false })
  const displayPetState = isDragging || isDropActive
    ? 'dragging'
    : radar.stateOverride || pet.petState
  const [cloudUser, setCloudUser] = useState(getUserInfo)
  const [onlineTeamMembers, setOnlineTeamMembers] = useState<CloudTeamMember[]>([])
  const [activeTeamId, setActiveTeamId] = useState<number | null>(null)
  const employeeName = cloudUser?.nickname || cloudUser?.email || cloudUser?.phone || ''
  const currentUserId = String(cloudUser?.id || '')
  const remoteOnlineMembers = onlineTeamMembers.filter(
    (member) => member.isOnline && String(member.id) !== currentUserId
  )
  const speech = useSpeechRecognitionInput({
    value: chatInput,
    onChange: setChatInput,
    disabled: isChatSending
  })

  useEffect(() => {
    const refreshCloudUser = () => setCloudUser(getUserInfo())
    window.addEventListener(CLOUD_AUTH_CHANGE_EVENT, refreshCloudUser)
    window.addEventListener('storage', refreshCloudUser)
    return () => {
      window.removeEventListener(CLOUD_AUTH_CHANGE_EVENT, refreshCloudUser)
      window.removeEventListener('storage', refreshCloudUser)
    }
  }, [])

  useEffect(() => {
    if (!cloudUser || !isLoggedIn()) {
      setOnlineTeamMembers([])
      return
    }
    let alive = true
    let timer: number | null = null

    const syncTeamPresence = async () => {
      try {
        const teams = await fetchCloudTeams()
        const activeTeam = resolveCurrentCloudTeam(teams)
        if (!activeTeam) {
          if (alive) {
            setActiveTeamId(null)
            setOnlineTeamMembers([])
          }
          return
        }
        await teamsApi.updatePresence(activeTeam.id).catch(() => {})
        const members = await fetchCloudTeamMembers(activeTeam.id)
        if (alive) {
          setActiveTeamId(activeTeam.id)
          setOnlineTeamMembers(members)
        }
      } catch {
        if (alive) {
          setActiveTeamId(null)
          setOnlineTeamMembers([])
        }
      }
    }

    const handleTeamChange = () => void syncTeamPresence()
    void syncTeamPresence()
    timer = window.setInterval(syncTeamPresence, TEAM_PRESENCE_REFRESH_MS)
    window.addEventListener('cloud-team-change', handleTeamChange)
    return () => {
      alive = false
      if (timer) window.clearInterval(timer)
      window.removeEventListener('cloud-team-change', handleTeamChange)
    }
  }, [cloudUser?.id])

  useEffect(() => {
    incomingTransferIdsRef.current = null
    if (!cloudUser || !isLoggedIn()) return
    let alive = true
    let timer: number | null = null

    const pollIncomingTransfers = async () => {
      try {
        const data = await transfersApi.received({ status: 'pending', page: 1, page_size: 20 })
        if (!alive) return
        const items = data.items || []
        const ids = new Set(items.map((item) => item.id))
        const previousIds = incomingTransferIdsRef.current
        if (!previousIds) {
          incomingTransferIdsRef.current = ids
          if (items.length > 0) {
            radar.pushNotice({
              text: `你有 ${items.length} 个素材待接收`,
              tone: 'cloud',
              state: 'cloudNotice',
              action: 'openCloud'
            }, 6200)
          }
          return
        }
        const nextItem = items.find((item) => !previousIds.has(item.id))
        incomingTransferIdsRef.current = ids
        if (nextItem) {
          const sender = nextItem.sender?.nickname || '团队成员'
          const assetName = nextItem.asset?.name || nextItem.asset_name || '素材'
          radar.pushNotice({
            text: `${sender} 给你投递了 ${assetName}`,
            tone: 'cloud',
            state: 'cloudNotice',
            action: 'openCloud'
          }, 7200)
        }
      } catch {
        // Keep quiet when cloud auth or network is temporarily unavailable.
      }
    }

    void pollIncomingTransfers()
    timer = window.setInterval(pollIncomingTransfers, 60000)
    return () => {
      alive = false
      if (timer) window.clearInterval(timer)
    }
  }, [cloudUser?.id])

  useEffect(() => {
    if (!isChatSending && messages[messages.length - 1]?.role === 'assistant') {
      setIsReplyTyping(true)
      const timer = window.setTimeout(() => {
        setIsReplyTyping(false)
        pet.actions.recordAssistantReply()
      }, 900)
      return () => window.clearTimeout(timer)
    }
  }, [isChatSending, messages.length])

  useEffect(() => {
    if (isChatOpen) {
      window.setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
    }
  }, [isChatOpen, messages.length, chatEndRef])

  useEffect(() => {
    const next = clampPosition(position)
    if (next.x !== position.x || next.y !== position.y) setPosition(next)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(PET_POSITION_KEY, JSON.stringify(position))
  }, [position])

  useEffect(() => {
    const next = clampChatPanelPosition(chatPanelPosition)
    if (next.x !== chatPanelPosition.x || next.y !== chatPanelPosition.y) {
      setChatPanelPosition(next)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(CHAT_PANEL_POSITION_KEY, JSON.stringify(chatPanelPosition))
  }, [chatPanelPosition])

  useEffect(() => {
    const next = clampChatPanelSize(chatPanelSize)
    if (next.width !== chatPanelSize.width || next.height !== chatPanelSize.height) {
      setChatPanelSize(next)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(CHAT_PANEL_SIZE_KEY, JSON.stringify(chatPanelSize))
    setChatPanelPosition((prev) => clampChatPanelPosition(prev))
  }, [chatPanelSize])

  const playReaction = (name) => {
    for (const timer of reactionTimersRef.current) window.clearTimeout(timer)
    reactionTimersRef.current = []
    setReaction('')
    reactionTimersRef.current.push(window.setTimeout(() => setReaction(name), 20))
    reactionTimersRef.current.push(window.setTimeout(() => setReaction(''), 900))
  }

  useEffect(() => {
    return () => {
      for (const timer of reactionTimersRef.current) window.clearTimeout(timer)
      reactionTimersRef.current = []
    }
  }, [])

  useEffect(() => {
    const fixed = normalizePetText(chatInput)
    if (fixed !== chatInput) setChatInput(fixed)
  }, [chatInput, setChatInput])

  const submitMessage = async (event) => {
    event?.preventDefault?.()
    const text = normalizePetText(chatInput).trim()
    if ((!text && chatFiles.length === 0) || isChatSending) return
    pet.actions.recordInputChars(text)
    pet.actions.recordChatSent()
    playReaction('send')
    setQuickOpen(false)
    await sendChatMessage(text, { autoFallback: true })
  }

  const handleCreateNewChat = (event) => {
    event?.stopPropagation?.()
    setChatInput('')
    setChatFiles?.([])
    createNewChat()
    setIsChatOpen(true)
    setQuickOpen(false)
    setBasketOpen(false)
  }

  const handleRadarBubbleClick = (event) => {
    event.stopPropagation()
    if (radar.notice?.action === 'openCloud') {
      useAppStore.getState().setCloudAssetsOpen?.(true)
      radar.clearNotice()
      playReaction('open')
      return
    }

    if (radar.notice?.action === 'openChat') {
      const detail = radar.notice?.detail ? `\n\n${radar.notice.detail}` : ''
      setIsChatOpen(true)
      setQuickOpen(false)
      setBasketOpen(false)
      setChatInput((prev) => prev || `帮我看一下刚才失败的任务原因。${detail}`)
      radar.clearNotice()
      playReaction('open')
    }
  }

  const handlePetDragOver = (event) => {
    if (!event.dataTransfer) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    if (!isDropActive) {
      setIsDropActive(true)
      pet.actions.cheerDrop()
      playReaction('drag')
    }
  }

  const handlePetDragLeave = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDropActive(false)
    }
  }

  const handlePetDrop = async (event) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDropActive(false)
    setQuickOpen(false)
    setBasketOpen(false)
    pet.actions.feed()
    playReaction('feed')

    const files = Array.from(event.dataTransfer?.files || [])
    const draggedAssetPath = event.dataTransfer?.getData('asset-path')?.trim()
    const draggedAssetType = event.dataTransfer?.getData('asset-type')?.trim()
    let deliverableFiles = files.filter((file) => isPetDeliverableFile(file as File)) as File[]
    const chatOnlyFiles = files.filter((file) => !isPetDeliverableFile(file as File)) as File[]

    if (deliverableFiles.length === 0 && draggedAssetPath) {
      try {
        const draggedFile = await assetPathToFile(draggedAssetPath, draggedAssetType)
        if (draggedFile && isPetDeliverableFile(draggedFile)) {
          deliverableFiles = [draggedFile]
        }
      } catch (error: any) {
        window.dispatchEvent(new CustomEvent(PET_RADAR_EVENT, {
          detail: { type: 'cloudUploadFailed', error: error?.message || '读取拖拽素材失败' }
        }))
      }
    }

    if (deliverableFiles.length > 0) {
      setDeliveryFiles(deliverableFiles)
      setDeliveryOpen(true)
      setIsChatOpen(false)
      window.dispatchEvent(new CustomEvent(PET_RADAR_EVENT, {
        detail: { type: 'cloudSync', message: `选个成员，我就把 ${deliverableFiles.length} 个素材送过去` }
      }))
    }

    if (chatOnlyFiles.length > 0) {
      setIsChatOpen(true)
      const chatFilePayloads = await Promise.all(chatOnlyFiles.map((file) => fileToChatFile(file)))
      setChatFiles?.((prev) => [...prev, ...chatFilePayloads])
    }

    if (deliverableFiles.length > 0) return

    const droppedText = event.dataTransfer?.getData('text/plain')?.trim()
    if (droppedText) {
      setIsChatOpen(true)
      setChatInput((prev) => (prev.trim() ? `${prev}\n${droppedText}` : droppedText))
    }
  }

  const handleSingleClick = (event) => {
    if (event?.detail > 1) return
    if (movedRef.current) {
      movedRef.current = false
      return
    }
    setQuickOpen((value) => !value)
    setBasketOpen(false)
    setPetMenuOpen(false)
    pet.actions.patHead()
    playReaction('pat')
  }

  const openPetChat = () => {
    if (movedRef.current) {
      movedRef.current = false
      return
    }
    setIsChatOpen(true)
    setQuickOpen(false)
    setBasketOpen(false)
    setPetMenuOpen(false)
    pet.actions.patHead()
    playReaction('open')
  }

  const handlePetContextMenu = (event) => {
    event.preventDefault()
    event.stopPropagation()
    setPetMenuOpen((value) => !value)
    setQuickOpen(false)
    setBasketOpen(false)
    playReaction('open')
  }

  const handlePointerDown = (event) => {
    if (event.button !== 0) return
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y
    }
    movedRef.current = false
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handlePointerMove = (event) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (Math.abs(dx) + Math.abs(dy) < 5) return
    movedRef.current = true
    setIsDragging(true)
    setQuickOpen(false)
    setBasketOpen(false)
    setPetMenuOpen(false)
    setPosition(clampPosition({ x: drag.originX + dx, y: drag.originY + dy }))
  }

  const handlePointerUp = (event) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
      dragRef.current = null
      if (isDragging) playReaction('drag')
      setIsDragging(false)
    }
  }

  const handleChatPanelPointerDown = (event) => {
    if (event.button !== 0) return
    chatPanelDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: chatPanelPosition.x,
      originY: chatPanelPosition.y
    }
    setIsChatPanelDragging(false)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handleChatPanelPointerMove = (event) => {
    const drag = chatPanelDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (Math.abs(dx) + Math.abs(dy) < 4) return
    setIsChatPanelDragging(true)
    setChatPanelPosition(clampChatPanelPosition({ x: drag.originX + dx, y: drag.originY + dy }))
  }

  const handleChatPanelPointerUp = (event) => {
    if (chatPanelDragRef.current?.pointerId !== event.pointerId) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    chatPanelDragRef.current = null
    window.setTimeout(() => setIsChatPanelDragging(false), 0)
  }

  const handleChatPanelResizeDown = (event) => {
    event.preventDefault()
    event.stopPropagation()
    chatPanelResizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originWidth: chatPanelSize.width,
      originHeight: chatPanelSize.height
    }
    setIsChatPanelResizing(true)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handleChatPanelResizeMove = (event) => {
    const resize = chatPanelResizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    const dx = event.clientX - resize.startX
    const dy = event.clientY - resize.startY
    setChatPanelSize(clampChatPanelSize({ width: resize.originWidth + dx, height: resize.originHeight + dy }))
  }

  const handleChatPanelResizeUp = (event) => {
    if (chatPanelResizeRef.current?.pointerId !== event.pointerId) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    chatPanelResizeRef.current = null
    setIsChatPanelResizing(false)
  }

  const chatModels = (apiConfigs || []).filter((config) => config.type === 'Chat')

  const inspectRemoteMemberCanvas = async (member: CloudTeamMember) => {
    if (!activeTeamId) {
      radar.pushNotice({
        text: '还没有选中云端小组',
        tone: 'error',
        state: 'error'
      }, 4200)
      return
    }

    try {
      const snapshot = await teamCanvasApi.getMemberSnapshot(activeTeamId, Number(member.id))
      if (snapshot.snapshot_url) {
        window.open(snapshot.snapshot_url, '_blank', 'noopener,noreferrer')
        radar.pushNotice({
          text: `已打开 ${member.name} 的画布快照`,
          tone: 'success',
          state: 'success'
        }, 4200)
        return
      }
      radar.pushNotice({
        text: '云端暂未返回可打开的画布快照',
        tone: 'cloud',
        state: 'cloudNotice'
      }, 5200)
    } catch (error: any) {
      const status = Number(error?.status || error?.code || 0)
      radar.pushNotice({
        text: [404, 405, 501, 50000].includes(status)
          ? '云端画布观察接口还没接入'
          : (error?.message || '请求成员画布失败'),
        tone: 'error',
        state: 'error'
      }, 5600)
    }
  }

  return (
    <div className={cls('pet-chat-widget', `theme-${theme || 'light'}`, isDragging && 'is-dragging')}>
      {quickOpen ? (
        <div
          className="pet-quick-anchor"
          style={
            {
              left: Math.min(position.x + 6, Math.max(16, window.innerWidth - 360)),
              top: Math.max(16, position.y - 58)
            } as CSSProperties
          }
        >
          <QuickInput
            value={chatInput}
            onChange={setChatInput}
            onSend={submitMessage}
            sending={isChatSending}
            speech={speech}
          />
        </div>
      ) : null}

      {isChatOpen ? (
        <section
          className={cls(
            'pet-chat-panel',
            isChatPanelDragging && 'is-dragging',
            isChatPanelResizing && 'is-resizing'
          )}
          style={
            {
              left: chatPanelPosition.x,
              top: chatPanelPosition.y,
              width: chatPanelSize.width,
              height: chatPanelSize.height
            } as CSSProperties
          }
          aria-label="小助手 AI 对话"
        >
          <header
            onPointerDown={handleChatPanelPointerDown}
            onPointerMove={handleChatPanelPointerMove}
            onPointerUp={handleChatPanelPointerUp}
            onPointerCancel={handleChatPanelPointerUp}
          >
            <div>
              <strong>{pet.profile.name || '星河球球'}</strong>
              <span>{isChatSending ? '正在思考...' : '双击小星球打开，单击快速问'}</span>
            </div>
            <div className="pet-chat-actions" onPointerDown={(event) => event.stopPropagation()}>
              <ChatHistoryPicker
                chatSessions={chatSessions}
                currentChatId={currentChatId}
                setCurrentChatId={setCurrentChatId}
                deleteChatSession={deleteChatSession}
              />
              <button onClick={handleCreateNewChat} type="button">
                <Plus size={14} />
                新对话
              </button>
              <button onClick={() => setIsChatOpen(false)} type="button">收起</button>
            </div>
          </header>

          <div className="pet-model-row">
            <ModelPicker chatModel={chatModel} setChatModel={setChatModel} chatModels={chatModels} />
            <span>失败会自动换可用模型</span>
          </div>

          <div className="pet-message-list">
            {messages.length === 0 ? (
              <div className="pet-empty-state">把问题丢给它，它会慢慢回你。</div>
            ) : (
              messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  shouldTypewrite={message.id === latestAssistantId}
                  onTypeStep={handleTypeStep}
                />
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {chatFiles.length > 0 ? (
            <div className="pet-file-strip">
              {chatFiles.map((file, index) => (
                <button key={`${file.name}-${index}`} onClick={() => removeChatFile(index)} type="button">
                  {file.name} ×
                </button>
              ))}
            </div>
          ) : null}

          <form className="pet-chat-input" onSubmit={submitMessage}>
            <button
              type="button"
              className="pet-file-button"
              onClick={() => chatFileInputRef.current?.click()}
              aria-label="添加附件"
            >
              <PackageOpen size={15} />
            </button>
            <input
              ref={chatFileInputRef}
              type="file"
              multiple
              hidden
              onChange={handleChatFileUpload}
            />
            <button
              type="button"
              className={cls('pet-speech-button', (speech.isListening || speech.isProcessing) && 'is-listening')}
              onClick={speech.toggle}
              disabled={isChatSending || speech.isProcessing || !speech.supported}
              aria-label={getSpeechButtonTitle(speech)}
              title={getSpeechButtonTitle(speech)}
            >
              <Mic size={15} />
            </button>
            <textarea
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
                event.preventDefault()
                void submitMessage(event)
              }}
              placeholder="输入后发送"
              rows={2}
              disabled={isChatSending}
            />
            <button type="submit" disabled={isChatSending || (!chatInput.trim() && chatFiles.length === 0)}>
              <Send size={16} />
            </button>
          </form>
          <span
            className="pet-chat-resize-handle"
            onPointerDown={handleChatPanelResizeDown}
            onPointerMove={handleChatPanelResizeMove}
            onPointerUp={handleChatPanelResizeUp}
            onPointerCancel={handleChatPanelResizeUp}
            aria-hidden="true"
          />
        </section>
      ) : null}

      {basketOpen ? (
        <div
          className="pet-basket-anchor"
          style={
            {
              left:
                position.x < window.innerWidth / 2
                  ? Math.min(position.x + 112, window.innerWidth - 284)
                  : Math.max(12, position.x - 286),
              top: Math.min(Math.max(12, position.y - 232), window.innerHeight - 318)
            } as CSSProperties
          }
        >
          <BasketPanel profile={pet.profile} actions={pet.actions} />
        </div>
      ) : null}

      {deliveryOpen ? (
        <div
          className="pet-delivery-anchor"
          style={
            {
              left:
                position.x < window.innerWidth / 2
                  ? Math.min(position.x + 112, window.innerWidth - 344)
                  : Math.max(12, position.x - 346),
              top: Math.min(Math.max(12, position.y - 286), window.innerHeight - 384)
            } as CSSProperties
          }
        >
          <PetDeliveryPanel
            files={deliveryFiles}
            onClose={() => {
              setDeliveryOpen(false)
              setDeliveryFiles([])
            }}
            onDelivered={(count) => {
              radar.pushNotice({
                text: `已投递 ${count} 个素材`,
                tone: 'success',
                state: 'success',
                action: 'openCloud'
              }, 5200)
              playReaction('send')
            }}
          />
        </div>
      ) : null}

      {petMenuOpen ? (
        <div
          className="pet-context-menu"
          style={
            {
              left: Math.min(position.x + 8, Math.max(12, window.innerWidth - 168)),
              top: Math.max(12, position.y - 88)
            } as CSSProperties
          }
        >
          <button onClick={openPetChat} type="button">
            <MessageCircle size={14} />
            大对话
          </button>
          <button
            onClick={() => {
              setBasketOpen(true)
              setPetMenuOpen(false)
              setQuickOpen(false)
            }}
            type="button"
          >
            <Shirt size={14} />
            换皮肤
          </button>
        </div>
      ) : null}

      {remoteOnlineMembers.map((member, index) => {
        const remotePosition = getRemotePetPosition(position, index)
        return (
          <div
            className="pet-dock pet-remote-dock"
            key={member.id}
            style={{ left: remotePosition.x, top: remotePosition.y } as CSSProperties}
            title={`${member.name} 在线`}
          >
            <span className="pet-employee-name pet-remote-name">{member.name}</span>
            <div
              className="pet-drag-zone pet-remote-zone"
              onClick={() => void inspectRemoteMemberCanvas(member)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  void inspectRemoteMemberCanvas(member)
                }
              }}
            >
              <PetAvatar
                profile={{ equippedSkinId: getRemotePetSkinId(member, index) }}
                petState="watching"
                reaction=""
                badgeCount={0}
              />
            </div>
          </div>
        )
      })}

      <div className="pet-dock" style={{ left: position.x, top: position.y } as CSSProperties}>
        {radar.notice ? (
          <button
            className={cls('pet-radar-bubble', `is-${radar.notice.tone || 'neutral'}`)}
            onClick={handleRadarBubbleClick}
            type="button"
            title={radar.notice.detail || radar.notice.text}
          >
            {radar.notice.text}
          </button>
        ) : null}
        {employeeName ? <span className="pet-employee-name">{employeeName}</span> : null}
        <div
          className={cls('pet-drag-zone', isDropActive && 'is-drop-active')}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDragOver={handlePetDragOver}
          onDragLeave={handlePetDragLeave}
          onDrop={handlePetDrop}
          onClick={handleSingleClick}
          onContextMenu={handlePetContextMenu}
        >
          <PetAvatar
            profile={pet.profile}
            petState={displayPetState}
            reaction={reaction}
            badgeCount={radar.badgeCount}
          />
        </div>
      </div>
    </div>
  )
}
