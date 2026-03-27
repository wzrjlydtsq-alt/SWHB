import { useState, useCallback, useEffect, useRef } from 'react'
import { X, ChevronRight, ChevronLeft, Film, Sparkles, Edit, Check, RefreshCw, ImageIcon, Loader2, Video, Download } from '../../../utils/icons.jsx'
import { useAppStore } from '../../../store/useAppStore.js'
import { useShallow } from 'zustand/react/shallow'
import { DEFAULT_BASE_URL, getModelParams, calculateResolution } from '../../../utils/constants.js'
import { apiClient } from '../../../services/apiClient.js'
import { getXingheMediaSrc } from '../../../utils/fileHelpers.js'

/* ────────────────────────────────────────────
 *  DirectorWizardModal — AI 导演向导
 *  Step 1: 创意输入 + 参数配置
 *  Step 2: AI 剧本预览 + 确认/编辑
 * ──────────────────────────────────────────── */

const RATIOS = ['16:9', '9:16', '4:3', '3:4', '1:1']
const DURATIONS = ['30秒', '45秒', '1分钟', '2分钟']
const STYLES = ['写实风', '动漫风', '3D动画', '像素风', '水墨风']
const DIRECTIONS = [
  { label: '搞笑', desc: '因小事升级' },
  { label: '严肃', desc: '冲突对抗' },
  { label: '温馨', desc: '温暖治愈' },
  { label: '悬疑', desc: '层层反转' }
]

const SCRIPT_SYSTEM_PROMPT = `你是一名专业的短视频编剧和分镜师。请根据用户的创意想法，生成一个完整的视频剧本。

你必须严格输出以下格式的 JSON（不要输出任何其他内容，只输出 JSON）：

{
  "title": "视频标题",
  "characters": [
    { "id": "C1", "name": "角色名", "desc": "外貌、服装、气质的详细描述" }
  ],
  "scenes": [
    { "id": "S1", "name": "场景名", "desc": "场景环境的详细描述" }
  ],
  "shots": [
    {
      "id": 1,
      "scene": "S1",
      "characters": ["C1"],
      "prompt": "用于AI绘图的英文提示词，描述这个镜头的画面内容，包含角色动作、表情、场景细节、镜头角度",
      "prompt_cn": "中文镜头描述，用于人类阅读",
      "duration": 5
    }
  ]
}

要求：
1. 根据用户指定的总时长来合理分配分镜数量和每个分镜的时长
2. 每个分镜的 prompt 必须是高质量的 AI 绘图提示词（英文），包含画面构图、角色细节、光影、镜头角度
3. prompt_cn 是中文描述，方便用户阅读和编辑
4. 角色描述要前后一致，便于保持角色一致性
5. 分镜之间要有故事连贯性`

export function DirectorWizardModal({ open, onClose }) {
  const { apiConfigs, globalApiKey } = useAppStore(
    useShallow((s) => ({
      apiConfigs: s.apiConfigs || [],
      globalApiKey: s.globalApiKey || ''
    }))
  )

  // 向导步骤
  const [step, setStep] = useState(1)

  // Step 1: 创意输入 + 参数
  const [idea, setIdea] = useState('')
  const [ratio, setRatio] = useState('16:9')
  const [duration, setDuration] = useState('45秒')
  const [style, setStyle] = useState('写实风')
  const [direction, setDirection] = useState('搞笑')
  const [extraRequirements, setExtraRequirements] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [chatModelId, setChatModelId] = useState('')
  const [imageModelId, setImageModelId] = useState('')
  const [videoModelId, setVideoModelId] = useState('')

  // Step 2: 剧本
  const [scriptData, setScriptData] = useState(null)
  const [scriptLoading, setScriptLoading] = useState(false)
  const [scriptError, setScriptError] = useState('')
  const [editingShot, setEditingShot] = useState(null)
  const [editValue, setEditValue] = useState('')

  // Step 3: 分镜图
  // shotImages: { [shotId]: { status: 'pending'|'generating'|'done'|'failed', url: '', taskId: '', error: '' } }
  const [shotImages, setShotImages] = useState({})
  const [imageGenStarted, setImageGenStarted] = useState(false)
  const taskToShotRef = useRef(new Map()) // taskId -> shotId

  // Step 4: 分镜视频
  const [shotVideos, setShotVideos] = useState({})
  const videoTaskToShotRef = useRef(new Map())
  const [concatExporting, setConcatExporting] = useState(false)

  const chatModels = (apiConfigs || []).filter((c) => c.type === 'Chat')
  const imageModels = (apiConfigs || []).filter((c) => c.type === 'Image')
  const videoModels = (apiConfigs || []).filter((c) => c.type === 'Video')

  const reset = useCallback(() => {
    setStep(1)
    setIdea('')
    setRatio('16:9')
    setDuration('45秒')
    setStyle('写实风')
    setDirection('搞笑')
    setExtraRequirements('')
    setScriptData(null)
    setScriptLoading(false)
    setScriptError('')
    setEditingShot(null)
    setShotImages({})
    setImageGenStarted(false)
    taskToShotRef.current.clear()
    setShotVideos({})
    videoTaskToShotRef.current.clear()
    setConcatExporting(false)
  }, [])

  const handleClose = useCallback(() => {
    reset()
    onClose()
  }, [reset, onClose])

  // ── 调用 AI 生成剧本 ──
  const generateScript = useCallback(async () => {
    const modelId = chatModelId || chatModels[0]?.id
    if (!modelId) {
      setScriptError('请先在设置中配置 Chat 模型')
      return
    }
    const config = (apiConfigs || []).find((c) => c.id === modelId)
    if (!config) {
      setScriptError('未找到选中的模型配置')
      return
    }
    const apiKey = config.key || globalApiKey
    if (!apiKey) {
      setScriptError('请先在设置中配置 API Key')
      return
    }

    setScriptLoading(true)
    setScriptError('')
    setStep(2)

    const userPrompt = `创意想法：${idea}

参数要求：
- 视频比例：${ratio}
- 视频总时长：${duration}
- 画面风格：${style}
- 故事走向：${direction}
${extraRequirements ? `- 其他要求：${extraRequirements}` : ''}`

    try {
      const baseUrl = (config.url || DEFAULT_BASE_URL).replace(/\/+$/, '')
      const responseData = await apiClient(
        '/v1/chat/completions',
        {
          method: 'POST',
          body: JSON.stringify({
            model: config.modelName || config.id || 'gpt-3.5-turbo',
            messages: [
              { role: 'system', content: SCRIPT_SYSTEM_PROMPT },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.8
          })
        },
        { baseUrl, apiKey }
      )

      const raw = responseData.choices?.[0]?.message?.content || ''
      // 提取 JSON（可能被 ```json ... ``` 包裹）
      const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, raw]
      const jsonStr = jsonMatch[1].trim()
      const parsed = JSON.parse(jsonStr)
      setScriptData(parsed)
    } catch (err) {
      console.error('剧本生成失败:', err)
      setScriptError(`生成失败: ${err.message}`)
    } finally {
      setScriptLoading(false)
    }
  }, [
    idea,
    ratio,
    duration,
    style,
    direction,
    extraRequirements,
    chatModelId,
    chatModels,
    apiConfigs,
    globalApiKey
  ])

  // ── 编辑分镜 ──
  const startEditShot = (shotId, field) => {
    const shot = scriptData.shots.find((s) => s.id === shotId)
    setEditingShot({ id: shotId, field })
    setEditValue(shot[field])
  }
  const saveEditShot = () => {
    if (!editingShot) return
    setScriptData((prev) => ({
      ...prev,
      shots: prev.shots.map((s) =>
        s.id === editingShot.id ? { ...s, [editingShot.field]: editValue } : s
      )
    }))
    setEditingShot(null)
  }

  // ── Step 3: 生成单张分镜图 ──
  const generateShotImage = useCallback(async (shotId) => {
    const shot = scriptData?.shots?.find((s) => s.id === shotId)
    if (!shot) return

    const modelId = imageModelId || imageModels[0]?.id
    if (!modelId) {
      alert('请先在设置中配置图像模型')
      return
    }
    const config = (apiConfigs || []).find((c) => c.id === modelId)
    if (!config) return
    const apiKey = config.key || globalApiKey
    if (!apiKey) {
      alert('请先在设置中配置 API Key')
      return
    }

    const baseUrl = (config.url || DEFAULT_BASE_URL).replace(/\/+$/, '')
    const { sizeStr, w, h } = getModelParams(modelId, ratio, 'Auto') || calculateResolution(ratio, 'Auto')

    setShotImages((prev) => ({
      ...prev,
      [shotId]: { status: 'generating', url: '', taskId: '', error: '' }
    }))

    const historyTaskId = `director_img_${Date.now()}_${shotId}`
    taskToShotRef.current.set(historyTaskId, shotId)

    // 构建增强提示词（融入风格）
    const styleMap = {
      '写实风': 'photorealistic, cinematic photography, 8k',
      '动漫风': 'anime style, vivid colors, manga illustration',
      '3D动画': '3D rendered, Pixar style, CGI animation',
      '像素风': 'pixel art, retro game style, 16-bit',
      '水墨风': 'traditional Chinese ink wash painting, watercolor'
    }
    const styleTag = styleMap[style] || ''
    const fullPrompt = `${shot.prompt}, ${styleTag}, masterpiece, best quality`

    try {
      const response = await window.api.engineAPI.submitTask({
        nodeId: `director-shot-${shotId}`,
        historyTaskId,
        type: 'image',
        prompt: fullPrompt,
        modelId,
        configName: config.modelName || modelId,
        baseUrl,
        apiKey,
        ratio,
        resolution: 'Auto',
        sizeStr: sizeStr || `${w}x${h}`,
        w: w || 1280,
        h: h || 720,
        sourceImages: [],
        sourceVideos: [],
        sourceAudios: []
      })
      if (!response?.success) {
        throw new Error(response?.error || '提交失败')
      }
      setShotImages((prev) => ({
        ...prev,
        [shotId]: { ...prev[shotId], taskId: historyTaskId }
      }))
    } catch (err) {
      setShotImages((prev) => ({
        ...prev,
        [shotId]: { status: 'failed', url: '', taskId: '', error: err.message }
      }))
    }
  }, [scriptData, imageModelId, imageModels, apiConfigs, globalApiKey, ratio, style])

  // ── Step 3: 批量生成所有分镜图 ──
  const generateAllShotImages = useCallback(async () => {
    if (!scriptData?.shots?.length) return
    setImageGenStarted(true)
    // 初始化所有 shot 状态
    const initial = {}
    scriptData.shots.forEach((s) => {
      initial[s.id] = { status: 'pending', url: '', taskId: '', error: '' }
    })
    setShotImages(initial)

    // 逐个发起（间隔 500ms 避免拥堵）
    for (const shot of scriptData.shots) {
      await generateShotImage(shot.id)
      await new Promise((r) => setTimeout(r, 500))
    }
  }, [scriptData, generateShotImage])

  // ── 监听任务完成事件 ──
  useEffect(() => {
    if (step !== 3 || !window.api?.engineAPI?.onTaskUpdated) return
    const cleanup = window.api.engineAPI.onTaskUpdated((task) => {
      const targetId = task.payload?.historyTaskId || task.id
      const shotId = taskToShotRef.current.get(targetId)
      if (!shotId) return // 不是本组件的任务

      if (task.status === 'completed' && task.resultUrl) {
        const imgSrc = getXingheMediaSrc(task.resultUrl)
        setShotImages((prev) => ({
          ...prev,
          [shotId]: { status: 'done', url: imgSrc, taskId: targetId, error: '' }
        }))
      } else if (task.status === 'failed') {
        setShotImages((prev) => ({
          ...prev,
          [shotId]: { status: 'failed', url: '', taskId: targetId, error: task.error || '生成失败' }
        }))
      }
    })
    return cleanup
  }, [step])

  // ── Step 4: 生成单个分镜视频 ──
  const generateShotVideo = useCallback(async (shotId) => {
    const shot = scriptData?.shots?.find((s) => s.id === shotId)
    if (!shot) return
    const imgData = shotImages[shotId]
    if (!imgData?.url) {
      alert('请先生成并确认该分镜的图片')
      return
    }

    const modelId = videoModelId || videoModels[0]?.id
    if (!modelId) {
      alert('请先在设置中配置视频模型')
      return
    }
    const config = (apiConfigs || []).find((c) => c.id === modelId)
    if (!config) return
    const apiKey = config.key || globalApiKey
    if (!apiKey) {
      alert('请先在设置中配置 API Key')
      return
    }

    const baseUrl = (config.url || DEFAULT_BASE_URL).replace(/\/+$/, '')
    const vidDuration = String(shot.duration || 5)
    const { sizeStr, w, h } = getModelParams(modelId, ratio, 'Auto') || calculateResolution(ratio, 'Auto')

    setShotVideos((prev) => ({
      ...prev,
      [shotId]: { status: 'generating', url: '', taskId: '', error: '' }
    }))

    const historyTaskId = `director_vid_${Date.now()}_${shotId}`
    videoTaskToShotRef.current.set(historyTaskId, shotId)

    try {
      const response = await window.api.engineAPI.submitTask({
        nodeId: `director-vid-${shotId}`,
        historyTaskId,
        type: 'video',
        prompt: shot.prompt,
        modelId,
        configName: config.modelName || modelId,
        baseUrl,
        apiKey,
        ratio,
        resolution: 'Auto',
        sizeStr: sizeStr || `${w}x${h}`,
        w: w || 1280,
        h: h || 720,
        duration: vidDuration,
        sourceImages: [imgData.url],
        sourceVideos: [],
        sourceAudios: []
      })
      if (!response?.success) {
        throw new Error(response?.error || '提交失败')
      }
      setShotVideos((prev) => ({
        ...prev,
        [shotId]: { ...prev[shotId], taskId: historyTaskId }
      }))
    } catch (err) {
      setShotVideos((prev) => ({
        ...prev,
        [shotId]: { status: 'failed', url: '', taskId: '', error: err.message }
      }))
    }
  }, [scriptData, shotImages, videoModelId, videoModels, apiConfigs, globalApiKey, ratio])

  // ── Step 4: 批量生成所有分镜视频 ──
  const generateAllShotVideos = useCallback(async () => {
    if (!scriptData?.shots?.length) return
    const initial = {}
    scriptData.shots.forEach((s) => {
      initial[s.id] = { status: 'pending', url: '', taskId: '', error: '' }
    })
    setShotVideos(initial)

    for (const shot of scriptData.shots) {
      await generateShotVideo(shot.id)
      await new Promise((r) => setTimeout(r, 500))
    }
  }, [scriptData, generateShotVideo])

  // ── 监听视频任务完成事件 ──
  useEffect(() => {
    if (step !== 4 || !window.api?.engineAPI?.onTaskUpdated) return
    const cleanup = window.api.engineAPI.onTaskUpdated((task) => {
      const targetId = task.payload?.historyTaskId || task.id
      const shotId = videoTaskToShotRef.current.get(targetId)
      if (!shotId) return

      if (task.status === 'completed' && task.resultUrl) {
        const vidSrc = getXingheMediaSrc(task.resultUrl)
        setShotVideos((prev) => ({
          ...prev,
          [shotId]: { status: 'done', url: vidSrc, taskId: targetId, error: '' }
        }))
      } else if (task.status === 'failed') {
        setShotVideos((prev) => ({
          ...prev,
          [shotId]: { status: 'failed', url: '', taskId: targetId, error: task.error || '生成失败' }
        }))
      }
    })
    return cleanup
  }, [step])

  if (!open) return null

  const totalDuration = scriptData?.shots?.reduce((sum, s) => sum + (s.duration || 5), 0) || 0

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      <div
        className="relative w-[680px] max-h-[85vh] rounded-2xl shadow-2xl border flex flex-col animate-in fade-in zoom-in-95 duration-200"
        style={{
          background: 'var(--bg-panel)',
          borderColor: 'var(--border-color)'
        }}
      >
        {/* ── 标题栏 ── */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b shrink-0"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #f59e0b20, #ef444420)' }}
            >
              <Film size={18} className="text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                🎬 AI 导演 —{' '}
                {step === 1 ? '创意输入' : step === 2 ? '剧本预览' : '分镜图生成'}
              </h3>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                {step === 1
                  ? '描述你的想法，选择视频参数'
                  : step === 2
                    ? `共 ${scriptData?.shots?.length || 0} 个分镜，总时长约 ${totalDuration}s`
                    : `${Object.values(shotImages).filter((v) => v.status === 'done').length} / ${scriptData?.shots?.length || 0} 张已完成`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* 步骤指示器 */}
            <div className="flex items-center gap-1 mr-2">
              {[1, 2, 3, 4].map((s) => (
                <div
                  key={s}
                  className="w-2 h-2 rounded-full transition-all"
                  style={{
                    background: s === step ? '#f59e0b' : s < step ? '#34d399' : 'var(--border-color)',
                    transform: s === step ? 'scale(1.3)' : 'scale(1)'
                  }}
                />
              ))}
            </div>
            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── 内容区域 ── */}
        <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
          {step === 1 && (
            /* ═══════ Step 1: 创意输入 ═══════ */
            <div className="px-6 py-5 flex flex-col gap-5">
              {/* 创意输入 */}
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-secondary)] mb-1.5 block">
                  💡 你的创意想法
                </label>
                <textarea
                  className="w-full h-24 bg-[var(--bg-secondary)] text-sm outline-none resize-none custom-scrollbar text-[var(--text-primary)] placeholder-[var(--text-muted)] leading-relaxed p-3 rounded-xl border border-[var(--border-color)] focus:border-amber-400/50 transition-colors"
                  placeholder="例：运维工程师和前端开发因为一个 bug 引发的搞笑故事..."
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                />
              </div>

              {/* 视频比例 */}
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-secondary)] mb-1.5 block">
                  📐 视频比例
                </label>
                <div className="flex gap-2">
                  {RATIOS.map((r) => (
                    <button
                      key={r}
                      onClick={() => setRatio(r)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                        ratio === r
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                          : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* 视频时长 */}
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-secondary)] mb-1.5 block">
                  ⏱ 视频时长
                </label>
                <div className="flex gap-2">
                  {DURATIONS.map((d) => (
                    <button
                      key={d}
                      onClick={() => setDuration(d)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                        duration === d
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                          : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* 画面风格 */}
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-secondary)] mb-1.5 block">
                  🎨 画面风格
                </label>
                <div className="flex flex-wrap gap-2">
                  {STYLES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setStyle(s)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                        style === s
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                          : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* 故事走向 */}
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-secondary)] mb-1.5 block">
                  📖 故事走向
                </label>
                <div className="flex flex-wrap gap-2">
                  {DIRECTIONS.map((d) => (
                    <button
                      key={d.label}
                      onClick={() => setDirection(d.label)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                        direction === d.label
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                          : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      {d.label}：{d.desc}
                    </button>
                  ))}
                </div>
              </div>

              {/* 其他要求 */}
              <div>
                <label className="text-[11px] font-semibold text-[var(--text-secondary)] mb-1.5 block">
                  📝 其他补充要求（可选）
                </label>
                <input
                  className="w-full bg-[var(--bg-secondary)] text-xs outline-none text-[var(--text-primary)] placeholder-[var(--text-muted)] p-2.5 rounded-xl border border-[var(--border-color)] focus:border-amber-400/50 transition-colors"
                  placeholder="如特定台词、场景细节等"
                  value={extraRequirements}
                  onChange={(e) => setExtraRequirements(e.target.value)}
                />
              </div>

              {/* 高级设置 */}
              <div>
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <ChevronRight
                    size={10}
                    className={`transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
                  />
                  高级设置（模型选择）
                </button>
                {showAdvanced && (
                  <div className="mt-2 flex flex-col gap-2 pl-3 border-l-2 border-[var(--border-color)]">
                    {/* 剧本模型 */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--text-muted)] w-16 shrink-0">剧本模型</span>
                      <select
                        className="flex-1 bg-[var(--bg-secondary)] text-[11px] text-[var(--text-primary)] p-1.5 rounded-lg border border-[var(--border-color)] outline-none"
                        value={chatModelId}
                        onChange={(e) => setChatModelId(e.target.value)}
                      >
                        <option value="">自动选择</option>
                        {chatModels.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.provider}
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* 图像模型 */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--text-muted)] w-16 shrink-0">图像模型</span>
                      <select
                        className="flex-1 bg-[var(--bg-secondary)] text-[11px] text-[var(--text-primary)] p-1.5 rounded-lg border border-[var(--border-color)] outline-none"
                        value={imageModelId}
                        onChange={(e) => setImageModelId(e.target.value)}
                      >
                        <option value="">自动选择</option>
                        {imageModels.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.provider}
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* 视频模型 */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--text-muted)] w-16 shrink-0">视频模型</span>
                      <select
                        className="flex-1 bg-[var(--bg-secondary)] text-[11px] text-[var(--text-primary)] p-1.5 rounded-lg border border-[var(--border-color)] outline-none"
                        value={videoModelId}
                        onChange={(e) => setVideoModelId(e.target.value)}
                      >
                        <option value="">自动选择</option>
                        {videoModels.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.provider}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            /* ═══════ Step 2: 剧本预览 ═══════ */
            <div className="px-6 py-5 flex flex-col gap-4">
              {scriptLoading && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="w-10 h-10 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                  <p className="text-sm text-[var(--text-secondary)]">🎬 AI 正在创作剧本...</p>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    根据你的创意生成分镜脚本，预计需要 10-30 秒
                  </p>
                </div>
              )}

              {scriptError && (
                <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <p className="text-xs text-red-400">{scriptError}</p>
                  <button
                    onClick={() => {
                      setStep(1)
                      setScriptError('')
                    }}
                    className="mt-2 text-[10px] text-red-300 underline"
                  >
                    返回修改
                  </button>
                </div>
              )}

              {scriptData && !scriptLoading && (
                <>
                  {/* 标题 */}
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-amber-400" />
                    <h4 className="text-sm font-bold text-[var(--text-primary)]">
                      {scriptData.title}
                    </h4>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                      {scriptData.shots?.length} 个分镜 · {totalDuration}s
                    </span>
                  </div>

                  {/* 角色列表 */}
                  {scriptData.characters?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-[var(--text-muted)] mb-1.5">
                        👤 出场角色
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {scriptData.characters.map((c) => (
                          <div
                            key={c.id}
                            className="px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]"
                          >
                            <span className="text-[11px] font-semibold text-emerald-400">
                              {c.id}
                            </span>
                            <span className="text-[11px] text-[var(--text-primary)] ml-1.5">
                              {c.name}
                            </span>
                            <p className="text-[10px] text-[var(--text-muted)] mt-0.5 max-w-[200px]">
                              {c.desc}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 场景列表 */}
                  {scriptData.scenes?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-[var(--text-muted)] mb-1.5">
                        🏙 场景
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {scriptData.scenes.map((s) => (
                          <div
                            key={s.id}
                            className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]"
                          >
                            <span className="text-[11px] font-semibold text-blue-400">
                              {s.id}
                            </span>
                            <span className="text-[11px] text-[var(--text-primary)] ml-1.5">
                              {s.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 分镜列表 */}
                  <div>
                    <p className="text-[10px] font-semibold text-[var(--text-muted)] mb-1.5">
                      🎬 分镜脚本
                    </p>
                    <div className="flex flex-col gap-2">
                      {scriptData.shots?.map((shot) => (
                        <div
                          key={shot.id}
                          className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] overflow-hidden"
                        >
                          {/* 分镜头部 */}
                          <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-color)]">
                            <span className="text-[10px] font-bold text-amber-400">
                              Shot {shot.id}
                            </span>
                            <span className="text-[10px] text-blue-400">{shot.scene}</span>
                            <span className="text-[10px] text-[var(--text-muted)]">
                              {shot.characters?.join(', ')}
                            </span>
                            <span className="text-[10px] text-[var(--text-muted)] ml-auto">
                              {shot.duration}s
                            </span>
                          </div>
                          {/* 中文描述 */}
                          <div className="px-3 py-2">
                            {editingShot?.id === shot.id &&
                            editingShot?.field === 'prompt_cn' ? (
                              <div className="flex gap-1">
                                <textarea
                                  className="flex-1 bg-[var(--bg-base)] text-[11px] text-[var(--text-primary)] p-2 rounded border border-amber-400/50 outline-none resize-none"
                                  rows={2}
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  autoFocus
                                />
                                <button
                                  onClick={saveEditShot}
                                  className="p-1 text-emerald-400 hover:bg-emerald-500/20 rounded"
                                >
                                  <Check size={14} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-start gap-1 group">
                                <p className="text-[11px] text-[var(--text-primary)] leading-relaxed flex-1">
                                  {shot.prompt_cn}
                                </p>
                                <button
                                  onClick={() => startEditShot(shot.id, 'prompt_cn')}
                                  className="p-0.5 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-amber-400 transition-all shrink-0"
                                >
                                  <Edit size={12} />
                                </button>
                              </div>
                            )}
                          </div>
                          {/* 英文 prompt（折叠） */}
                          <details className="px-3 pb-2">
                            <summary className="text-[9px] text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-secondary)]">
                              查看英文提示词
                            </summary>
                            {editingShot?.id === shot.id &&
                            editingShot?.field === 'prompt' ? (
                              <div className="flex gap-1 mt-1">
                                <textarea
                                  className="flex-1 bg-[var(--bg-base)] text-[10px] text-[var(--text-primary)] p-2 rounded border border-amber-400/50 outline-none resize-none font-mono"
                                  rows={3}
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  autoFocus
                                />
                                <button
                                  onClick={saveEditShot}
                                  className="p-1 text-emerald-400 hover:bg-emerald-500/20 rounded"
                                >
                                  <Check size={14} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-start gap-1 group mt-1">
                                <p className="text-[10px] text-[var(--text-muted)] leading-relaxed font-mono flex-1">
                                  {shot.prompt}
                                </p>
                                <button
                                  onClick={() => startEditShot(shot.id, 'prompt')}
                                  className="p-0.5 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-amber-400 transition-all shrink-0"
                                >
                                  <Edit size={12} />
                                </button>
                              </div>
                            )}
                          </details>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 3 && (
            /* ═══════ Step 3: 分镜图生成 ═══════ */
            <div className="px-6 py-5 flex flex-col gap-3">
              {scriptData?.shots?.map((shot) => {
                const img = shotImages[shot.id] || { status: 'pending' }
                return (
                  <div
                    key={shot.id}
                    className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] overflow-hidden"
                  >
                    <div className="flex gap-3 p-3">
                      {/* 图片预览区 */}
                      <div className="w-32 h-20 rounded-lg border border-[var(--border-color)] bg-[var(--bg-base)] flex items-center justify-center shrink-0 overflow-hidden">
                        {img.status === 'done' && img.url ? (
                          <img
                            src={img.url}
                            alt={`Shot ${shot.id}`}
                            className="w-full h-full object-cover"
                          />
                        ) : img.status === 'generating' ? (
                          <Loader2 size={20} className="text-amber-400 animate-spin" />
                        ) : img.status === 'failed' ? (
                          <span className="text-[10px] text-red-400">失败</span>
                        ) : (
                          <ImageIcon size={20} className="text-[var(--text-muted)]" />
                        )}
                      </div>
                      {/* 信息区 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold text-amber-400">
                            Shot {shot.id}
                          </span>
                          {img.status === 'done' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                              ✓ 完成
                            </span>
                          )}
                          {img.status === 'generating' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                              生成中...
                            </span>
                          )}
                          {img.status === 'failed' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                              {img.error || '失败'}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                          {shot.prompt_cn}
                        </p>
                        {/* 操作按钮 */}
                        <div className="flex gap-1.5 mt-1.5">
                          <button
                            onClick={() => generateShotImage(shot.id)}
                            disabled={img.status === 'generating'}
                            className="flex items-center gap-1 px-2 py-1 rounded text-[9px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] transition-colors disabled:opacity-40"
                          >
                            <RefreshCw size={10} />
                            {img.status === 'done' ? '重新生成' : '生成'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {step === 4 && (
            /* ═══════ Step 4: 分镜视频生成 ═══════ */
            <div className="px-6 py-5 flex flex-col gap-3">
              {scriptData?.shots?.map((shot) => {
                const vid = shotVideos[shot.id] || { status: 'pending' }
                const img = shotImages[shot.id]
                return (
                  <div
                    key={shot.id}
                    className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] overflow-hidden"
                  >
                    <div className="flex gap-3 p-3">
                      {/* 视频/图片预览区 */}
                      <div className="w-36 h-24 rounded-lg border border-[var(--border-color)] bg-black flex items-center justify-center shrink-0 overflow-hidden relative">
                        {vid.status === 'done' && vid.url ? (
                          <video
                            src={vid.url}
                            className="w-full h-full object-cover"
                            controls
                            muted
                            loop
                          />
                        ) : img?.url ? (
                          <>
                            <img
                              src={img.url}
                              alt={`Shot ${shot.id}`}
                              className="w-full h-full object-cover opacity-60"
                            />
                            {vid.status === 'generating' && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <Loader2 size={24} className="text-amber-400 animate-spin" />
                              </div>
                            )}
                          </>
                        ) : vid.status === 'generating' ? (
                          <Loader2 size={24} className="text-amber-400 animate-spin" />
                        ) : (
                          <Video size={20} className="text-[var(--text-muted)]" />
                        )}
                      </div>
                      {/* 信息区 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold text-amber-400">
                            Shot {shot.id}
                          </span>
                          <span className="text-[9px] text-[var(--text-muted)]">
                            {shot.duration}s
                          </span>
                          {vid.status === 'done' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                              ✓ 完成
                            </span>
                          )}
                          {vid.status === 'generating' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                              生成中...
                            </span>
                          )}
                          {vid.status === 'failed' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                              {vid.error || '失败'}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
                          {shot.prompt_cn}
                        </p>
                        <div className="flex gap-1.5 mt-1.5">
                          <button
                            onClick={() => generateShotVideo(shot.id)}
                            disabled={vid.status === 'generating'}
                            className="flex items-center gap-1 px-2 py-1 rounded text-[9px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] transition-colors disabled:opacity-40"
                          >
                            <RefreshCw size={10} />
                            {vid.status === 'done' ? '重新生成' : '生成'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── 底部操作栏 ── */}
        <div
          className="flex items-center justify-between px-6 py-3.5 border-t shrink-0"
          style={{ borderColor: 'var(--border-color)' }}
        >
          {step === 1 && (
            <>
              <div />
              <button
                onClick={generateScript}
                disabled={!idea.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200 hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                style={{
                  background: idea.trim()
                    ? 'linear-gradient(135deg, #f59e0b, #ef4444)'
                    : 'var(--bg-secondary)',
                  color: idea.trim() ? '#fff' : 'var(--text-muted)',
                  boxShadow: idea.trim() ? '0 4px 20px rgba(245,158,11,0.4)' : 'none'
                }}
              >
                <Sparkles size={16} />
                生成剧本
              </button>
            </>
          )}

          {step === 2 && !scriptLoading && (
            <>
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                <ChevronLeft size={14} />
                返回修改
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={generateScript}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors border border-[var(--border-color)]"
                >
                  🔄 重新生成
                </button>
                {scriptData && (
                  <button
                    onClick={() => {
                      setStep(3)
                      setTimeout(() => generateAllShotImages(), 100)
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200 hover:scale-105"
                    style={{
                      background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                      color: '#fff',
                      boxShadow: '0 4px 20px rgba(245,158,11,0.4)'
                    }}
                  >
                    确认剧本 → 生成分镜图
                    <ChevronRight size={16} />
                  </button>
                )}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                <ChevronLeft size={14} />
                返回剧本
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={generateAllShotImages}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors border border-[var(--border-color)]"
                >
                  🔄 全部重新生成
                </button>
                {Object.values(shotImages).every((v) => v.status === 'done') && (
                  <button
                    onClick={() => {
                      setStep(4)
                      setTimeout(() => generateAllShotVideos(), 100)
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200 hover:scale-105"
                    style={{
                      background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                      color: '#fff',
                      boxShadow: '0 4px 20px rgba(245,158,11,0.4)'
                    }}
                  >
                    确认图片 → 生成视频
                    <ChevronRight size={16} />
                  </button>
                )}
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <button
                onClick={() => setStep(3)}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                <ChevronLeft size={14} />
                返回图片
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={generateAllShotVideos}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors border border-[var(--border-color)]"
                >
                  🔄 全部重新生成
                </button>
                {Object.values(shotVideos).length > 0 &&
                  Object.values(shotVideos).every((v) => v.status === 'done') && (
                  <>
                    <button
                      onClick={async () => {
                        setConcatExporting(true)
                        try {
                          const videoPaths = scriptData.shots.map(
                            (s) => shotVideos[s.id]?.url
                          ).filter(Boolean)
                          const title = scriptData.title || 'ai_director'
                          const outputName = `${title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}_${Date.now()}.mp4`
                          const result = await window.api.localCacheAPI.concatVideos(videoPaths, outputName)
                          if (result.success) {
                            if (result.exported !== false) {
                              alert(`✅ 视频已导出到: ${result.path}`)
                            }
                          } else {
                            alert(`❌ ${result.error}`)
                          }
                        } catch (err) {
                          alert(`❌ 导出失败: ${err.message}`)
                        } finally {
                          setConcatExporting(false)
                        }
                      }}
                      disabled={concatExporting}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200 hover:scale-105 disabled:opacity-60"
                      style={{
                        background: 'linear-gradient(135deg, #34d399, #06b6d4)',
                        color: '#fff',
                        boxShadow: '0 4px 20px rgba(52,211,153,0.4)'
                      }}
                    >
                      {concatExporting ? (
                        <><Loader2 size={16} className="animate-spin" /> 拼接中...</>
                      ) : (
                        <><Download size={16} /> 导出拼接视频</>
                      )}
                    </button>
                    <button
                      onClick={handleClose}
                      className="flex items-center gap-1 px-3 py-2 rounded-xl text-[12px] text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                    >
                      ✅ 完成
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
