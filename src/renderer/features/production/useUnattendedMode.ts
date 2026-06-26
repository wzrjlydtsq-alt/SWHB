/**
 * 无人值守模式 — 全自动化剧集生产流水线
 *
 * Phase 1: IMAGE_GENERATION — 图片板全部任务生成
 * Phase 2: IMAGE_RETRY     — 失败任务自动重试
 * Phase 3: ASSET_UPLOAD     — 角色/场景/道具行生成图 → 自动上传通用行 + Asset ID
 * Phase 4: VIDEO_GENERATION — 切换视频板 → 生成视频任务
 * Phase 5: VIDEO_RETRY      — 视频失败重试
 * Phase 6: COMPLETED        — 完成，飞书推送最终报告
 */
import { useRef, useCallback, useEffect } from 'react'
import { useAppStore } from '../../store/useAppStore'

// ═══ 阶段常量 ═══
export const PHASES = {
  IDLE: 'IDLE',
  IMAGE_GENERATION: 'IMAGE_GENERATION',
  IMAGE_RETRY: 'IMAGE_RETRY',
  ASSET_UPLOAD: 'ASSET_UPLOAD',
  SWITCH_TO_VIDEO: 'SWITCH_TO_VIDEO',
  VIDEO_GENERATION: 'VIDEO_GENERATION',
  VIDEO_RETRY: 'VIDEO_RETRY',
  COMPLETED: 'COMPLETED',
  STOPPED: 'STOPPED'
}

export const PHASE_LABELS = {
  [PHASES.IDLE]: '待启动',
  [PHASES.IMAGE_GENERATION]: '📷 图片生成中',
  [PHASES.IMAGE_RETRY]: '🔄 图片失败重试',
  [PHASES.ASSET_UPLOAD]: '📤 资产上传中',
  [PHASES.SWITCH_TO_VIDEO]: '🔀 切换视频板',
  [PHASES.VIDEO_GENERATION]: '🎬 视频生成中',
  [PHASES.VIDEO_RETRY]: '🔄 视频失败重试',
  [PHASES.COMPLETED]: '✅ 全部完成',
  [PHASES.STOPPED]: '⏹️ 已停止'
}

export function useUnattendedMode({
  rows,
  setRows,
  commonValues,
  setCommonValues,
  startRowTask,
  isVideo,
  setProductionBoardMode,
  handleBatchUploadAssets
}) {
  const unattendedMode = useAppStore((s) => s.unattendedMode)
  const setUnattendedMode = useAppStore((s) => s.setUnattendedMode)

  const stateRef = useRef(unattendedMode)
  const retryCountRef = useRef({}) // { rowId: retryCount }
  const reportTimerRef = useRef(null)
  const phaseCheckTimerRef = useRef(null)
  const rowsRef = useRef(rows)
  const commonRef = useRef(commonValues)

  // 始终保持 ref 最新
  useEffect(() => {
    stateRef.current = unattendedMode
  }, [unattendedMode])
  useEffect(() => {
    rowsRef.current = rows
  }, [rows])
  useEffect(() => {
    commonRef.current = commonValues
  }, [commonValues])

  // ═══ 工具函数 ═══
  const updateState = useCallback(
    (patch) => {
      const next = { ...(stateRef.current || {}), ...patch }
      stateRef.current = next
      setUnattendedMode(next)
    },
    [setUnattendedMode]
  )

  const log = useCallback((msg) => {
    console.log(`[无人值守] ${msg}`)
  }, [])

  // ═══ 飞书推送 ═══
  const sendFeishuReport = useCallback(
    async (forceMsg?: string) => {
      const state = stateRef.current
      if (!state?.config?.feishuEnabled || !state?.config?.feishuChatId) return
      const currentRows = rowsRef.current || []
      const done = currentRows.filter((r) => r.status === 'done').length
      const failed = currentRows.filter((r) => r.status === 'failed').length
      const generating = currentRows.filter((r) => r.status === 'generating').length
      const total = currentRows.length
      const elapsed = state.startTime ? Math.floor((Date.now() - state.startTime) / 60000) : 0

      const text =
        forceMsg ||
        [
          '📊 星河智绘 · 无人值守报告',
          '',
          `📌 当前阶段: ${PHASE_LABELS[state.phase] || state.phase}`,
          `✅ 完成: ${done}/${total}`,
          generating > 0 ? `⏳ 生成中: ${generating}` : null,
          failed > 0 ? `❌ 失败: ${failed}` : null,
          `⏱️ 运行时间: ${elapsed} 分钟`,
          '',
          state.config?.reportInterval ? `下次汇报: ${state.config.reportInterval} 分钟后` : null
        ]
          .filter(Boolean)
          .join('\n')

      try {
        await window.api.invoke('feishu:push-message', {
          chatId: state.config.feishuChatId,
          text
        })
        log('飞书汇报已发送')
      } catch (err) {
        log(`飞书汇报失败: ${err.message}`)
      }
    },
    [log]
  )

  // ═══ 启动定时汇报 ═══
  const startReportTimer = useCallback(() => {
    if (reportTimerRef.current) clearInterval(reportTimerRef.current)
    const state = stateRef.current
    if (!state?.config?.feishuEnabled || !state?.config?.reportInterval) return
    const ms = state.config.reportInterval * 60000
    reportTimerRef.current = setInterval(() => {
      if (stateRef.current?.active) sendFeishuReport()
    }, ms)
  }, [sendFeishuReport])

  // ═══ 检查行状态，判断是否可以进入下一阶段 ═══
  const checkPhaseCompletion = useCallback(async () => {
    const state = stateRef.current
    if (!state?.active) return

    const currentRows = rowsRef.current || []
    const done = currentRows.filter((r) => r.status === 'done').length
    const failed = currentRows.filter((r) => r.status === 'failed').length
    const idle = currentRows.filter((r) => !r.status || r.status === 'idle').length
    const total = currentRows.length
    const generating = currentRows.filter(
      (r) => r.status === 'generating' || r.status === 'pending'
    ).length
    const allFinished = generating === 0 && done + failed + idle >= total

    // 更新进度
    updateState({ progress: { done, failed, generating, total } })

    if (!allFinished) return // 还有在跑的，等

    const maxRetries = state.config?.maxRetries ?? 3
    const timeoutMin = state.config?.timeoutMinutes ?? 30
    const elapsed = state.startTime ? (Date.now() - state.startTime) / 60000 : 0
    const timedOut = elapsed >= timeoutMin && timeoutMin > 0

    // ── Phase: IMAGE_GENERATION / IMAGE_RETRY ──
    if (state.phase === PHASES.IMAGE_GENERATION || state.phase === PHASES.IMAGE_RETRY) {
      if (failed > 0 && !timedOut) {
        // 检查重试次数
        const canRetry = currentRows.some((r) => {
          if (r.status !== 'failed') return false
          return (retryCountRef.current[r.id] || 0) < maxRetries
        })
        if (canRetry) {
          updateState({ phase: PHASES.IMAGE_RETRY })
          log(`图片阶段: ${failed} 个失败, 开始重试...`)
          for (let i = 0; i < currentRows.length; i++) {
            const r = currentRows[i]
            if (r.status === 'failed' && (retryCountRef.current[r.id] || 0) < maxRetries) {
              retryCountRef.current[r.id] = (retryCountRef.current[r.id] || 0) + 1
              log(`  重试行 "${r.name}" (${retryCountRef.current[r.id]}/${maxRetries})`)
              await startRowTask(r, i)
              await new Promise((res) => setTimeout(res, 500))
            }
          }
          return // 等重试结果
        }
      }

      // 图片阶段完成 → 资产上传
      log(`图片阶段完成: ${done} 成功, ${failed} 失败`)
      updateState({ phase: PHASES.ASSET_UPLOAD })
      await doAssetUpload()
    }

    // ── Phase: VIDEO_GENERATION / VIDEO_RETRY ──
    else if (state.phase === PHASES.VIDEO_GENERATION || state.phase === PHASES.VIDEO_RETRY) {
      if (failed > 0 && !timedOut) {
        const canRetry = currentRows.some((r) => {
          if (r.status !== 'failed') return false
          return (retryCountRef.current[r.id] || 0) < maxRetries
        })
        if (canRetry) {
          updateState({ phase: PHASES.VIDEO_RETRY })
          log(`视频阶段: ${failed} 个失败, 开始重试...`)
          for (let i = 0; i < currentRows.length; i++) {
            const r = currentRows[i]
            if (r.status === 'failed' && (retryCountRef.current[r.id] || 0) < maxRetries) {
              retryCountRef.current[r.id] = (retryCountRef.current[r.id] || 0) + 1
              log(`  重试行 "${r.name}" (${retryCountRef.current[r.id]}/${maxRetries})`)
              await startRowTask(r, i)
              await new Promise((res) => setTimeout(res, 500))
            }
          }
          return
        }
      }

      // 视频阶段完成
      log(`视频阶段完成: ${done} 成功, ${failed} 失败`)
      updateState({ phase: PHASES.COMPLETED, active: false })
      sendFeishuReport(
        `✅ 星河智绘 · 无人值守完成\n\n🎬 视频: ${done}/${total} 完成\n❌ 失败: ${failed}\n⏱️ 总耗时: ${Math.floor(elapsed)} 分钟`
      )
      cleanup()
    }
  }, [updateState, startRowTask, sendFeishuReport, log])

  // ═══ 资产上传：自动把角色/场景/道具行的生成图上传到通用行，然后调用一键上传获取 Asset ID ═══
  const doAssetUpload = useCallback(async () => {
    log('开始自动上传资产...')
    const currentRows = rowsRef.current || []
    let addedCharacters = false

    for (const row of currentRows) {
      if (row.status !== 'done' || !row.previews?.length) continue
      const latestPreview = row.previews[row.previews.length - 1]
      if (!latestPreview?.url) continue

      const name = (row.name || '').toLowerCase()
      let refKey = null

      if (name.includes('角色') || name.includes('character')) {
        refKey = 'refCharacters'
        addedCharacters = true
      } else if (name.includes('道具') || name.includes('prop')) {
        refKey = 'refProps'
      } else if (name.includes('场景') || name.includes('scene')) {
        refKey = 'refScenes'
      }

      if (!refKey) continue

      // 添加到通用行参考
      const item = { path: latestPreview.url, name: row.name }
      setCommonValues((prev) => ({
        ...prev,
        [refKey]: [...(prev[refKey] || []).filter((r) => r.name !== item.name), item]
      }))
      log(`  已添加 "${row.name}" 到通用行·${refKey}`)
    }

    // 等 state 更新完毕
    await new Promise((r) => setTimeout(r, 500))

    // 调用已有的一键上传角色获取 Asset ID（静默模式，不弹窗）
    if (addedCharacters && handleBatchUploadAssets) {
      log('调用一键上传角色获取 Asset ID...')
      const maxUploadRetries = stateRef.current?.config?.maxRetries ?? 3

      let result = await handleBatchUploadAssets(false, true)
      log(`首次上传结果: ${result?.doneCount || 0} 成功, ${result?.failCount || 0} 失败`)

      // 失败自动重试
      let retryAttempt = 0
      while (result?.failCount > 0 && retryAttempt < maxUploadRetries) {
        retryAttempt++
        log(`Asset 上传重试 (${retryAttempt}/${maxUploadRetries})...`)
        await new Promise((r) => setTimeout(r, 2000))
        result = await handleBatchUploadAssets(true, true) // retryOnly=true
        log(`重试结果: ${result?.doneCount || 0} 成功, ${result?.failCount || 0} 失败`)
      }

      if (result?.failCount > 0) {
        log(`⚠️ Asset 上传仍有 ${result.failCount} 个失败，继续流程`)
      } else {
        log('✅ 所有角色 Asset ID 获取成功')
      }
    } else {
      log('没有角色行需要上传 Asset ID')
    }

    log('资产上传阶段完成')

    // 自动继续视频
    const state = stateRef.current
    if (state?.config?.afterImage === 'auto') {
      updateState({ phase: PHASES.SWITCH_TO_VIDEO })
      log('2 秒后自动切换视频板...')
      await new Promise((r) => setTimeout(r, 2000))
      await switchToVideo()
    } else {
      // 暂停等待用户确认
      updateState({ phase: PHASES.ASSET_UPLOAD, waitingConfirm: true })
      log('资产上传完成，等待用户确认切换视频板')
    }
  }, [setCommonValues, updateState, log, handleBatchUploadAssets])

  // ═══ 切换到视频板并开始生成 ═══
  const switchToVideo = useCallback(async () => {
    log('切换到视频板...')
    setProductionBoardMode('video')
    updateState({ phase: PHASES.SWITCH_TO_VIDEO })
    retryCountRef.current = {} // 重置重试计数

    // 等待模式切换和行数据加载
    await new Promise((res) => setTimeout(res, 1500))

    updateState({ phase: PHASES.VIDEO_GENERATION })
    log('开始视频板任务生成...')

    // 需要等新的 rows 加载后再发起任务 — 通过 phaseCheck 循环自动触发
    // 这里直接启动所有视频行任务
    const videoRows = rowsRef.current || []
    for (let i = 0; i < videoRows.length; i++) {
      const row = videoRows[i]
      const finalPrompt = row.prompt || commonRef.current?.prompt
      if (!finalPrompt) continue
      await startRowTask(row, i)
      if (i < videoRows.length - 1) await new Promise((r) => setTimeout(r, 300))
    }
    log(`已发起 ${videoRows.length} 个视频任务`)
  }, [setProductionBoardMode, updateState, startRowTask, log])

  // ═══ 启动无人值守 ═══
  const startUnattended = useCallback(
    async (config) => {
      log('🤖 无人值守模式启动!')
      log(`配置: ${JSON.stringify(config)}`)

      retryCountRef.current = {}
      const state = {
        active: true,
        phase: PHASES.IMAGE_GENERATION,
        config,
        startTime: Date.now(),
        progress: { done: 0, failed: 0, generating: 0, total: rows.length },
        waitingConfirm: false
      }
      setUnattendedMode(state)
      stateRef.current = state

      // 启动定时汇报
      startReportTimer()

      // 首先确保在图片模式
      if (isVideo) {
        setProductionBoardMode('image')
        await new Promise((r) => setTimeout(r, 1500))
      }

      // 发起所有图片任务
      const currentRows = rowsRef.current || []
      for (let i = 0; i < currentRows.length; i++) {
        const row = currentRows[i]
        const finalPrompt = row.prompt || commonRef.current?.prompt
        if (!finalPrompt) continue
        await startRowTask(row, i)
        if (i < currentRows.length - 1) await new Promise((r) => setTimeout(r, 300))
      }
      log(`已发起 ${currentRows.length} 个图片任务`)

      sendFeishuReport(
        `🤖 星河智绘 · 无人值守已启动\n\n📷 图片任务: ${currentRows.length} 个\n⏱️ 开始时间: ${new Date().toLocaleTimeString()}`
      )
    },
    [
      rows,
      isVideo,
      setUnattendedMode,
      startReportTimer,
      setProductionBoardMode,
      startRowTask,
      sendFeishuReport,
      log
    ]
  )

  // ═══ 停止 ═══
  const stopUnattended = useCallback(() => {
    log('⏹️ 无人值守模式已停止')
    updateState({ active: false, phase: PHASES.STOPPED })
    cleanup()
    sendFeishuReport('⏹️ 星河智绘 · 无人值守已手动停止')
  }, [updateState, sendFeishuReport, log])

  // ═══ 用户确认继续视频 ═══
  const confirmSwitchToVideo = useCallback(() => {
    updateState({ waitingConfirm: false })
    switchToVideo()
  }, [updateState, switchToVideo])

  // ═══ 清理 ═══
  const cleanup = useCallback(() => {
    if (reportTimerRef.current) {
      clearInterval(reportTimerRef.current)
      reportTimerRef.current = null
    }
    if (phaseCheckTimerRef.current) {
      clearInterval(phaseCheckTimerRef.current)
      phaseCheckTimerRef.current = null
    }
  }, [])

  // ═══ 监听行状态变化 → 检查阶段完成 ═══
  useEffect(() => {
    if (!unattendedMode?.active) return

    // 设置轮询检查（每 5 秒检查一次行状态）
    if (phaseCheckTimerRef.current) clearInterval(phaseCheckTimerRef.current)
    phaseCheckTimerRef.current = setInterval(() => {
      checkPhaseCompletion()
    }, 5000)

    return () => {
      if (phaseCheckTimerRef.current) {
        clearInterval(phaseCheckTimerRef.current)
        phaseCheckTimerRef.current = null
      }
    }
  }, [unattendedMode?.active, checkPhaseCompletion])

  // 组件卸载时清理
  useEffect(() => cleanup, [cleanup])

  return {
    unattendedMode,
    startUnattended,
    stopUnattended,
    confirmSwitchToVideo,
    PHASES,
    PHASE_LABELS
  }
}
