import React, { useState, useCallback, useEffect, useRef } from 'react'
import {
  ChevronRight, ChevronLeft, Film, Sparkles, Edit, Check,
  RefreshCw, ImageIcon, Loader2, Video, Download
} from '../../utils/icons.jsx'
import { DEFAULT_BASE_URL, getModelParams, calculateResolution } from '../../utils/constants.js'
import { apiClient } from '../../services/apiClient.js'
import { getXingheMediaSrc } from '../../utils/fileHelpers.js'

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

const STYLE_MAP = {
  '写实风': 'photorealistic, cinematic photography, 8k',
  '动漫风': 'anime style, vivid colors, manga illustration',
  '3D动画': '3D rendered, Pixar style, CGI animation',
  '像素风': 'pixel art, retro game style, 16-bit',
  '水墨风': 'traditional Chinese ink wash painting, watercolor'
}

/* ── 按钮样式选中/未选 ── */
const selBtn = (active) =>
  `px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all ${
    active
      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
      : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
  }`

export const DirectorNode = React.memo(function DirectorNode({
  node,
  apiConfigs,
  globalApiKey,
  updateNodeSettings
}) {
  const s = node.settings || {}

  /* ── 本地 UI 状态 ── */
  const [step, setStep] = useState(s.step || 1)
  const [idea, setIdea] = useState(s.idea || '')
  const [ratio, setRatio] = useState(s.ratio || '16:9')
  const [duration, setDuration] = useState(s.duration || '45秒')
  const [style, setStyle] = useState(s.style || '写实风')
  const [direction, setDirection] = useState(s.direction || '搞笑')
  const [extraReq, setExtraReq] = useState(s.extraReq || '')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [chatModelId, setChatModelId] = useState(s.chatModelId || '')
  const [imageModelId, setImageModelId] = useState(s.imageModelId || '')
  const [videoModelId, setVideoModelId] = useState(s.videoModelId || '')

  const [scriptData, setScriptData] = useState(s.scriptData || null)
  const [scriptLoading, setScriptLoading] = useState(false)
  const [scriptError, setScriptError] = useState('')
  const [editingShot, setEditingShot] = useState(null)
  const [editValue, setEditValue] = useState('')

  const [shotImages, setShotImages] = useState(s.shotImages || {})
  const taskToShotRef = useRef(new Map())
  const [shotVideos, setShotVideos] = useState(s.shotVideos || {})
  const videoTaskToShotRef = useRef(new Map())
  const [concatExporting, setConcatExporting] = useState(false)

  const cfgs = apiConfigs || []
  const chatModels = cfgs.filter((c) => c.type === 'Chat')
  const imageModels = cfgs.filter((c) => c.type === 'Image')
  const videoModels = cfgs.filter((c) => c.type === 'Video')

  /* ── 持久化关键状态到 node.settings ── */
  useEffect(() => {
    if (!updateNodeSettings) return
    updateNodeSettings(node.id, {
      step, idea, ratio, duration, style, direction, extraReq,
      chatModelId, imageModelId, videoModelId,
      scriptData, shotImages, shotVideos
    })
  }, [step, idea, ratio, duration, style, direction, extraReq,
    chatModelId, imageModelId, videoModelId, scriptData, shotImages, shotVideos,
    node.id, updateNodeSettings])

  /* ── 调用 AI 生成剧本 ── */
  const generateScript = useCallback(async () => {
    const modelId = chatModelId || chatModels[0]?.id
    if (!modelId) { setScriptError('请先配置 Chat 模型'); return }
    const config = cfgs.find((c) => c.id === modelId)
    if (!config) { setScriptError('未找到模型配置'); return }
    const apiKey = config.key || globalApiKey
    if (!apiKey) { setScriptError('请先配置 API Key'); return }

    setScriptLoading(true)
    setScriptError('')
    setStep(2)

    const userPrompt = `创意想法：${idea}\n\n参数要求：\n- 视频比例：${ratio}\n- 视频总时长：${duration}\n- 画面风格：${style}\n- 故事走向：${direction}\n${extraReq ? `- 其他要求：${extraReq}` : ''}`

    try {
      const baseUrl = (config.url || DEFAULT_BASE_URL).replace(/\/+$/, '')
      const res = await apiClient('/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
          model: config.modelName || config.id || 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: SCRIPT_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.8
        })
      }, { baseUrl, apiKey })
      const raw = res.choices?.[0]?.message?.content || ''
      const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, raw]
      setScriptData(JSON.parse(jsonMatch[1].trim()))
    } catch (err) {
      setScriptError(`生成失败: ${err.message}`)
    } finally {
      setScriptLoading(false)
    }
  }, [idea, ratio, duration, style, direction, extraReq, chatModelId, chatModels, cfgs, globalApiKey])

  /* ── 编辑分镜 ── */
  const startEditShot = (shotId, field) => {
    const shot = scriptData.shots.find((ss) => ss.id === shotId)
    setEditingShot({ id: shotId, field })
    setEditValue(shot[field])
  }
  const saveEditShot = () => {
    if (!editingShot) return
    setScriptData((prev) => ({
      ...prev,
      shots: prev.shots.map((ss) =>
        ss.id === editingShot.id ? { ...ss, [editingShot.field]: editValue } : ss
      )
    }))
    setEditingShot(null)
  }

  /* ── 生成单张分镜图 ── */
  const generateShotImage = useCallback(async (shotId) => {
    console.log('[DirectorNode] generateShotImage called for shot:', shotId)
    const shot = scriptData?.shots?.find((ss) => ss.id === shotId)
    if (!shot) { console.warn('[DirectorNode] shot not found:', shotId); return }
    const modelId = imageModelId || imageModels[0]?.id
    console.log('[DirectorNode] modelId:', modelId, 'imageModels:', imageModels.length, 'cfgs:', cfgs.length)
    if (!modelId) { alert('请先配置图像模型'); return }
    const config = cfgs.find((c) => c.id === modelId)
    if (!config) { console.warn('[DirectorNode] config not found for modelId:', modelId); return }
    const apiKey = config.key || globalApiKey
    if (!apiKey) { alert('请先配置 API Key'); return }

    const baseUrl = (config.url || DEFAULT_BASE_URL).replace(/\/+$/, '')
    const resolvedParams = getModelParams(modelId, ratio, 'Auto') || calculateResolution(ratio, 'Auto')
    const { sizeStr, w, h } = resolvedParams || {}
    setShotImages((prev) => ({ ...prev, [shotId]: { status: 'generating', url: '', taskId: '', error: '' } }))

    const historyTaskId = `director_img_${Date.now()}_${shotId}`
    taskToShotRef.current.set(historyTaskId, shotId)
    const styleTag = STYLE_MAP[style] || ''
    const fullPrompt = `${shot.prompt}, ${styleTag}, masterpiece, best quality`

    const payload = {
      nodeId: `director-shot-${shotId}`, historyTaskId, type: 'image',
      prompt: fullPrompt, modelId, configName: config.modelName || modelId,
      baseUrl, apiKey, ratio, resolution: 'Auto',
      sizeStr: sizeStr || `${w}x${h}`, w: w || 1280, h: h || 720,
      sourceImages: [], sourceVideos: [], sourceAudios: []
    }
    console.log('[DirectorNode] submitTask payload:', JSON.stringify(payload).slice(0, 200))

    try {
      const response = await window.api.engineAPI.submitTask(payload)
      console.log('[DirectorNode] submitTask response:', response)
      if (!response?.success) throw new Error(response?.error || '提交失败')
      setShotImages((prev) => ({ ...prev, [shotId]: { ...prev[shotId], taskId: historyTaskId } }))
    } catch (err) {
      console.error('[DirectorNode] submitTask error:', err)
      setShotImages((prev) => ({ ...prev, [shotId]: { status: 'failed', url: '', taskId: '', error: err.message } }))
    }
  }, [scriptData, imageModelId, imageModels, cfgs, globalApiKey, ratio, style])

  /* ── 批量生成分镜图（并行 fire-and-forget，间隔 500ms 错开） ── */
  const generateAllShotImages = useCallback(() => {
    if (!scriptData?.shots?.length) { console.warn('[DirectorNode] no shots'); return }
    console.log('[DirectorNode] generateAllShotImages: firing', scriptData.shots.length, 'shots')
    scriptData.shots.forEach((shot, i) => {
      setTimeout(() => {
        generateShotImage(shot.id).catch((err) => {
          console.error('[DirectorNode] batch img error for shot', shot.id, err)
        })
      }, i * 500)
    })
  }, [scriptData, generateShotImage])

  /* ── 监听图片任务（step 3+4 都保持监听） ── */
  useEffect(() => {
    if (step < 3 || !window.api?.engineAPI?.onTaskUpdated) return
    const cleanup = window.api.engineAPI.onTaskUpdated((task) => {
      const tid = task.payload?.historyTaskId || task.id
      const shotId = taskToShotRef.current.get(tid)
      if (!shotId) return
      if (task.status === 'completed' && task.resultUrl) {
        setShotImages((prev) => ({ ...prev, [shotId]: { status: 'done', url: getXingheMediaSrc(task.resultUrl), taskId: tid, error: '' } }))
      } else if (task.status === 'failed') {
        setShotImages((prev) => ({ ...prev, [shotId]: { status: 'failed', url: '', taskId: tid, error: task.error || '生成失败' } }))
      }
    })
    return cleanup
  }, [step])

  /* ── 生成单个分镜视频 ── */
  const generateShotVideo = useCallback(async (shotId) => {
    const shot = scriptData?.shots?.find((ss) => ss.id === shotId)
    if (!shot) return
    const imgData = shotImages[shotId]
    if (!imgData?.url) { alert('请先生成该分镜图片'); return }
    const modelId = videoModelId || videoModels[0]?.id
    if (!modelId) { alert('请先配置视频模型'); return }
    const config = cfgs.find((c) => c.id === modelId)
    if (!config) return
    const apiKey = config.key || globalApiKey
    if (!apiKey) { alert('请先配置 API Key'); return }

    const baseUrl = (config.url || DEFAULT_BASE_URL).replace(/\/+$/, '')
    const vidDuration = String(shot.duration || 5)
    const { sizeStr, w, h } = getModelParams(modelId, ratio, 'Auto') || calculateResolution(ratio, 'Auto')
    setShotVideos((prev) => ({ ...prev, [shotId]: { status: 'generating', url: '', taskId: '', error: '' } }))

    const historyTaskId = `director_vid_${Date.now()}_${shotId}`
    videoTaskToShotRef.current.set(historyTaskId, shotId)

    try {
      const response = await window.api.engineAPI.submitTask({
        nodeId: `director-vid-${shotId}`, historyTaskId, type: 'video',
        prompt: shot.prompt, modelId, configName: config.modelName || modelId,
        baseUrl, apiKey, ratio, resolution: 'Auto',
        sizeStr: sizeStr || `${w}x${h}`, w: w || 1280, h: h || 720,
        duration: vidDuration, sourceImages: [imgData.url],
        sourceVideos: [], sourceAudios: []
      })
      if (!response?.success) throw new Error(response?.error || '提交失败')
      setShotVideos((prev) => ({ ...prev, [shotId]: { ...prev[shotId], taskId: historyTaskId } }))
    } catch (err) {
      setShotVideos((prev) => ({ ...prev, [shotId]: { status: 'failed', url: '', taskId: '', error: err.message } }))
    }
  }, [scriptData, shotImages, videoModelId, videoModels, cfgs, globalApiKey, ratio])

  /* ── 批量生成视频（并行 fire-and-forget，间隔 500ms 错开） ── */
  const generateAllShotVideos = useCallback(() => {
    if (!scriptData?.shots?.length) return
    scriptData.shots.forEach((shot, i) => {
      setTimeout(() => {
        generateShotVideo(shot.id).catch((err) => {
          console.error('[DirectorNode] batch vid error for shot', shot.id, err)
        })
      }, i * 500)
    })
  }, [scriptData, generateShotVideo])

  /* ── 监听视频任务（step 4 保持监听） ── */
  useEffect(() => {
    if (step < 4 || !window.api?.engineAPI?.onTaskUpdated) return
    const cleanup = window.api.engineAPI.onTaskUpdated((task) => {
      const tid = task.payload?.historyTaskId || task.id
      const shotId = videoTaskToShotRef.current.get(tid)
      if (!shotId) return
      if (task.status === 'completed' && task.resultUrl) {
        setShotVideos((prev) => ({ ...prev, [shotId]: { status: 'done', url: getXingheMediaSrc(task.resultUrl), taskId: tid, error: '' } }))
      } else if (task.status === 'failed') {
        setShotVideos((prev) => ({ ...prev, [shotId]: { status: 'failed', url: '', taskId: tid, error: task.error || '生成失败' } }))
      }
    })
    return cleanup
  }, [step])

  const totalDuration = scriptData?.shots?.reduce((sum, ss) => sum + (ss.duration || 5), 0) || 0
  const imgDone = Object.values(shotImages).filter((v) => v.status === 'done').length
  const imgFailed = Object.values(shotImages).filter((v) => v.status === 'failed').length
  const vidDone = Object.values(shotVideos).filter((v) => v.status === 'done').length
  const vidFailed = Object.values(shotVideos).filter((v) => v.status === 'failed').length
  const shotCount = scriptData?.shots?.length || 0
  const hasImageStarted = Object.keys(shotImages).length > 0
  const hasVideoStarted = Object.keys(shotVideos).length > 0

  /* ══════════════════════ RENDER ══════════════════════ */
  return (
    <div className="flex flex-col h-full text-[var(--text-primary)] pointer-events-auto nodrag nopan" style={{ minHeight: 0 }}>
      {/* ── 标题栏 ── */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b shrink-0"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <div className="flex items-center gap-2">
          <Film size={14} className="text-amber-400" />
          <span className="text-[11px] font-bold">
            🎬 AI 导演 —{' '}
            {step === 1 ? '创意输入' : step === 2 ? '剧本预览' : step === 3 ? '分镜图' : '视频生成'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="w-1.5 h-1.5 rounded-full transition-all"
              style={{
                background: n === step ? '#f59e0b' : n < step ? '#34d399' : 'var(--border-color)',
                transform: n === step ? 'scale(1.4)' : 'scale(1)'
              }}
            />
          ))}
        </div>
      </div>
      <div className="text-[9px] text-[var(--text-muted)] px-4 py-1 border-b" style={{ borderColor: 'var(--border-color)' }}>
        {step === 1 && '描述想法，选择参数'}
        {step === 2 && (scriptLoading ? '🎬 AI 正在创作剧本...' : `共 ${shotCount} 个分镜，总时长约 ${totalDuration}s`)}
        {step === 3 && (
          hasImageStarted
            ? `${imgDone} / ${shotCount} 完成${imgFailed ? `，${imgFailed} 失败 ❌` : ''}`
            : '点击下方按钮开始生成分镜图'
        )}
        {step === 4 && (
          hasVideoStarted
            ? `${vidDone} / ${shotCount} 完成${vidFailed ? `，${vidFailed} 失败 ❌` : ''}`
            : '点击下方按钮开始生成视频'
        )}
      </div>

      {/* ── 内容区域 ── */}
      <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">

        {/* ═══ Step 1 ═══ */}
        {step === 1 && (
          <div className="px-4 py-3 flex flex-col gap-3">
            <div>
              <label className="text-[10px] font-semibold text-[var(--text-secondary)] mb-1 block">💡 创意想法</label>
              <textarea
                className="w-full h-16 bg-[var(--bg-secondary)] text-[11px] outline-none resize-none custom-scrollbar text-[var(--text-primary)] placeholder-[var(--text-muted)] leading-relaxed p-2 rounded-lg border border-[var(--border-color)] focus:border-amber-400/50 transition-colors"
                placeholder="例：运维工程师和前端开发因为一个 bug 引发的搞笑故事..."
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[var(--text-secondary)] mb-1 block">📐 比例</label>
              <div className="flex flex-wrap gap-1">
                {RATIOS.map((r) => <button key={r} onClick={() => setRatio(r)} className={selBtn(ratio === r)}>{r}</button>)}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[var(--text-secondary)] mb-1 block">⏱ 时长</label>
              <div className="flex flex-wrap gap-1">
                {DURATIONS.map((d) => <button key={d} onClick={() => setDuration(d)} className={selBtn(duration === d)}>{d}</button>)}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[var(--text-secondary)] mb-1 block">🎨 风格</label>
              <div className="flex flex-wrap gap-1">
                {STYLES.map((ss) => <button key={ss} onClick={() => setStyle(ss)} className={selBtn(style === ss)}>{ss}</button>)}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[var(--text-secondary)] mb-1 block">📖 走向</label>
              <div className="flex flex-wrap gap-1">
                {DIRECTIONS.map((d) => <button key={d.label} onClick={() => setDirection(d.label)} className={selBtn(direction === d.label)}>{d.label}</button>)}
              </div>
            </div>
            <input
              className="w-full bg-[var(--bg-secondary)] text-[10px] outline-none text-[var(--text-primary)] placeholder-[var(--text-muted)] p-2 rounded-lg border border-[var(--border-color)] focus:border-amber-400/50 transition-colors"
              placeholder="📝 其他补充要求（可选）"
              value={extraReq}
              onChange={(e) => setExtraReq(e.target.value)}
            />
            {/* 高级 */}
            <div>
              <button onClick={() => setShowAdvanced(!showAdvanced)} className="flex items-center gap-1 text-[9px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <ChevronRight size={8} className={`transition-transform ${showAdvanced ? 'rotate-90' : ''}`} /> 模型选择
              </button>
              {showAdvanced && (
                <div className="mt-1 flex flex-col gap-1.5 pl-2 border-l-2 border-[var(--border-color)]">
                  {[
                    { label: '剧本', models: chatModels, val: chatModelId, set: setChatModelId },
                    { label: '图像', models: imageModels, val: imageModelId, set: setImageModelId },
                    { label: '视频', models: videoModels, val: videoModelId, set: setVideoModelId }
                  ].map((m) => (
                    <div key={m.label} className="flex items-center gap-1.5">
                      <span className="text-[9px] text-[var(--text-muted)] w-8 shrink-0">{m.label}</span>
                      <select className="flex-1 bg-[var(--bg-secondary)] text-[10px] text-[var(--text-primary)] p-1 rounded border border-[var(--border-color)] outline-none" value={m.val} onChange={(e) => m.set(e.target.value)}>
                        <option value="">自动</option>
                        {m.models.map((mm) => <option key={mm.id} value={mm.id}>{mm.provider}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ Step 2 ═══ */}
        {step === 2 && (
          <div className="px-4 py-3 flex flex-col gap-3">
            {scriptLoading && (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <div className="w-8 h-8 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                <p className="text-[11px] text-[var(--text-secondary)]">🎬 AI 创作中...</p>
              </div>
            )}
            {scriptError && <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[10px] text-red-400">{scriptError}</div>}
            {scriptData && !scriptLoading && (
              <>
                <div className="text-[12px] font-bold text-amber-400 mb-1">📽 {scriptData.title}</div>
                <div className="flex flex-col gap-2">
                  {scriptData.shots?.map((shot) => (
                    <div key={shot.id} className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2">
                      <details>
                        <summary className="cursor-pointer text-[10px] font-bold text-amber-300 flex items-center gap-1">
                          Shot {shot.id} <span className="text-[var(--text-muted)] font-normal">{shot.duration}s · {shot.prompt_cn?.slice(0, 30)}...</span>
                        </summary>
                        <div className="mt-1.5 flex flex-col gap-1">
                          <div className="flex items-start gap-1">
                            <span className="text-[9px] text-[var(--text-muted)] w-8 shrink-0 mt-0.5">EN</span>
                            {editingShot?.id === shot.id && editingShot.field === 'prompt' ? (
                              <div className="flex-1 flex gap-1">
                                <textarea className="flex-1 bg-[var(--bg-base)] text-[9px] p-1 rounded border border-amber-500/50 outline-none resize-none h-12 text-[var(--text-primary)]" value={editValue} onChange={(e) => setEditValue(e.target.value)} />
                                <button onClick={saveEditShot} className="shrink-0 text-emerald-400"><Check size={12} /></button>
                              </div>
                            ) : (
                              <p className="flex-1 text-[9px] text-[var(--text-secondary)] leading-relaxed">{shot.prompt}
                                <button onClick={() => startEditShot(shot.id, 'prompt')} className="ml-1 text-[var(--text-muted)] hover:text-amber-400 inline"><Edit size={9} /></button>
                              </p>
                            )}
                          </div>
                          <div className="flex items-start gap-1">
                            <span className="text-[9px] text-[var(--text-muted)] w-8 shrink-0 mt-0.5">CN</span>
                            {editingShot?.id === shot.id && editingShot.field === 'prompt_cn' ? (
                              <div className="flex-1 flex gap-1">
                                <textarea className="flex-1 bg-[var(--bg-base)] text-[9px] p-1 rounded border border-amber-500/50 outline-none resize-none h-10 text-[var(--text-primary)]" value={editValue} onChange={(e) => setEditValue(e.target.value)} />
                                <button onClick={saveEditShot} className="shrink-0 text-emerald-400"><Check size={12} /></button>
                              </div>
                            ) : (
                              <p className="flex-1 text-[9px] text-[var(--text-secondary)] leading-relaxed">{shot.prompt_cn}
                                <button onClick={() => startEditShot(shot.id, 'prompt_cn')} className="ml-1 text-[var(--text-muted)] hover:text-amber-400 inline"><Edit size={9} /></button>
                              </p>
                            )}
                          </div>
                        </div>
                      </details>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══ Step 3: 分镜图 ═══ */}
        {step === 3 && (
          <div className="px-4 py-3 flex flex-col gap-2">
            {scriptData?.shots?.map((shot) => {
              const img = shotImages[shot.id] || { status: 'idle' }
              const isFailed = img.status === 'failed'
              return (
                <div key={shot.id} className={`rounded-lg border overflow-hidden ${isFailed ? 'border-red-500/50 bg-red-500/5' : 'border-[var(--border-color)] bg-[var(--bg-secondary)]'}`}>
                  <div className="flex gap-2 p-2">
                    <div className={`w-24 h-16 rounded border flex items-center justify-center shrink-0 overflow-hidden ${isFailed ? 'border-red-500/30 bg-red-500/10' : 'border-[var(--border-color)] bg-[var(--bg-base)]'}`}>
                      {img.status === 'done' && img.url ? (
                        <img src={img.url} alt={`Shot ${shot.id}`} className="w-full h-full object-cover" />
                      ) : img.status === 'generating' ? (
                        <Loader2 size={16} className="text-amber-400 animate-spin" />
                      ) : isFailed ? (
                        <span className="text-[8px] text-red-400 font-bold">❌ 失败</span>
                      ) : (
                        <ImageIcon size={14} className="text-[var(--text-muted)]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[9px] font-bold text-amber-400">Shot {shot.id}</span>
                        {img.status === 'done' && <span className="text-[8px] px-1 rounded bg-emerald-500/20 text-emerald-400">✓</span>}
                        {img.status === 'generating' && <span className="text-[8px] px-1 rounded bg-amber-500/20 text-amber-300">生成中</span>}
                        {isFailed && <span className="text-[8px] px-1 rounded bg-red-500/20 text-red-400 font-bold">{img.error || '生成失败'}</span>}
                      </div>
                      <p className="text-[8px] text-[var(--text-secondary)] line-clamp-2 leading-relaxed">{shot.prompt_cn}</p>
                      <button
                        onClick={() => generateShotImage(shot.id)}
                        className={`flex items-center gap-0.5 px-1.5 py-0.5 mt-1 rounded text-[8px] border transition-colors ${isFailed ? 'text-red-400 border-red-500/40 hover:bg-red-500/10 font-bold' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border-[var(--border-color)]'}`}
                      >
                        <RefreshCw size={8} /> {isFailed ? '⚡ 重试' : img.status === 'done' ? '重新生成' : '生成'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ═══ Step 4: 视频生成 ═══ */}
        {step === 4 && (
          <div className="px-4 py-3 flex flex-col gap-2">
            {scriptData?.shots?.map((shot) => {
              const vid = shotVideos[shot.id] || { status: 'pending' }
              const img = shotImages[shot.id]
              return (
                <div key={shot.id} className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] overflow-hidden">
                  <div className="flex gap-2 p-2">
                    <div className="w-28 h-18 rounded border border-[var(--border-color)] bg-black flex items-center justify-center shrink-0 overflow-hidden relative">
                      {vid.status === 'done' && vid.url ? (
                        <video src={vid.url} className="w-full h-full object-cover" controls muted loop />
                      ) : img?.url ? (
                        <>
                          <img src={img.url} alt={`Shot ${shot.id}`} className="w-full h-full object-cover opacity-60" />
                          {vid.status === 'generating' && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Loader2 size={18} className="text-amber-400 animate-spin" />
                            </div>
                          )}
                        </>
                      ) : vid.status === 'generating' ? (
                        <Loader2 size={18} className="text-amber-400 animate-spin" />
                      ) : (
                        <Video size={14} className="text-[var(--text-muted)]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[9px] font-bold text-amber-400">Shot {shot.id}</span>
                        <span className="text-[8px] text-[var(--text-muted)]">{shot.duration}s</span>
                        {vid.status === 'done' && <span className="text-[8px] px-1 rounded bg-emerald-500/20 text-emerald-400">✓</span>}
                        {vid.status === 'generating' && <span className="text-[8px] px-1 rounded bg-amber-500/20 text-amber-300">生成中</span>}
                        {vid.status === 'failed' && <span className="text-[8px] px-1 rounded bg-red-500/20 text-red-400">{vid.error || '失败'}</span>}
                      </div>
                      <p className="text-[8px] text-[var(--text-secondary)] line-clamp-2 leading-relaxed">{shot.prompt_cn}</p>
                      <button
                        onClick={() => generateShotVideo(shot.id)}
                        disabled={vid.status === 'generating'}
                        className="flex items-center gap-0.5 px-1.5 py-0.5 mt-1 rounded text-[8px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] transition-colors disabled:opacity-40"
                      >
                        <RefreshCw size={8} /> {vid.status === 'done' ? '重新生成' : '生成'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── 底部操作栏 ── */}
      <div className="flex items-center justify-between px-4 py-2 border-t shrink-0" style={{ borderColor: 'var(--border-color)' }}>
        {step === 1 && (
          <>
            <div />
            <button
              onClick={generateScript}
              disabled={!idea.trim()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
              style={{
                background: idea.trim() ? 'linear-gradient(135deg, #f59e0b, #ef4444)' : 'var(--bg-secondary)',
                color: idea.trim() ? '#fff' : 'var(--text-muted)'
              }}
            >
              <Sparkles size={12} /> 生成剧本
            </button>
          </>
        )}

        {step === 2 && !scriptLoading && (
          <>
            <button onClick={() => setStep(1)} className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
              <ChevronLeft size={12} /> 返回
            </button>
            <div className="flex items-center gap-1.5">
              <button onClick={generateScript} className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)]">
                🔄 重新生成
              </button>
              {scriptData && (
                <button
                  onClick={() => setStep(3)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-semibold hover:scale-105 transition-all"
                  style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)', color: '#fff' }}
                >
                  确认剧本 → 下一步 <ChevronRight size={12} />
                </button>
              )}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <button onClick={() => setStep(2)} className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
              <ChevronLeft size={12} /> 返回
            </button>
            <div className="flex items-center gap-1.5">
              <button
                onClick={generateAllShotImages}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-semibold hover:scale-105 transition-all"
                style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)', color: '#fff' }}
              >
                <ImageIcon size={12} /> {hasImageStarted ? '🔄 全部重新生成' : '🚀 开始生成全部分镜图'}
              </button>
              {imgFailed > 0 && (
                <button
                  onClick={() => {
                    scriptData?.shots?.forEach((ss) => {
                      const img = shotImages[ss.id]
                      if (img?.status === 'failed') generateShotImage(ss.id)
                    })
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-red-400 hover:bg-red-500/10 border border-red-500/40"
                >
                  ⚡ 重试失败项 ({imgFailed})
                </button>
              )}
              {imgDone > 0 && imgDone === shotCount && (
                <button
                  onClick={() => setStep(4)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-semibold hover:scale-105 transition-all"
                  style={{ background: 'linear-gradient(135deg, #34d399, #06b6d4)', color: '#fff' }}
                >
                  确认 → 下一步 <ChevronRight size={12} />
                </button>
              )}
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <button onClick={() => setStep(3)} className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
              <ChevronLeft size={12} /> 返回
            </button>
            <div className="flex items-center gap-1.5">
              <button
                onClick={generateAllShotVideos}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-semibold hover:scale-105 transition-all"
                style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)', color: '#fff' }}
              >
                <Video size={12} /> {hasVideoStarted ? '🔄 全部重新生成' : '🚀 开始生成全部视频'}
              </button>
              {vidFailed > 0 && (
                <button
                  onClick={() => {
                    scriptData?.shots?.forEach((ss) => {
                      const vid = shotVideos[ss.id]
                      if (vid?.status === 'failed') generateShotVideo(ss.id)
                    })
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-red-400 hover:bg-red-500/10 border border-red-500/40"
                >
                  ⚡ 重试失败项 ({vidFailed})
                </button>
              )}
              {Object.values(shotVideos).length > 0 && Object.values(shotVideos).every((v) => v.status === 'done') && (
                <>
                  <button
                    onClick={async () => {
                      setConcatExporting(true)
                      try {
                        const videoPaths = scriptData.shots.map((ss) => shotVideos[ss.id]?.url).filter(Boolean)
                        const title = scriptData.title || 'ai_director'
                        const outputName = `${title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}_${Date.now()}.mp4`
                        const result = await window.api.localCacheAPI.concatVideos(videoPaths, outputName)
                        if (result.success) {
                          if (result.exported !== false) alert(`✅ 已导出: ${result.path}`)
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
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-semibold hover:scale-105 transition-all disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #34d399, #06b6d4)', color: '#fff' }}
                  >
                    {concatExporting
                      ? <><Loader2 size={12} className="animate-spin" /> 拼接中...</>
                      : <><Download size={12} /> 导出视频</>}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
})
