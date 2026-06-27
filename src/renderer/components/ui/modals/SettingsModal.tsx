import {
  Trash2,
  Plus,
  LinkIcon,
  Eye,
  EyeOff,
  RefreshCw,
  HardDrive,
  Database,
  AlertCircle
} from '../../../utils/icons.tsx'
import {
  DEFAULT_GROUP_API_URLS,
  DELETED_MODEL_IDS,
  LINGJING_XINGHE_TOP_GATEWAY_URL,
  MODEL_API_BASE_URL_OPTIONS,
  OPENAI_COMPATIBLE_GATEWAY_URL,
  T8STAR_IMAGE_GATEWAY_URL,
  isAllowedModelApiBaseUrl,
  normalizeModelApiBaseUrl,
  normalizeOptionalModelApiBaseUrl
} from '../../../utils/constants.ts'
import { Button } from '../Button.tsx'
import { Modal } from '../Modal.tsx'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../../../store/useAppStore.ts'
import { useShallow } from 'zustand/react/shallow'
import { getSettingJSON, setSettingJSON } from '../../../services/dbService.ts'
import { FeishuSettings } from '../../settings/FeishuSettings.tsx'
import {
  clearVodTranslationConfig,
  getVodTranslationConfig,
  saveVodTranslationConfig
} from '../../../features/dubbing/vodAiTranslationService.ts'

const WORKSPACE_APPROVAL_MODE_KEY = 'workspace_home_approval_mode_v1'
const WORKSPACE_ACCESS_POLICY_KEY = 'workspace_home_access_policy_v1'

const isSelectableBaseUrl = (value) => {
  const trimmed = String(value || '').trim()
  return !trimmed || isAllowedModelApiBaseUrl(trimmed)
}

const formatBaseUrlOption = (option) => option.value

const normalizeUrl = (value: any) => String(value || '').trim().replace(/\/+$/, '')

const getCleanSourceLabel = (api) => {
  const url = normalizeUrl(api?.url)
  if (url === normalizeUrl(OPENAI_COMPATIBLE_GATEWAY_URL)) return 'Sub2API'
  if (url === normalizeUrl(T8STAR_IMAGE_GATEWAY_URL)) return 'T8Star'
  if (url === 'https://dashscope.aliyuncs.com') return 'DashScope'
  if (url === LINGJING_XINGHE_TOP_GATEWAY_URL) return 'Lingjing'
  return ''
}

const humanizeCleanModelName = (value) => {
  const raw = String(value || '').trim()
  const key = raw.toLowerCase()
  if (key === 'gpt-image-2') return 'GPT Image 2'
  if (key === 'gpt-4o-mini') return 'GPT-4o Mini'
  return raw
}

const formatModelDisplay = (api) => {
  const provider = String(api?.provider || '').trim()
  const modelName = humanizeCleanModelName(api?.modelName || api?.id)
  const modelKey = String(api?.modelName || api?.id || '').trim().toLowerCase()
  if (!modelKey.includes('gpt')) return modelName || provider || 'Unknown model'

  const source = getCleanSourceLabel(api)
  return source ? `${source}\u00b7 ${modelName}` : modelName
}

const getModelSourceLabel = (api) => {
  const url = normalizeUrl(api?.url)
  if (url === normalizeUrl(OPENAI_COMPATIBLE_GATEWAY_URL)) return 'Sub2API'
  if (url === normalizeUrl(T8STAR_IMAGE_GATEWAY_URL)) return 'T8Star 图片'
  return ''
}

const formatModelLabel = (api) => {
  const url = normalizeUrl(api?.url)
  const modelKey = String(api?.modelName || api?.id || '').trim().toLowerCase()
  if (url === normalizeUrl(OPENAI_COMPATIBLE_GATEWAY_URL) && modelKey === 'gpt-image-2') {
    return 'Sub2API· GPT Image 2'
  }

  const provider = String(api?.provider || '').trim()
  const modelName = String(api?.modelName || api?.id || '').trim()
  const base =
    provider && modelName && provider !== modelName
      ? `${provider} · ${modelName}`
      : provider || modelName || 'Unknown model'
  const source = getModelSourceLabel(api)
  return source && !base.toLowerCase().includes(source.toLowerCase()) ? `${base} · ${source}` : base
}

const dedupeSettingsApiConfigs = (apiConfigs: any[] = [], activeApiTab: string) => {
  const seen = new Set<string>()
  const result: any[] = []
  for (const api of Array.isArray(apiConfigs) ? apiConfigs : []) {
    if (DELETED_MODEL_IDS.includes(api?.id) || api?.type !== activeApiTab) continue
    const key = String(api.id || api.modelName || '').trim().toLowerCase()
    if (key && seen.has(key)) continue
    if (key) seen.add(key)
    result.push(api)
  }
  return result
}

export function SettingsModal({
  settingsOpen,
  setSettingsOpen,
  apiConfigs,
  jimengUseLocalFile,
  setJimengUseLocalFile,
  deleteApiConfig,
  updateApiConfig,
  testApiConnection,
  apiTesting,
  apiStatus,
  addNewModel,
  getStatusColor
}: any) {
  const [activeApiTab, setActiveApiTab] = useState('Chat')
  const [activeSettingsTab, setActiveSettingsTab] = useState('general')
  const [globalSaveStatus, setGlobalSaveStatus] = useState('')
  const [visibleKeys, setVisibleKeys] = useState(new Set())
  const [manualUpdateChecking, setManualUpdateChecking] = useState(false)
  const [manualUpdateStatus, setManualUpdateStatus] = useState('')
  const [healthChecking, setHealthChecking] = useState(false)
  const [healthResult, setHealthResult] = useState<any>(null)
  const [healthStatus, setHealthStatus] = useState('')
  const [updatePreflightChecking, setUpdatePreflightChecking] = useState(false)
  const [updatePreflightStatus, setUpdatePreflightStatus] = useState('')
  const [diagnosticsExportStatus, setDiagnosticsExportStatus] = useState('')

  const {
    uiScale,
    autoSaveInterval,
    showConnectionAnimations,
    silenceConfirmations,
    setUiScale,
    setAutoSaveInterval,
    setShowConnectionAnimations,
    setSilenceConfirmations,
    enableGpu,
    setEnableGpu,
    enableUpdateCheck,
    setEnableUpdateCheck,
    currentProject,
    setCurrentProject
  } = useAppStore(
    useShallow((state) => ({
      uiScale: state.uiScale,
      autoSaveInterval: state.autoSaveInterval,
      showConnectionAnimations: state.showConnectionAnimations,
      silenceConfirmations: state.silenceConfirmations,
      setUiScale: state.setUiScale,
      setAutoSaveInterval: state.setAutoSaveInterval,
      setShowConnectionAnimations: state.setShowConnectionAnimations,
      setSilenceConfirmations: state.setSilenceConfirmations,
      enableGpu: state.enableGpu,
      setEnableGpu: state.setEnableGpu,
      enableUpdateCheck: state.enableUpdateCheck,
      setEnableUpdateCheck: state.setEnableUpdateCheck,
      currentProject: state.currentProject,
      setCurrentProject: state.setCurrentProject
    }))
  )

  useEffect(() => {
    const handleOpenSettingsTab = (event: Event) => {
      const tabId = (event as CustomEvent<string>).detail
      if (typeof tabId === 'string') {
        setActiveSettingsTab(tabId)
      }
    }
    window.addEventListener('open-settings-tab', handleOpenSettingsTab)
    return () => window.removeEventListener('open-settings-tab', handleOpenSettingsTab)
  }, [])

  const updateProjectCacheRoot = useCallback(
    async (cacheRoot) => {
      if (!currentProject?.id) return
      if (window.api?.invoke) {
        const result = await window.api.invoke('cache:config', {
          projectId: currentProject.id,
          cacheRoot: cacheRoot || null,
          persist: true
        })
        if (result?.success === false) throw new Error(result.error || 'Failed to save cache folder')
      }
      const nextProject = { ...currentProject, cacheRoot: cacheRoot || null }
      setCurrentProject(nextProject)
      if (window.dbAPI?.settings) {
        window.dbAPI.settings
          .set('tapnow_current_project', JSON.stringify(nextProject))
          .catch(() => {})
      }
    },
    [currentProject, setCurrentProject]
  )

  const handleManualUpdateCheck = useCallback(async () => {
    if (!window.api?.updater?.checkForUpdates) {
      setManualUpdateStatus('当前环境不支持检查更新')
      return
    }

    setManualUpdateChecking(true)
    setManualUpdateStatus('正在检查更新...')
    try {
      const result = await window.api.updater.checkForUpdates({ manual: true })
      if (result && result.success === false) {
        throw new Error(result.error || '检查更新失败')
      }
      setManualUpdateStatus('检查完成，请查看右下角更新提示')
    } catch (error) {
      setManualUpdateStatus(`检查失败：${error?.message || error}`)
    } finally {
      setManualUpdateChecking(false)
    }
  }, [])

  const handleSoftwareHealthCheck = useCallback(async (repair = true) => {
    if (!window.api?.diagnosticsAPI?.healthCheck) {
      setHealthStatus('当前环境不支持软件体检')
      return
    }

    if (
      repair &&
      !confirm(
        `将修复${currentProject?.name ? `「${currentProject.name}」` : '当前项目'}。\n\n旧项目首次修复会整理项目结构和旧 LocalCache 引用；大视频会保留在原本地缓存位置，不会整段复制。项目素材多时可能需要几十秒，期间请不要反复点击设置或新建画布。`
      )
    ) {
      return
    }

    setHealthChecking(true)
    setHealthStatus(
      repair
        ? '正在修复当前项目：整理旧项目结构与本地缓存引用，素材多时会稍慢，请稍等...'
        : '正在体检项目与缓存状态...'
    )
    try {
      setHealthStatus(
        repair
          ? '正在修复当前项目：整理旧项目结构与本地缓存引用，素材多时会稍慢，请稍等...'
          : '正在体检项目与缓存状态...'
      )
      const result = await window.api.diagnosticsAPI.healthCheck({
        repair,
        projectId: repair ? currentProject?.id || null : null
      })
      if (!result?.success) {
        throw new Error(result?.error || '体检失败')
      }
      setHealthResult(result)
      const summary = result.summary || {}
      const issueCount = summary.issueCount || 0
      const unresolvedIssueCount = summary.unresolvedIssueCount || 0
      const repairCount = summary.repairCount || 0
      setHealthStatus(
        repair
          ? `体检完成：发现 ${issueCount} 项，完成 ${repairCount} 类自动修复，剩余 ${unresolvedIssueCount} 项需人工处理`
          : `体检完成：发现 ${issueCount} 项`
      )
    } catch (error) {
      setHealthStatus(`体检失败：${error?.message || error}`)
    } finally {
      setHealthChecking(false)
    }
  }, [currentProject?.id, currentProject?.name])

  const handleUpdatePreflight = useCallback(async () => {
    if (!window.api?.updater?.preflightCheck) {
      setUpdatePreflightStatus('当前环境不支持更新自检')
      return
    }
    setUpdatePreflightChecking(true)
    setUpdatePreflightStatus('正在检查更新环境并自动修复可处理的问题...')
    try {
      const result = await window.api.updater.preflightCheck({ repair: true })
      if (!result?.success) throw new Error(result?.error || '更新自检失败')
      const failed = Array.isArray(result.checks) ? result.checks.filter((item: any) => !item.ok) : []
      setUpdatePreflightStatus(
        failed.length
          ? `自检完成，仍有 ${failed.length} 项需要处理：${failed
              .map((item: any) => item.id || item.label)
              .join(', ')}`
          : `自检通过${result.repairs?.length ? `，已修复 ${result.repairs.length} 项` : ''}`
      )
    } catch (error) {
      setUpdatePreflightStatus(`更新自检失败：${error?.message || error}`)
    } finally {
      setUpdatePreflightChecking(false)
    }
  }, [])

  const handleExportDiagnostics = useCallback(async () => {
    if (!window.api?.diagnosticsAPI?.exportPackage) {
      setDiagnosticsExportStatus('当前环境不支持导出诊断包')
      return
    }
    setDiagnosticsExportStatus('正在导出诊断包...')
    try {
      const result = await window.api.diagnosticsAPI.exportPackage()
      if (!result?.success) throw new Error(result?.error || '导出诊断包失败')
      setDiagnosticsExportStatus(`诊断包已导出：${result.path}`)
    } catch (error) {
      setDiagnosticsExportStatus(`导出失败：${error?.message || error}`)
    }
  }, [])

  const visibleApiConfigs = useMemo(
    () => dedupeSettingsApiConfigs(apiConfigs, activeApiTab),
    [apiConfigs, activeApiTab]
  )

  return (
    <Modal
      isOpen={settingsOpen}
      onClose={() => setSettingsOpen(false)}
      title="系统偏好设置"
      className="w-[850px]"
      lightweight
    >
      <div className="flex h-[600px] w-full">
        {/* 侧边导航 */}
        <div
          className="w-48 border-r border-[var(--border-color)] flex flex-col pt-3 pb-3"
          style={{ background: 'var(--bg-panel)' }}
        >
          {[
            { id: 'general', label: '通用' },
            { id: 'appearance', label: '外观与体验' },
            { id: 'workspace', label: '工作区与存储' },
            { id: 'shortcuts', label: '⌨️ 快捷键' },
            { id: 'models', label: '模型接口配置' },
            { id: 'services', label: '服务接入' },
            { id: 'feishu', label: '🤖 飞书集成' },
            { id: 'system', label: '高级与系统' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSettingsTab(tab.id)}
              className={`settings-nav-item text-left w-full ${
                activeSettingsTab === tab.id ? 'active' : ''
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--bg-panel)]">
          {activeSettingsTab === 'general' && (
            <div className="p-6 space-y-8 animate-in fade-in flex flex-col"></div>
          )}

          {activeSettingsTab === 'appearance' && (
            <div className="p-6 space-y-8 animate-in fade-in">
              <section>
                <h3 className="text-sm font-bold text-[var(--text-secondary)] mb-4 pb-2 border-b border-[var(--border-color)]">
                  字号缩放
                </h3>
                <div className="flex items-center gap-4 bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] max-w-sm">
                  <span className="text-xs text-zinc-400">关</span>
                  <input
                    type="range"
                    min="75"
                    max="150"
                    step="5"
                    value={uiScale}
                    onChange={(e) => setUiScale(Number(e.target.value))}
                    className="flex-1 h-1.5 bg-[var(--bg-input)] rounded-lg appearance-none cursor-pointer accent-[var(--primary-color)]"
                  />
                  <span className="text-xs text-zinc-400">关</span>
                  <span className="w-12 text-right text-sm font-mono text-[var(--primary-color)]">
                    {uiScale}%
                  </span>
                </div>
              </section>
            </div>
          )}

          {activeSettingsTab === 'system' && (
            <div className="p-6 space-y-8 animate-in fade-in">
              <section>
                <h3 className="text-sm font-bold text-[var(--text-secondary)] mb-4 pb-2 border-b border-[var(--border-color)]">
                  系统底层控制
                </h3>
                <div className="space-y-6 max-w-xl">
                  <div className="p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-[var(--text-primary)]">
                          自动检查更新
                        </div>
                        <div className="text-xs text-[var(--text-muted)] mt-1">
                          每次启动软件时，在后台静默检查是否有新版本；有新版本时再提示下载。{' '}
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={enableUpdateCheck}
                          onChange={(e) => {
                            const val = e.target.checked
                            setEnableUpdateCheck(val)
                            if (window.dbAPI?.settings) {
                              window.dbAPI.settings.set('tapnow_enableUpdateCheck', String(val))
                            }
                          }}
                        />
                        <div className="w-11 h-6 bg-[var(--bg-input)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--primary-color)]"></div>
                      </label>
                    </div>
                    <div className="mt-4 pt-4 border-t border-[var(--border-color)] flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-[var(--text-primary)]">
                          手动检查更新
                        </div>
                        <div className="text-xs text-[var(--text-muted)] mt-1">
                          立即向更新服务器查询一次，结果会显示在右下角。
                        </div>
                        {manualUpdateStatus && (
                          <div className="text-xs text-[var(--text-muted)] mt-2">
                            {manualUpdateStatus}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleManualUpdateCheck}
                        disabled={manualUpdateChecking}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-[var(--bg-elevated)] hover:bg-[var(--bg-input)] disabled:opacity-60 disabled:cursor-not-allowed text-[var(--text-primary)] border border-[var(--border-color)] transition-colors shrink-0"
                      >
                        <RefreshCw
                          className={`w-4 h-4 ${manualUpdateChecking ? 'animate-spin' : ''}`}
                        />
                        {manualUpdateChecking ? '检查中' : '立即检查'}
                      </button>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-[var(--text-primary)]">
                          更新环境自检
                        </div>
                        <div className="text-xs text-[var(--text-muted)] mt-1">
                          检查进程占用、协议注册、锁文件、更新缓存、安装目录写入和磁盘空间。
                        </div>
                        {updatePreflightStatus && (
                          <div className="text-xs text-[var(--text-muted)] mt-2 break-all">
                            {updatePreflightStatus}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleUpdatePreflight}
                        disabled={updatePreflightChecking}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-[var(--bg-elevated)] hover:bg-[var(--bg-input)] disabled:opacity-60 disabled:cursor-not-allowed text-[var(--text-primary)] border border-[var(--border-color)] transition-colors shrink-0"
                      >
                        <RefreshCw
                          className={`w-4 h-4 ${updatePreflightChecking ? 'animate-spin' : ''}`}
                        />
                        {updatePreflightChecking ? '自检中' : '自检并修复'}
                      </button>
                    </div>
                    <div className="mt-4 pt-4 border-t border-[var(--border-color)] flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-[var(--text-primary)]">
                          导出诊断包
                        </div>
                        <div className="text-xs text-[var(--text-muted)] mt-1">
                          导出日志、崩溃记录、版本路径和协议状态，便于客服或研发排查。
                        </div>
                        {diagnosticsExportStatus && (
                          <div className="text-xs text-[var(--text-muted)] mt-2 break-all">
                            {diagnosticsExportStatus}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleExportDiagnostics}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-[var(--bg-elevated)] hover:bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] transition-colors shrink-0"
                      >
                        <Database className="w-4 h-4" />
                        导出
                      </button>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          软件体检与自动修复
                        </div>
                        <div className="text-xs text-[var(--text-muted)] mt-1">
                          更新后可检查数据库、项目文件、迁移状态和托管缓存；能安全修复的项目会自动处理。
                        </div>
                        {healthStatus && (
                          <div className="text-xs text-[var(--text-muted)] mt-2">
                            {healthStatus}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => handleSoftwareHealthCheck(false)}
                          disabled={healthChecking}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-[var(--bg-elevated)] hover:bg-[var(--bg-input)] disabled:opacity-60 disabled:cursor-not-allowed text-[var(--text-primary)] border border-[var(--border-color)] transition-colors"
                        >
                          <RefreshCw
                            className={`w-4 h-4 ${healthChecking ? 'animate-spin' : ''}`}
                          />
                          只体检
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSoftwareHealthCheck(true)}
                          disabled={healthChecking}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-[var(--primary-color)] hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed text-white transition-colors"
                        >
                          <RefreshCw
                            className={`w-4 h-4 ${healthChecking ? 'animate-spin' : ''}`}
                          />
                          自动修复
                        </button>
                      </div>
                    </div>

                    {healthResult && (
                      <div className="mt-4 space-y-3">
                        {healthResult.pendingUpdate && (
                          <div className="text-xs text-[var(--text-muted)]">
                            更新记录：{healthResult.pendingUpdate.fromVersion || 'unknown'} →{' '}
                            {healthResult.pendingUpdate.toVersion || healthResult.appVersion || 'current'}
                          </div>
                        )}
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
                            <div className="text-[var(--text-muted)]">检查项目</div>
                            <div className="mt-1 text-[var(--text-primary)]">
                              {healthResult.summary?.checkedProjects || 0} 个
                            </div>
                          </div>
                          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
                            <div className="text-[var(--text-muted)]">发现问题</div>
                            <div className="mt-1 text-[var(--text-primary)]">
                              {healthResult.summary?.issueCount || 0} 项
                            </div>
                          </div>
                          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
                            <div className="text-[var(--text-muted)]">自动修复</div>
                            <div className="mt-1 text-[var(--text-primary)]">
                              {healthResult.summary?.repairCount || 0} 类
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">
                          已迁移旧缓存引用 {healthResult.summary?.rewrittenLegacyCacheRefs || 0} 个，清理托管缓存{' '}
                          {healthResult.summary?.deletedOrphanCacheFiles || 0} 个，释放{' '}
                          {formatCacheBytes(healthResult.summary?.freedOrphanCacheBytes)}
                        </div>
                        {healthResult.issues?.length > 0 && (
                          <div className="space-y-1">
                            {healthResult.issues.slice(0, 3).map((issue) => (
                              <div
                                key={`${issue.code}-${issue.title}`}
                                className="text-xs text-[var(--text-muted)]"
                              >
                                {issue.resolved
                                  ? '已修复'
                                  : issue.severity === 'error'
                                    ? '错误'
                                    : '提醒'}
                                ：{issue.title}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
                    <div>
                      <div className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
                        硬件图形加速 (GPU)
                      </div>
                      <div className="text-xs text-[var(--text-muted)] mt-1">
                        大幅提升 WebGL
                        渲染和高分辨率画布拖拽流程度。若遇到黑屏或崩溃现象，可尝试关闭。{' '}
                        <strong className="text-yellow-500">更改需重启软件以生效。</strong>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={enableGpu}
                        onChange={(e) => {
                          const val = e.target.checked
                          setEnableGpu(val)
                          if (window.dbAPI?.settings) {
                            window.dbAPI.settings.set('tapnow_enableGpu', String(val))
                          }
                        }}
                      />
                      <div className="w-11 h-6 bg-[var(--bg-input)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--primary-color)]"></div>
                    </label>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeSettingsTab === 'workspace' && (
            <div className="p-6 space-y-8 animate-in fade-in">
              <ProjectCacheDirectorySection
                currentProject={currentProject}
                updateProjectCacheRoot={updateProjectCacheRoot}
              />

              <WorkspaceApprovalSection />

              <CacheManagementSection currentProject={currentProject} />

              <section>
                <h3 className="text-sm font-bold text-[var(--text-secondary)] mb-4 pb-2 border-b border-[var(--border-color)]">
                  防呆与静默{' '}
                </h3>
                <div className="flex items-center justify-between p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-[var(--text-primary)] block">
                      跳过删除确认
                    </label>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      删除节点或历史记录时不再弹出二次确认框。?{' '}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer ml-4">
                    <input
                      type="checkbox"
                      checked={silenceConfirmations}
                      onChange={(e) => setSilenceConfirmations(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div
                      className={`w-10 h-5 bg-[var(--bg-input)] rounded-full peer peer-checked:bg-[var(--primary-color)] peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all`}
                    ></div>
                  </label>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-bold text-[var(--text-secondary)] mb-4 pb-2 border-b border-[var(--border-color)]">
                  自动保存
                </h3>
                <p className="text-xs text-[var(--text-muted)] mb-3">
                  定时保存节点、连线、生成历史和资产库数据，防止意外丢失。?{' '}
                </p>
                <div className="flex gap-2 max-w-sm">
                  {[
                    { label: '关闭', value: 0 },
                    { label: '15 分钟', value: 15 },
                    { label: '30 分钟', value: 30 }
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setAutoSaveInterval(opt.value)}
                      className={`flex-1 px-4 py-2 text-sm rounded-lg border transition-colors ${
                        autoSaveInterval === opt.value
                          ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-strong)]'
                          : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeSettingsTab === 'models' && (
            <div className="p-6 h-full flex flex-col animate-in fade-in">
              <div className="flex justify-between items-center mb-4">
                <div className="flex gap-1.5 bg-[var(--bg-secondary)] p-1 rounded-lg border border-[var(--border-color)]">
                  {['Chat', 'Image', 'Video'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveApiTab(tab)}
                      className={`px-4 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] transition-all ${
                        activeApiTab === tab
                          ? 'bg-[var(--bg-hover)] text-[var(--text-primary)] shadow-sm'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]/50'
                      }`}
                    >
                      {tab === 'Chat' ? '💬 文本' : tab === 'Image' ? '🖼️ 图片' : '🎞️ 视频'}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      visibleApiConfigs.forEach((api) => testApiConnection(api.id))
                    }}
                    className="h-7 px-3 text-[10px] font-medium rounded-lg border transition-colors bg-[var(--bg-secondary)] text-zinc-400 border-[var(--border-color)] hover:text-zinc-200 hover:border-zinc-500"
                  >
                    <LinkIcon size={11} className="mr-1 inline" /> 测试全部
                  </button>
                  <GroupDefaultConfig
                    type={activeApiTab}
                    visibleKeys={visibleKeys}
                    setVisibleKeys={setVisibleKeys}
                  />
                  <Button
                    className="h-7 text-[10px] px-3"
                    style={{ backgroundColor: 'var(--primary-color)', color: '#fff' }}
                    onClick={() => addNewModel(activeApiTab)}
                  >
                    <Plus size={12} className="mr-1" /> 添加
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-8">
                <div className="flex flex-wrap gap-2">
                  {visibleApiConfigs.map((api, index) => (
                      <ModelChip
                        key={`${api.id || api.modelName || 'model'}-${index}`}
                        api={api}
                        getStatusColor={getStatusColor}
                        updateApiConfig={updateApiConfig}
                        deleteApiConfig={deleteApiConfig}
                      />
                    ))}
                </div>
                {visibleApiConfigs.length === 0 && (
                  <div className="py-8 text-center text-[var(--text-muted)] border-2 border-dashed border-[var(--border-color)] rounded-xl text-xs">
                    暂无模型，点击右上角添加。
                  </div>
                )}
              </div>
            </div>
          )}

          {activeSettingsTab === 'services' && (
            <div className="p-6 animate-in fade-in space-y-6">
              <OssServiceSettingsSection />
              <VodServiceSettingsSection />
            </div>
          )}

          {activeSettingsTab === 'shortcuts' && (
            <div className="p-6 animate-in fade-in space-y-4">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                键盘快捷键
              </h3>
              {[
                ['Ctrl + Z', '撤销'],
                ['Ctrl + Shift + Z', '重做'],
                ['Ctrl + C / V', '复制 / 粘贴节点'],
                ['Delete / Backspace', '删除选中节点'],
                ['Ctrl + A', '全选'],
                ['Ctrl + S', '保存项目'],
                ['Space + 拖动', '平移画布'],
                ['Ctrl + 滚轮', '缩放画布'],
                ['@', '在提示词中引用素材'],
                ['Enter', '提交生成'],
                ['Esc', '关闭弹窗 / 取消操作']
              ].map(([key, desc]) => (
                <div
                  key={key}
                  className="flex items-center justify-between py-1.5 border-b"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {desc}
                  </span>
                  <kbd
                    className="px-2 py-0.5 rounded text-[10px] font-mono"
                    style={{
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-default)'
                    }}
                  >
                    {key}
                  </kbd>
                </div>
              ))}
            </div>
          )}

          {activeSettingsTab === 'feishu' && (
            <div className="p-6 animate-in fade-in">
              <FeishuSettings />
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

function OssServiceSettingsSection() {
  const [form, setForm] = useState({
    accessKeyId: '',
    accessKeySecret: '',
    region: 'oss-cn-chengdu',
    bucket: 'ljxhimage2',
    endpoint: 'https://oss-cn-chengdu.aliyuncs.com',
    publicUrl: 'https://image.lingjingxinghe.cn'
  })
  const [status, setStatus] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [showSecret, setShowSecret] = useState(false)

  const loadConfig = useCallback(async () => {
    setLoading(true)
    setMessage('')
    try {
      const result = await window.api?.ossAPI?.getConfig?.()
      setStatus(result)
      if (result?.success === false) throw new Error(result.error || '读取 OSS 配置失败')
      setForm((prev) => ({
        ...prev,
        region: result?.region || prev.region,
        bucket: result?.bucket || prev.bucket,
        endpoint: result?.endpoint || prev.endpoint,
        publicUrl: result?.publicUrl || prev.publicUrl
      }))
    } catch (error) {
      setMessage(`读取失败：${error?.message || error}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  const updateForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setMessage('')
  }

  const saveConfig = async () => {
    setSaving(true)
    setMessage('')
    try {
      const result = await window.api?.ossAPI?.saveConfig?.(form)
      setStatus(result)
      if (!result?.success) throw new Error(result?.error || '保存 OSS 配置失败')
      setForm((prev) => ({ ...prev, accessKeyId: '', accessKeySecret: '' }))
      setMessage('OSS 中转上传配置已保存。带参考图/参考视频的生成任务会优先使用这里的配置。')
    } catch (error) {
      setMessage(`保存失败：${error?.message || error}`)
    } finally {
      setSaving(false)
    }
  }

  const clearConfig = async () => {
    if (!confirm('确定清除本机保存的 OSS AK/SK 吗？清除后将回退到环境变量配置。')) return
    setSaving(true)
    setMessage('')
    try {
      const result = await window.api?.ossAPI?.clearConfig?.()
      setStatus(result)
      setForm((prev) => ({ ...prev, accessKeyId: '', accessKeySecret: '' }))
      setMessage('已清除本机保存的 OSS 配置')
    } catch (error) {
      setMessage(`清除失败：${error?.message || error}`)
    } finally {
      setSaving(false)
    }
  }

  const sourceLabel =
    status?.source === 'settings'
      ? '本机安全存储'
      : status?.source === 'environment'
        ? '环境变量'
        : '未配置'

  return (
    <section>
      <h3 className="text-sm font-bold text-[var(--text-secondary)] mb-4 pb-2 border-b border-[var(--border-color)]">
        阿里云 OSS 中转上传
      </h3>
      <div className="max-w-2xl rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
        <div className="grid gap-3 text-xs sm:grid-cols-3">
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
            <div className="text-[var(--text-muted)]">上传状态</div>
            <div className="mt-1 text-sm text-[var(--text-primary)]">
              {status?.configured ? '已配置' : '未配置'}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
            <div className="text-[var(--text-muted)]">凭证来源</div>
            <div className="mt-1 text-sm text-[var(--text-primary)]">{sourceLabel}</div>
          </div>
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
            <div className="text-[var(--text-muted)]">AccessKey</div>
            <div className="mt-1 text-sm text-[var(--text-primary)]">
              {status?.accessKeyIdMasked || '未保存'}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
              AccessKey ID
            </span>
            <input
              value={form.accessKeyId}
              onChange={(event) => updateForm('accessKeyId', event.target.value)}
              placeholder={status?.accessKeyIdMasked || 'LTAI...'}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary-color)]"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
              AccessKey Secret
            </span>
            <div className="flex gap-2">
              <input
                type={showSecret ? 'text' : 'password'}
                value={form.accessKeySecret}
                onChange={(event) => updateForm('accessKeySecret', event.target.value)}
                placeholder={status?.storedConfigured ? '已保存，重新填写可覆盖' : 'AccessKey Secret'}
                className="min-w-0 flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary-color)]"
              />
              <button
                type="button"
                onClick={() => setShowSecret((prev) => !prev)}
                className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </label>
          {[
            ['region', 'Region'],
            ['bucket', 'Bucket'],
            ['endpoint', 'Endpoint'],
            ['publicUrl', 'CDN/Public URL']
          ].map(([key, label]) => (
            <label key={key} className="block">
              <span className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                {label}
              </span>
              <input
                value={form[key]}
                onChange={(event) => updateForm(key, event.target.value)}
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary-color)]"
              />
            </label>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={saveConfig}
            disabled={saving || loading || !status?.safeStorageAvailable}
            className="rounded-lg bg-[var(--primary-color)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? '保存中' : '保存 OSS 配置'}
          </button>
          <button
            type="button"
            onClick={loadConfig}
            disabled={loading}
            className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-input)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            刷新状态
          </button>
          <button
            type="button"
            onClick={clearConfig}
            disabled={saving || !status?.storedConfigured}
            className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            清除本机配置
          </button>
        </div>

        {message && (
          <div className="mt-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-3 text-xs leading-5 text-[var(--text-secondary)]">
            {message}
          </div>
        )}
        <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">
          用于把本地参考图、参考视频临时上传成公网 URL，再提交给视频模型。密钥只保存在本机安全存储中，不会回显明文。
        </p>
      </div>
    </section>
  )
}

function VodServiceSettingsSection() {
  const [form, setForm] = useState({
    accessKeyId: '',
    secretAccessKey: '',
    region: 'cn-north-1',
    spaceName: ''
  })
  const [status, setStatus] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState('')
  const [showSecret, setShowSecret] = useState(false)

  const loadConfig = useCallback(async () => {
    setLoading(true)
    setMessage('')
    try {
      const result = await getVodTranslationConfig()
      setStatus(result)
      setForm((prev) => ({
        ...prev,
        region: result?.region || prev.region || 'cn-north-1',
        spaceName: result?.spaceName || prev.spaceName || ''
      }))
      if (result?.error) setMessage(result.error)
    } catch (error) {
      setMessage(`读取失败：${error?.message || error}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  const updateForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setMessage('')
  }

  const saveConfig = async () => {
    setSaving(true)
    setMessage('')
    try {
      const result = await saveVodTranslationConfig(form)
      setStatus(result)
      if (!result?.success) throw new Error(result?.error || '保存失败')
      setForm((prev) => ({ ...prev, accessKeyId: '', secretAccessKey: '' }))
      setMessage('火山 VOD 接入配置已保存')
      window.dispatchEvent(new CustomEvent('vod-ai-translation-config-updated'))
    } catch (error) {
      setMessage(`保存失败：${error?.message || error}`)
    } finally {
      setSaving(false)
    }
  }

  const clearConfig = async () => {
    if (!confirm('确定清除本机保存的火山 VOD AK/SK 吗？')) return
    setSaving(true)
    setMessage('')
    try {
      const result = await clearVodTranslationConfig()
      setStatus(result)
      setForm((prev) => ({ ...prev, accessKeyId: '', secretAccessKey: '' }))
      setMessage('已清除本机保存的火山 VOD 接入配置')
      window.dispatchEvent(new CustomEvent('vod-ai-translation-config-updated'))
    } catch (error) {
      setMessage(`清除失败：${error?.message || error}`)
    } finally {
      setSaving(false)
    }
  }

  const testConnection = async () => {
    const spaceName = form.spaceName || status?.spaceName
    if (!spaceName) {
      setMessage('请先填写 VOD SpaceName，再测试连接')
      return
    }
    setTesting(true)
    setMessage('正在测试火山 VOD 连接...')
    try {
      const result = await window.api?.vodAITranslation?.listProject?.({
        SpaceName: spaceName,
        PageNumber: 1,
        PageSize: 1
      })
      if (!result?.success) throw new Error(result?.error || '连接失败')
      setMessage('连接成功：已能访问火山 VOD AI 翻译项目列表')
    } catch (error) {
      setMessage(`连接失败：${error?.message || error}`)
    } finally {
      setTesting(false)
    }
  }

  const sourceLabel =
    status?.source === 'settings'
      ? '本机安全存储'
      : status?.source === 'environment'
        ? '环境变量'
        : '未配置'

  return (
    <section>
      <h3 className="text-sm font-bold text-[var(--text-secondary)] mb-4 pb-2 border-b border-[var(--border-color)]">
        火山 VOD 声影智译
      </h3>
      <div className="max-w-2xl rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
        <div className="grid gap-3 text-xs sm:grid-cols-3">
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
            <div className="text-[var(--text-muted)]">接入状态</div>
            <div className="mt-1 text-sm text-[var(--text-primary)]">
              {status?.configured ? '已配置' : '未配置'}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
            <div className="text-[var(--text-muted)]">凭证来源</div>
            <div className="mt-1 text-sm text-[var(--text-primary)]">{sourceLabel}</div>
          </div>
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
            <div className="text-[var(--text-muted)]">安全存储</div>
            <div className="mt-1 text-sm text-[var(--text-primary)]">
              {status?.safeStorageAvailable ? '可用' : '不可用'}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
              AccessKey ID
            </span>
            <input
              value={form.accessKeyId}
              onChange={(event) => updateForm('accessKeyId', event.target.value)}
              placeholder={status?.accessKeyIdMasked || 'AKLT...'}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary-color)]"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
              Secret AccessKey
            </span>
            <div className="flex gap-2">
              <input
                type={showSecret ? 'text' : 'password'}
                value={form.secretAccessKey}
                onChange={(event) => updateForm('secretAccessKey', event.target.value)}
                placeholder={status?.storedConfigured ? '已保存，重新填写可覆盖' : 'SK...'}
                className="min-w-0 flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary-color)]"
              />
              <button
                type="button"
                onClick={() => setShowSecret((prev) => !prev)}
                className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
              Region
            </span>
            <input
              value={form.region}
              onChange={(event) => updateForm('region', event.target.value)}
              placeholder="cn-north-1"
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary-color)]"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
              默认 VOD SpaceName
            </span>
            <input
              value={form.spaceName}
              onChange={(event) => updateForm('spaceName', event.target.value)}
              placeholder="space-xxxx"
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary-color)]"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={saveConfig}
            disabled={saving || loading || !status?.safeStorageAvailable}
            className="rounded-lg bg-[var(--primary-color)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? '保存中' : '保存接入'}
          </button>
          <button
            type="button"
            onClick={testConnection}
            disabled={testing || !status?.configured}
            className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-input)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {testing ? '测试中' : '测试连接'}
          </button>
          <button
            type="button"
            onClick={loadConfig}
            disabled={loading}
            className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--bg-input)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            刷新状态
          </button>
          <button
            type="button"
            onClick={clearConfig}
            disabled={saving || !status?.storedConfigured}
            className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            清除本机配置
          </button>
        </div>

        {message && (
          <div className="mt-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-3 text-xs leading-5 text-[var(--text-secondary)]">
            {message}
          </div>
        )}
        <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">
          这里保存的是火山引擎账号的 AK/SK，用于 VOD OpenAPI 签名；普通模型 API key 不会参与海外译制请求。
        </p>
      </div>
    </section>
  )
}

// ══════════════════════════════════════════════════
// 快捷键管理面板
// ══════════════════════════════════════════════════
function ProjectCacheDirectorySection({ currentProject, updateProjectCacheRoot }) {
  const cacheRoot = currentProject?.cacheRoot || ''
  const [draftCacheRoot, setDraftCacheRoot] = useState(cacheRoot)
  const [saveStatus, setSaveStatus] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraftCacheRoot(cacheRoot)
  }, [cacheRoot])

  const applyCacheRoot = useCallback(
    async (nextRoot = draftCacheRoot) => {
      if (!currentProject?.id) return
      setSaving(true)
      setSaveStatus('')
      try {
        await updateProjectCacheRoot(String(nextRoot || '').trim())
        setSaveStatus('Saved')
      } catch (error) {
        setSaveStatus(error?.message || 'Save failed. Check folder access.')
      } finally {
        setSaving(false)
      }
    },
    [currentProject?.id, draftCacheRoot, updateProjectCacheRoot]
  )

  const chooseDirectory = useCallback(async () => {
    if (!currentProject?.id || !window.api?.localCacheAPI?.openDirectory) return
    setSaving(true)
    setSaveStatus('')
    const result = await window.api.localCacheAPI.openDirectory(draftCacheRoot || cacheRoot)
    if (result?.success && result.path) {
      setDraftCacheRoot(result.path)
      await applyCacheRoot(result.path)
    } else if (result?.error) {
      setSaveStatus(result.error)
    }
    setSaving(false)
  }, [applyCacheRoot, cacheRoot, currentProject?.id, draftCacheRoot])

  return (
    <section>
      <h3 className="text-sm font-bold text-[var(--text-secondary)] mb-4 pb-2 border-b border-[var(--border-color)]">
        项目缓存位置
      </h3>
      <div className="space-y-2 max-w-xl">
        <label className="text-xs font-medium text-[var(--text-muted)] block">
          当前项目缓存目录
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={draftCacheRoot}
            onChange={(event) => {
              setDraftCacheRoot(event.target.value)
              setSaveStatus('')
            }}
            onBlur={() => applyCacheRoot()}
            disabled={!currentProject?.id || saving}
            placeholder="留空则使用软件默认的项目缓存目录"
            className="flex-1 rounded-lg px-3 py-2 text-sm outline-none transition-colors border font-mono bg-[var(--bg-secondary)] border-[var(--border-color)] text-zinc-200 focus:border-[var(--primary-color)] disabled:opacity-60"
          />
          <button
            type="button"
            onClick={chooseDirectory}
            disabled={!currentProject?.id || saving}
            className="px-4 py-2 bg-[var(--bg-elevated)] hover:bg-[var(--bg-input)] text-zinc-200 text-sm rounded-lg transition-colors whitespace-nowrap disabled:opacity-60"
          >
            浏览...
          </button>
        </div>
        {saveStatus && <p className="text-xs text-[var(--text-muted)]">{saveStatus}</p>}
        <p className="text-xs text-[var(--text-muted)]">
          历史记录、节点内容、资产缩略图和软件托管缓存都按项目隔离存放；不设置容量上限。
        </p>
      </div>
    </section>
  )
}

function WorkspaceApprovalSection() {
  const [mode, setMode] = useState(() => {
    const stored = localStorage.getItem(WORKSPACE_APPROVAL_MODE_KEY)
    return stored === 'risky' || stored === 'auto' ? stored : 'request'
  })

  const options = [
    {
      id: 'request',
      label: '请求批准',
      desc: '写入、删除和命令先进入审核。'
    },
    {
      id: 'risky',
      label: '帮我批准',
      desc: '普通写入自动通过，删除和命令仍确认。'
    },
    {
      id: 'auto',
      label: '完全访问',
      desc: '当前授权范围内的操作自动执行。'
    }
  ]

  const updateMode = (nextMode) => {
    setMode(nextMode)
    localStorage.setItem(WORKSPACE_APPROVAL_MODE_KEY, nextMode)
    try {
      const currentPolicy = JSON.parse(localStorage.getItem(WORKSPACE_ACCESS_POLICY_KEY) || '{}')
      localStorage.setItem(
        WORKSPACE_ACCESS_POLICY_KEY,
        JSON.stringify({
          ...(currentPolicy || {}),
          approvalMode: nextMode
        })
      )
    } catch {
      localStorage.setItem(WORKSPACE_ACCESS_POLICY_KEY, JSON.stringify({ approvalMode: nextMode }))
    }
    window.dispatchEvent(new CustomEvent('workspace-approval-mode-updated', { detail: nextMode }))
  }

  return (
    <section>
      <h3 className="text-sm font-bold text-[var(--text-secondary)] mb-4 pb-2 border-b border-[var(--border-color)]">
        工作台操作审核
      </h3>
      <div className="grid max-w-xl gap-2 sm:grid-cols-3">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => updateMode(option.id)}
            className={`rounded-lg border p-3 text-left transition-colors ${
              mode === option.id
                ? 'border-[var(--primary-color)] bg-[var(--primary-color)]/10 text-[var(--text-primary)]'
                : 'border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
            }`}
          >
            <div className="text-sm font-semibold">{option.label}</div>
            <div className="mt-1 text-xs opacity-70">{option.desc}</div>
          </button>
        ))}
      </div>
    </section>
  )
}

function formatCacheBytes(value) {
  const bytes = Number(value || 0)
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

function CacheManagementSection({ currentProject }) {
  const [stats, setStats] = useState(null)
  const [diagnosis, setDiagnosis] = useState(null)
  const [busyAction, setBusyAction] = useState('')
  const [statusText, setStatusText] = useState('')

  const projectId = currentProject?.id || ''

  const refreshStats = useCallback(async () => {
    if (!window.api?.localCacheAPI?.getStats) return
    const result = await window.api.localCacheAPI.getStats({
      projectId,
      cacheRoot: currentProject?.cacheRoot || null
    })
    if (result?.success) {
      setStats(result)
    } else if (result?.error) {
      setStatusText(`缓存统计失败：${result.error}`)
    }
  }, [projectId, currentProject?.cacheRoot])

  const runCleanup = useCallback(
    async (action, options, message, confirmation) => {
      if (!window.api?.localCacheAPI?.cleanup) return
      if (confirmation && !confirm(confirmation)) return
      setBusyAction(action)
      setStatusText('')
      try {
        const result = await window.api.localCacheAPI.cleanup({
          ...options,
          projectId,
          cacheRoot: currentProject?.cacheRoot || null
        })
        if (!result?.success) throw new Error(result?.error || '清理失败')
        setStatusText(
          `${message}：已删除 ${result.deletedFiles || 0} 个文件，释放 ${formatCacheBytes(result.freedBytes)}`
        )
        setDiagnosis(null)
        await refreshStats()
      } catch (error) {
        setStatusText(`${message}失败：${error?.message || error}`)
      } finally {
        setBusyAction('')
      }
    },
    [currentProject?.cacheRoot, projectId, refreshStats]
  )

  const clearCurrentProjectCache = useCallback(async () => {
    if (!projectId || !window.api?.localCacheAPI?.clearProjectCache) return
    const projectName = currentProject?.name || '当前项目'
    if (
      !confirm(
        `确定清理「${projectName}」关联的托管缓存吗？\n\n只会删除 LocalCache 和缩略图等软件缓存，不会删除用户原始本地素材文件。`
      )
    ) {
      return
    }
    setBusyAction('project')
    setStatusText('')
    try {
      const result = await window.api.localCacheAPI.clearProjectCache(projectId)
      if (!result?.success) throw new Error(result?.error || '清理失败')
      setStatusText(
        `当前项目缓存清理完成：已删除 ${result.deletedFiles || 0} 个文件，释放 ${formatCacheBytes(result.freedBytes)}`
      )
      setDiagnosis(null)
      await refreshStats()
    } catch (error) {
      setStatusText(`当前项目缓存清理失败：${error?.message || error}`)
    } finally {
      setBusyAction('')
    }
  }, [currentProject?.name, projectId, refreshStats])

  const repairCurrentProject = useCallback(async () => {
    if (!projectId || !window.api?.projectFileAPI?.repair) return
    const projectName = currentProject?.name || '当前项目'
    if (
      !confirm(
        `确定修复「${projectName}」吗？\n\n会补齐项目结构并把旧 LocalCache 软件缓存引用迁移到当前项目缓存目录；不会删除用户原始本地素材。`
      )
    ) {
      return
    }
    setBusyAction('repair')
    setStatusText('')
    try {
      const result = await window.api.projectFileAPI.repair(projectId)
      if (!result?.success) throw new Error(result?.error || '修复失败')
      setStatusText(
        `当前项目修复完成：迁移旧缓存引用 ${result.rewrittenLegacyCacheRefs || 0} 个，复制缓存文件 ${result.copiedLegacyCacheFiles || 0} 个，缺失旧缓存 ${result.missingLegacyCacheFiles || 0} 个`
      )
      setDiagnosis(null)
      await refreshStats()
    } catch (error) {
      setStatusText(`当前项目修复失败：${error?.message || error}`)
    } finally {
      setBusyAction('')
    }
  }, [currentProject?.name, projectId, refreshStats])

  const runDiagnose = useCallback(async () => {
    if (!window.api?.localCacheAPI?.diagnose) return
    setBusyAction('diagnose')
    setStatusText('')
    try {
      const result = await (window.api.localCacheAPI.diagnose as any)({
        projectId,
        cacheRoot: currentProject?.cacheRoot || null
      })
      if (!result?.success) throw new Error(result?.error || '体检失败')
      setDiagnosis(result)
      setStatusText('缓存体检完成')
      await refreshStats()
    } catch (error) {
      setStatusText(`缓存体检失败：${error?.message || error}`)
    } finally {
      setBusyAction('')
    }
  }, [currentProject?.cacheRoot, projectId, refreshStats])

  const total = stats?.totals?.total || { count: 0, size: 0 }
  const image = stats?.totals?.image || { count: 0, size: 0 }
  const video = stats?.totals?.video || { count: 0, size: 0 }
  const thumbnail = stats?.totals?.thumbnail || { count: 0, size: 0 }
  const currentProjectStats = stats?.currentProject

  const cleanupButtons = [
    {
      id: 'orphan',
      label: '清理无引用缓存',
      action: () =>
        runCleanup(
          'orphan',
          { mode: 'orphan' },
          '无引用缓存清理完成',
          '确定清理所有未被项目引用的托管缓存吗？'
        )
    },
    {
      id: 'old',
      label: '清理 30 天前缓存',
      action: () =>
        runCleanup(
          'old',
          { mode: 'older-than-days', olderThanDays: 30 },
          '30 天前无引用缓存清理完成',
          '确定清理 30 天前且未被项目引用的缓存吗？'
        )
    },
    {
      id: 'video',
      label: '清理无引用视频',
      action: () =>
        runCleanup(
          'video',
          { mode: 'type', type: 'video' },
          '无引用视频缓存清理完成',
          '确定清理未被项目引用的视频缓存吗？'
        )
    },
    {
      id: 'thumb',
      label: '清理缩略图',
      action: () =>
        runCleanup(
          'thumb',
          { mode: 'type', type: 'thumbnail', referencedOnly: false },
          '缩略图缓存清理完成',
          '确定清理缩略图缓存吗？缩略图之后可以自动重建。'
        )
    }
  ]

  return (
    <section>
      <h3 className="text-sm font-bold text-[var(--text-secondary)] mb-4 pb-2 border-b border-[var(--border-color)]">
        缓存管理
      </h3>

      <div className="space-y-4 max-w-2xl">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3">
          <div className="text-xs text-[var(--text-muted)]">
            缓存统计和体检会扫描本地文件，素材多时请手动触发。
          </div>
          <button
            type="button"
            onClick={refreshStats}
            disabled={!!busyAction}
            className="px-3 py-2 rounded-lg text-xs border bg-[var(--bg-panel)] text-[var(--text-secondary)] border-[var(--border-color)] hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            刷新统计
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <CacheStatCard
            icon={HardDrive}
            label="总缓存"
            value={formatCacheBytes(total.size)}
            count={total.count}
          />
          <CacheStatCard
            icon={Database}
            label="图片缓存"
            value={formatCacheBytes(image.size)}
            count={image.count}
          />
          <CacheStatCard
            icon={Database}
            label="视频缓存"
            value={formatCacheBytes(video.size)}
            count={video.count}
          />
          <CacheStatCard
            icon={Database}
            label="缩略图"
            value={formatCacheBytes(thumbnail.size)}
            count={thumbnail.count}
          />
        </div>

        <div className="p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-[var(--text-primary)]">清理策略</div>
              <div className="text-xs text-[var(--text-muted)] mt-1">
                清理范围限定在软件托管缓存，不删除用户原始本地素材文件。
              </div>
            </div>
            <div className="text-xs text-[var(--text-muted)]">
              无引用：{formatCacheBytes(stats?.orphan?.size)} / {stats?.orphan?.count || 0} 个
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {cleanupButtons.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={item.action}
                disabled={!!busyAction}
                className="px-3 py-2 rounded-lg text-xs border bg-[var(--bg-panel)] text-[var(--text-secondary)] border-[var(--border-color)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] disabled:opacity-50"
              >
                {busyAction === item.id ? '处理中...' : item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={clearCurrentProjectCache}
              disabled={!!busyAction || !projectId}
              className="px-3 py-2 rounded-lg text-xs border bg-[var(--bg-panel)] text-[var(--text-secondary)] border-[var(--border-color)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] disabled:opacity-50"
            >
              {busyAction === 'project' ? '处理中...' : '清理当前项目缓存'}
            </button>
            <button
              type="button"
              onClick={repairCurrentProject}
              disabled={!!busyAction || !projectId}
              className="px-3 py-2 rounded-lg text-xs border bg-[var(--bg-panel)] text-[var(--text-secondary)] border-[var(--border-color)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] disabled:opacity-50"
            >
              {busyAction === 'repair' ? '修复中...' : '修复当前项目'}
            </button>
          </div>
          {currentProjectStats && (
            <div className="text-xs text-[var(--text-muted)]">
              当前项目缓存：{formatCacheBytes(currentProjectStats.size)} /{' '}
              {currentProjectStats.count || 0} 个文件
            </div>
          )}
        </div>

        <div className="p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                缓存体检
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-1">
                检查失效本地链接、缺失缓存引用和可清理孤立缓存。
              </div>
            </div>
            <button
              type="button"
              onClick={runDiagnose}
              disabled={!!busyAction}
              className="px-3 py-2 rounded-lg text-xs border bg-[var(--bg-panel)] text-[var(--text-secondary)] border-[var(--border-color)] hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              {busyAction === 'diagnose' ? '体检中...' : '开始体检'}
            </button>
          </div>
          {diagnosis && (
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
                <div className="text-[var(--text-muted)]">孤立缓存</div>
                <div className="mt-1 text-[var(--text-primary)]">
                  {diagnosis.orphan?.count || 0} 个 / {formatCacheBytes(diagnosis.orphan?.size)}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
                <div className="text-[var(--text-muted)]">缺失缓存引用</div>
                <div className="mt-1 text-[var(--text-primary)]">
                  {diagnosis.missingCacheRefCount || 0} 个
                </div>
              </div>
              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
                <div className="text-[var(--text-muted)]">失效本地素材链接</div>
                <div className="mt-1 text-[var(--text-primary)]">
                  {diagnosis.missingLocalRefCount || 0} 个
                </div>
              </div>
            </div>
          )}
        </div>

        {statusText && <div className="text-xs text-[var(--text-muted)]">{statusText}</div>}
      </div>
    </section>
  )
}

function CacheStatCard({ icon: Icon, label, value, count }) {
  return (
    <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-[var(--text-muted)]">{label}</div>
        <Icon className="w-4 h-4 text-[var(--text-muted)]" />
      </div>
      <div className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{value}</div>
      <div className="mt-1 text-xs text-[var(--text-muted)]">{count || 0} 个文件</div>
    </div>
  )
}

function ModelChip({ api, getStatusColor, updateApiConfig, deleteApiConfig }) {
  const [ctx, setCtx] = useState(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [configOpen, setConfigOpen] = useState(false)
  const [configUrl, setConfigUrl] = useState('')
  const [configKey, setConfigKey] = useState('')
  const [configKeyVisible, setConfigKeyVisible] = useState(false)
  const [configPanelPos, setConfigPanelPos] = useState({ left: 0, top: 0 })
  const [toast, setToast] = useState('')
  const inputRef = useRef(null)
  const chipRef = useRef(null)

  const groupApiKeys = useAppStore((s) => s.groupApiKeys || {})
  const groupApiUrls = useAppStore((s) => s.groupApiUrls || {})
  const hasCustomConfig = !!(api.key || api.url)
  const effectiveType = api.type || 'Chat'
  const effectiveUrl = String(api.url || groupApiUrls[effectiveType] || '').trim()
  const effectiveKey = String(api.key || groupApiKeys[effectiveType] || '').trim()
  const configWarnings = [
    !effectiveKey ? 'API Key 为空' : null,
    !effectiveUrl ? 'Base URL 为空' : null,
    effectiveUrl && !isAllowedModelApiBaseUrl(effectiveUrl)
      ? 'Base URL 需要从预设列表中选择'
      : null
  ].filter(Boolean)

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus()
  }, [editing])

  useEffect(() => {
    if (!ctx) return
    const close = (e) => {
      if (e.target?.closest('[data-model-ctx]')) return
      setCtx(null)
    }
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', close)
    }, 0)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousedown', close)
    }
  }, [ctx])

  const handleContextMenu = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setConfigOpen(false)
    setCtx({ x: e.clientX, y: e.clientY })
  }

  const closeCtx = () => setCtx(null)

  const updateConfigPanelPosition = useCallback(() => {
    const rect = chipRef.current?.getBoundingClientRect()
    if (!rect || typeof window === 'undefined') return

    const panelWidth = 320
    const panelHeight = 220
    const margin = 12
    const gap = 8
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - panelWidth - margin))
    const top = Math.max(
      margin,
      Math.min(rect.bottom + gap, window.innerHeight - panelHeight - margin)
    )
    setConfigPanelPos({ left, top })
  }, [])

  useEffect(() => {
    if (!configOpen) return

    updateConfigPanelPosition()
    const close = (e) => {
      if (e.target?.closest('[data-model-ctx]')) return
      setConfigOpen(false)
    }
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', close)
      window.addEventListener('resize', updateConfigPanelPosition)
      window.addEventListener('scroll', updateConfigPanelPosition, true)
    }, 0)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousedown', close)
      window.removeEventListener('resize', updateConfigPanelPosition)
      window.removeEventListener('scroll', updateConfigPanelPosition, true)
    }
  }, [configOpen, updateConfigPanelPosition])

  const startEdit = () => {
    setDraft(api.modelName || '')
    setEditing(true)
    closeCtx()
  }

  const confirmEdit = () => {
    updateApiConfig(api.id, { modelName: draft.trim() })
    setEditing(false)
  }

  const handleDelete = () => {
    deleteApiConfig(api.id)
    closeCtx()
  }

  const openConfig = () => {
    const type = api.type || 'Chat'
    setConfigUrl(
      api.url
        ? normalizeOptionalModelApiBaseUrl(api.url)
        : normalizeOptionalModelApiBaseUrl(groupApiUrls[type])
    )
    setConfigKey(api.key || groupApiKeys[type] || '')
    setConfigKeyVisible(false)
    setConfigOpen(true)
    updateConfigPanelPosition()
    closeCtx()
  }

  const saveConfig = () => {
    if (!isSelectableBaseUrl(configUrl)) {
      setToast('Base URL 需要从预设列表中选择')
      setTimeout(() => setToast(''), 2400)
      return
    }
    updateApiConfig(api.id, {
      url: normalizeOptionalModelApiBaseUrl(configUrl),
      key: configKey.trim()
    })
    setConfigOpen(false)
    setToast('✅ 单独配置已保存')
    setTimeout(() => setToast(''), 2000)
  }

  const clearConfig = () => {
    updateApiConfig(api.id, { url: '', key: '' })
    setConfigOpen(false)
    setToast('已恢复为分组默认')
    setTimeout(() => setToast(''), 2000)
  }

  return (
    <>
      <div className="relative" ref={chipRef}>
        <div
          onClick={() => {
            if (!editing) openConfig()
          }}
          onContextMenu={handleContextMenu}
          title="Open model API config"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-default transition-colors bg-[var(--bg-secondary)] border-[var(--border-color)]/60 hover:border-zinc-500 ${getStatusColor(api.id) === 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]' ? 'ring-1 ring-emerald-500/30' : ''}`}
        >
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusColor(api.id)}`} />
          {editing ? (
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={confirmEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmEdit()
                if (e.key === 'Escape') setEditing(false)
              }}
              className="text-[10px] font-mono bg-transparent outline-none text-[var(--text-primary)] w-28 border-b border-[var(--primary-color)]"
            />
          ) : (
            <span className="text-[10px] font-mono text-[var(--text-secondary)] max-w-[120px] truncate">
              {formatModelDisplay(api)}
            </span>
          )}
          {hasCustomConfig && (
            <span
              className="text-[8px] px-1 py-0.5 rounded bg-[var(--primary-color)]/20 text-[var(--primary-color)] font-medium leading-none"
              title="此模型使用了单独配置的 URL/Key"
            >
              独立
            </span>
          )}
          {configWarnings.length > 0 && (
            <AlertCircle
              size={12}
              className="shrink-0 text-amber-400"
              title={configWarnings.join('; ')}
            />
          )}
        </div>

        {/* toast */}
        {toast && (
          <div
            className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-1 rounded text-[10px] font-medium z-[310] animate-in fade-in"
            style={{
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
            }}
          >
            {toast}
          </div>
        )}

        {/* 单独配置面板 */}
        {false && configOpen && (
          <div
            data-model-ctx
            className="fixed w-80 p-3 rounded-xl border bg-[var(--bg-panel)] border-[var(--border-color)] shadow-2xl z-[200100]"
            style={{ left: configPanelPos.left, top: configPanelPos.top }}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="min-w-0 truncate text-[10px] font-bold text-[var(--text-secondary)]">
                🔧 单独配置 · {formatModelDisplay(api)}
              </div>
              <button
                onClick={() => setConfigOpen(false)}
                className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-secondary)] text-xs"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2">
              <div>
                <label className="text-[9px] font-medium text-[var(--text-muted)] block mb-1">
                  Base URL
                </label>
                <input
                  type="text"
                  value={configUrl}
                  onChange={(e) => setConfigUrl(e.target.value)}
                  className="w-full rounded px-2 py-1.5 text-[10px] outline-none border font-mono bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-secondary)] focus:border-[var(--primary-color)]"
                  placeholder="留空则使用分组默认"
                />
              </div>
              <div>
                <label className="text-[9px] font-medium text-[var(--text-muted)] block mb-1">
                  API Key
                </label>
                <div className="relative">
                  <input
                    type={configKeyVisible ? 'text' : 'password'}
                    value={configKey}
                    onChange={(e) => setConfigKey(e.target.value)}
                    className="w-full rounded px-2 py-1.5 pr-7 text-[10px] outline-none border font-mono bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-secondary)] focus:border-[var(--primary-color)]"
                    placeholder="留空则使用分组默认"
                  />
                  <button
                    type="button"
                    onClick={() => setConfigKeyVisible(!configKeyVisible)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  >
                    {configKeyVisible ? <EyeOff size={10} /> : <Eye size={10} />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between pt-1 gap-2">
                {hasCustomConfig && (
                  <button
                    onClick={clearConfig}
                    className="px-2 py-1 text-[9px] rounded font-medium transition-colors text-orange-400 hover:bg-orange-500/10"
                  >
                    恢复分组默认
                  </button>
                )}
                <div className="flex-1" />
                <button
                  onClick={saveConfig}
                  className="px-3 py-1 bg-[var(--primary-color)] text-white text-[9px] rounded font-medium"
                >
                  保存配置
                </button>
              </div>
            </div>
            <p className="text-[8px] text-[var(--text-muted)] mt-2 leading-relaxed">
              留空的字段将自动使用当前分组的默认值。
            </p>
          </div>
        )}
      </div>

      {configOpen &&
        createPortal(
          <ModelConfigPanel
            api={api}
            position={configPanelPos}
            configUrl={configUrl}
            configKey={configKey}
            configKeyVisible={configKeyVisible}
            hasCustomConfig={hasCustomConfig}
            setConfigUrl={setConfigUrl}
            setConfigKey={setConfigKey}
            setConfigKeyVisible={setConfigKeyVisible}
            onClose={() => setConfigOpen(false)}
            onSave={saveConfig}
            onClear={clearConfig}
          />,
          document.body
        )}

      {ctx &&
        createPortal(
          <div
            data-model-ctx
            className="context-menu context-menu-light fixed z-[200100] w-32"
            style={{ left: ctx.x, top: ctx.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="context-menu-item text-xs" onClick={startEdit}>
              修改 ID
            </button>
            <button className="context-menu-item text-xs" onClick={openConfig}>
              🔧 单独配置
            </button>
            {api.isCustom && (
              <button className="context-menu-item text-xs text-red-400" onClick={handleDelete}>
                删除模型
              </button>
            )}
          </div>,
          document.body
        )}
    </>
  )
}

function ModelConfigPanel({
  api,
  position,
  configUrl,
  configKey,
  configKeyVisible,
  hasCustomConfig,
  setConfigUrl,
  setConfigKey,
  setConfigKeyVisible,
  onClose,
  onSave,
  onClear
}) {
  return (
    <div
      data-model-ctx
      className="fixed w-80 p-3 rounded-xl border bg-[var(--bg-panel)] border-[var(--border-color)] shadow-2xl z-[200100]"
      style={{ left: position.left, top: position.top }}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="min-w-0 truncate text-[10px] font-bold text-[var(--text-secondary)]">
          🔧 单独配置 · {formatModelDisplay(api)}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-secondary)] text-xs"
        >
          ✕
        </button>
      </div>

      <div className="space-y-2">
        <div>
          <label className="text-[9px] font-medium text-[var(--text-muted)] block mb-1">
            Base URL
          </label>
          <select
            value={configUrl}
            onChange={(e) => setConfigUrl(e.target.value)}
            className="w-full rounded px-2 py-1.5 text-[10px] outline-none border font-mono bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-secondary)] focus:border-[var(--primary-color)]"
          >
            <option value="">使用分组默认</option>
            {MODEL_API_BASE_URL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {formatBaseUrlOption(option)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[9px] font-medium text-[var(--text-muted)] block mb-1">
            API Key
          </label>
          <div className="relative">
            <input
              type={configKeyVisible ? 'text' : 'password'}
              value={configKey}
              onChange={(e) => setConfigKey(e.target.value)}
              className="w-full rounded px-2 py-1.5 pr-7 text-[10px] outline-none border font-mono bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-secondary)] focus:border-[var(--primary-color)]"
              placeholder="留空则使用分组默认"
            />
            <button
              type="button"
              onClick={() => setConfigKeyVisible(!configKeyVisible)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            >
              {configKeyVisible ? <EyeOff size={10} /> : <Eye size={10} />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 gap-2">
          {hasCustomConfig && (
            <button
              onClick={onClear}
              className="px-2 py-1 text-[9px] rounded font-medium transition-colors text-orange-400 hover:bg-orange-500/10"
            >
              恢复分组默认
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onSave}
            className="shrink-0 px-3 py-1 bg-[var(--primary-color)] text-white text-[9px] rounded font-medium"
          >
            保存配置
          </button>
        </div>
      </div>

      <p className="text-[8px] text-[var(--text-muted)] mt-2 leading-relaxed">
        留空的字段会自动使用当前分组的默认值。
      </p>
    </div>
  )
}

function GroupDefaultConfig({ type, visibleKeys, setVisibleKeys }) {
  const [open, setOpen] = useState(false)
  const [saveToast, setSaveToast] = useState('')
  const groupApiKeys = useAppStore((s) => s.groupApiKeys)
  const groupApiUrls = useAppStore((s) => s.groupApiUrls)
  const setGroupApiKey = useAppStore((s) => s.setGroupApiKey)
  const setGroupApiUrl = useAppStore((s) => s.setGroupApiUrl)

  const currentKey = groupApiKeys[type] || ''
  const currentUrl = normalizeModelApiBaseUrl(groupApiUrls[type], DEFAULT_GROUP_API_URLS[type])
  const keyId = `group-${type}`
  const hasConfig = currentKey || currentUrl

  const handleSave = () => {
    setGroupApiKey(type, currentKey.trim())
    setGroupApiUrl(type, currentUrl)
    setOpen(false)
    setSaveToast('✅ 分组默认配置已保存')
    setTimeout(() => setSaveToast(''), 2000)
  }

  const truncate = (str, len = 18) => {
    if (!str) return ''
    return str.length > len ? str.slice(0, len) + '...' : str
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="h-7 px-2.5 text-[10px] font-medium rounded-lg border transition-colors bg-[var(--bg-secondary)] text-zinc-400 border-[var(--border-color)] hover:text-zinc-200 hover:border-zinc-500 flex items-center gap-1"
      >
        ⚙️ 默认
        {hasConfig && (
          <span className="text-[8px] text-zinc-600 font-mono max-w-[60px] truncate">
            {truncate(currentUrl) || truncate(currentKey)}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-2 w-72 p-3 rounded-xl border bg-[var(--bg-panel)] border-[var(--border-color)] shadow-2xl z-50">
          <div className="text-[10px] font-bold text-[var(--text-secondary)] mb-2">
            {type === 'Chat' ? '文本' : type === 'Image' ? '图片' : '视频'}组默认配置
          </div>
          <div className="space-y-2">
            <div>
              <label className="text-[9px] font-medium text-[var(--text-muted)] block mb-1">
                Base URL
              </label>
              <select
                value={currentUrl}
                onChange={(e) => setGroupApiUrl(type, e.target.value)}
                className="w-full rounded px-2 py-1.5 text-[10px] outline-none border font-mono bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-secondary)] focus:border-[var(--primary-color)]"
              >
                <option value="">不设置</option>
                {MODEL_API_BASE_URL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {formatBaseUrlOption(option)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-medium text-[var(--text-muted)] block mb-1">
                API Key
              </label>
              <div className="relative">
                <input
                  type={visibleKeys.has(keyId) ? 'text' : 'password'}
                  value={currentKey}
                  onChange={(e) => setGroupApiKey(type, e.target.value)}
                  className="w-full rounded px-2 py-1.5 pr-7 text-[10px] outline-none border font-mono bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-secondary)] focus:border-[var(--primary-color)]"
                  placeholder="必填，该分组的统一 API Key"
                />
                <button
                  type="button"
                  onClick={() =>
                    setVisibleKeys((prev) => {
                      const next = new Set(prev)
                      next.has(keyId) ? next.delete(keyId) : next.add(keyId)
                      return next
                    })
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                >
                  {visibleKeys.has(keyId) ? <EyeOff size={10} /> : <Eye size={10} />}
                </button>
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <button
                onClick={handleSave}
                className="px-3 py-1 bg-[var(--primary-color)] text-white text-[9px] rounded font-medium"
              >
                保存组默认
              </button>
            </div>
          </div>
        </div>
      )}
      {saveToast && (
        <div
          className="absolute top-full right-0 mt-1 whitespace-nowrap px-2.5 py-1 rounded text-[10px] font-medium z-[60] animate-in fade-in"
          style={{
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
          }}
        >
          {saveToast}
        </div>
      )}
    </div>
  )
}
