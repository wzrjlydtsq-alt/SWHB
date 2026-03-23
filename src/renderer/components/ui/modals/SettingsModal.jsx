import { Check, Trash2, Plus, LinkIcon, CheckCircle2, Loader2, Eye, EyeOff } from '../../../utils/icons.jsx'
import { DELETED_MODEL_IDS } from '../../../utils/constants.js'
import { Button } from '../Button.jsx'
import { Modal } from '../Modal.jsx'
import { useState, useEffect } from 'react'
import { useAppStore } from '../../../store/useAppStore.js'
import { useShallow } from 'zustand/react/shallow'

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
}) {
  const [activeApiTab, setActiveApiTab] = useState('Chat')
  const [activeSettingsTab, setActiveSettingsTab] = useState('general')
  const [globalSaveStatus, setGlobalSaveStatus] = useState('')
  const [visibleKeys, setVisibleKeys] = useState(new Set())

  const THEME_COLORS = [
    { name: '默认蓝', color: '#3b82f6' },
    { name: '草绿', color: '#4CAF50' },
    { name: '灰色', color: '#888888' },
    { name: '墨绿', color: '#0A4F30' },
    { name: '浅蓝', color: '#7EC8E3' },
    { name: '湖蓝', color: '#0B86C8' },
    { name: '藏蓝', color: '#003366' },
    { name: '鹅黄', color: '#FFE66D' },
    { name: '橘黄', color: '#F5A623' },
    { name: '深黄', color: '#D4A017' },
    { name: '深灰', color: '#3A3A3A' },
    { name: '标色', color: '#8B5E3C' }
  ]

  const {
    uiScale,
    autoSaveInterval,
    showConnectionAnimations,
    silenceConfirmations,
    setUiScale,
    setAutoSaveInterval,
    setShowConnectionAnimations,
    setSilenceConfirmations,
    imageSavePath,
    setImageSavePath,
    videoSavePath,
    setVideoSavePath,
    themeColor,
    setThemeColor
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
      imageSavePath: state.imageSavePath,
      setImageSavePath: state.setImageSavePath,
      videoSavePath: state.videoSavePath,
      setVideoSavePath: state.setVideoSavePath,
      themeColor: state.themeColor,
      setThemeColor: state.setThemeColor
    }))
  )

  useEffect(() => {
    if (window.api?.invoke && imageSavePath) {
      window.api.invoke('cache:config', { imageSavePath })
    }
  }, [imageSavePath])

  useEffect(() => {
    if (window.api?.invoke && videoSavePath) {
      window.api.invoke('cache:config', { videoSavePath })
    }
  }, [videoSavePath])

  useEffect(() => {
    if (window.api?.invoke) {
      const initConfig = {}
      if (imageSavePath) initConfig.imageSavePath = imageSavePath
      if (videoSavePath) initConfig.videoSavePath = videoSavePath
      if (Object.keys(initConfig).length > 0) {
        window.api.invoke('cache:config', initConfig)
      }
    }
  }, [])

  return (
    <Modal
      isOpen={settingsOpen}
      onClose={() => setSettingsOpen(false)}
      title="系统偏好设置"
      className="w-[850px]"
    >
      <div className="flex h-[600px] w-full">
        {/* 侧边导航 */}
        <div className="w-48 border-r border-[var(--border-color)] bg-[var(--bg-base)] flex flex-col pt-3 pb-3">
          {[
            { id: 'general', label: '🎛️ 通用' },
            { id: 'appearance', label: '🎨 外观与体验' },
            { id: 'workspace', label: '🗂️ 工作区与存储' },
            { id: 'models', label: '🤖 模型接口配置' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSettingsTab(tab.id)}
              className={`mx-2 my-0.5 px-3 py-2 text-sm text-left rounded-lg transition-colors ${
                activeSettingsTab === tab.id
                  ? 'bg-zinc-800 text-white font-medium'
                  : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--bg-base)]">
          {activeSettingsTab === 'general' && (
            <div className="p-6 space-y-8 animate-in fade-in flex flex-col">
              <section>
                <h3 className="text-sm font-bold text-zinc-300 mb-4 pb-2 border-b border-[var(--border-color)]">
                  分类默认接口 (API)
                </h3>
                <div className="space-y-6 max-w-xl">
                  {/* Chat 默认接口 */}
                  <div className="p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
                    <div className="text-xs font-bold text-zinc-300 mb-3 flex items-center gap-2">
                      💬 Chat 默认接口
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-medium text-zinc-500 mb-1 block">
                          Base URL
                        </label>
                        <input
                          type="text"
                          value={useAppStore.getState().chatApiUrl}
                          onChange={(e) => useAppStore.setState({ chatApiUrl: e.target.value.trim() })}
                          className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors border font-mono bg-[var(--bg-base)] border-[var(--border-color)] text-zinc-200 focus:border-[var(--primary-color)]"
                          placeholder="https://api.openai.com"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-zinc-500 mb-1 block">
                          API Key
                        </label>
                        <div className="relative">
                          <input
                            type={visibleKeys.has('chat') ? 'text' : 'password'}
                            value={useAppStore.getState().chatApiKey}
                            onChange={(e) => useAppStore.setState({ chatApiKey: e.target.value.trim() })}
                            className="w-full rounded-lg px-3 py-2 pr-9 text-sm outline-none transition-colors border font-mono bg-[var(--bg-base)] border-[var(--border-color)] text-zinc-200 focus:border-[var(--primary-color)]"
                            placeholder="sk-..."
                          />
                          <button
                            type="button"
                            onClick={() => setVisibleKeys(prev => {
                              const next = new Set(prev)
                              next.has('chat') ? next.delete('chat') : next.add('chat')
                              return next
                            })}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                            tabIndex={-1}
                          >
                            {visibleKeys.has('chat') ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Image 默认接口 */}
                  <div className="p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
                    <div className="text-xs font-bold text-zinc-300 mb-3 flex items-center gap-2">
                      🖼️ Image 默认接口
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-medium text-zinc-500 mb-1 block">
                          Base URL
                        </label>
                        <input
                          type="text"
                          value={useAppStore.getState().imageApiUrl}
                          onChange={(e) => useAppStore.setState({ imageApiUrl: e.target.value.trim() })}
                          className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors border font-mono bg-[var(--bg-base)] border-[var(--border-color)] text-zinc-200 focus:border-[var(--primary-color)]"
                          placeholder="https://api.openai.com"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-zinc-500 mb-1 block">
                          API Key
                        </label>
                        <div className="relative">
                          <input
                            type={visibleKeys.has('image') ? 'text' : 'password'}
                            value={useAppStore.getState().imageApiKey}
                            onChange={(e) => useAppStore.setState({ imageApiKey: e.target.value.trim() })}
                            className="w-full rounded-lg px-3 py-2 pr-9 text-sm outline-none transition-colors border font-mono bg-[var(--bg-base)] border-[var(--border-color)] text-zinc-200 focus:border-[var(--primary-color)]"
                            placeholder="sk-..."
                          />
                          <button
                            type="button"
                            onClick={() => setVisibleKeys(prev => {
                              const next = new Set(prev)
                              next.has('image') ? next.delete('image') : next.add('image')
                              return next
                            })}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                            tabIndex={-1}
                          >
                            {visibleKeys.has('image') ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Video 默认接口 */}
                  <div className="p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
                    <div className="text-xs font-bold text-zinc-300 mb-3 flex items-center gap-2">
                      🎞️ Video 默认接口
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-medium text-zinc-500 mb-1 block">
                          Base URL
                        </label>
                        <input
                          type="text"
                          value={useAppStore.getState().videoApiUrl}
                          onChange={(e) => useAppStore.setState({ videoApiUrl: e.target.value.trim() })}
                          className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors border font-mono bg-[var(--bg-base)] border-[var(--border-color)] text-zinc-200 focus:border-[var(--primary-color)]"
                          placeholder="https://api.openai.com"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-zinc-500 mb-1 block">
                          API Key
                        </label>
                        <div className="relative">
                          <input
                            type={visibleKeys.has('video') ? 'text' : 'password'}
                            value={useAppStore.getState().videoApiKey}
                            onChange={(e) => useAppStore.setState({ videoApiKey: e.target.value.trim() })}
                            className="w-full rounded-lg px-3 py-2 pr-9 text-sm outline-none transition-colors border font-mono bg-[var(--bg-base)] border-[var(--border-color)] text-zinc-200 focus:border-[var(--primary-color)]"
                            placeholder="sk-..."
                          />
                          <button
                            type="button"
                            onClick={() => setVisibleKeys(prev => {
                              const next = new Set(prev)
                              next.has('video') ? next.delete('video') : next.add('video')
                              return next
                            })}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                            tabIndex={-1}
                          >
                            {visibleKeys.has('video') ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end items-center gap-3 mt-4">
                    {globalSaveStatus && (
                      <span className="text-sm text-green-500 flex items-center gap-1">
                        <Check size={14} /> {globalSaveStatus}
                      </span>
                    )}
                    <button
                      onClick={() => {
                        const state = useAppStore.getState()
                        // 持久化全局 API 配置到 SQLite
                        state.setChatApiKey(state.chatApiKey)
                        state.setChatApiUrl(state.chatApiUrl)
                        state.setImageApiKey(state.imageApiKey)
                        state.setImageApiUrl(state.imageApiUrl)
                        state.setVideoApiKey(state.videoApiKey)
                        state.setVideoApiUrl(state.videoApiUrl)
                        setGlobalSaveStatus('保存成功！')
                        setTimeout(() => setGlobalSaveStatus(''), 2000)
                      }}
                      className="px-4 py-2 bg-[var(--primary-color)] hover:bg-[var(--primary-hover)] text-white text-sm rounded-lg transition-colors"
                    >
                      保存配置
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500 mt-2 leading-relaxed bg-zinc-800/20 p-3 rounded-lg border border-[var(--border-color)]/50">
                    分别为 Chat、Image、Video
                    三类模型设置独立的请求网关与令牌。添加新模型时将根据类型自动使用对应配置。
                  </p>
                </div>
              </section>
              <section>
                <h3 className="text-sm font-bold text-zinc-300 mb-4 pb-2 border-b border-[var(--border-color)]">
                  特定操作
                </h3>
                <div className="flex items-center justify-between p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-zinc-200 block">
                      即梦图生图本地上传
                    </label>
                    <p className="text-xs text-zinc-500 mt-1">
                      开启后，调用特定模型接口时强制转换网络图片为本地表单数据上传。
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer ml-4">
                    <input
                      type="checkbox"
                      checked={jimengUseLocalFile}
                      onChange={(e) => {
                        const newValue = e.target.checked
                        setJimengUseLocalFile(newValue)
                        // 已通过 useAppConfig hook 中的 dbService 自动双写
                      }}
                      className="sr-only peer"
                    />
                    <div
                      className={`w-10 h-5 bg-zinc-700 rounded-full peer peer-checked:bg-[var(--primary-color)] peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all`}
                    ></div>
                  </label>
                </div>
              </section>
            </div>
          )}

          {activeSettingsTab === 'appearance' && (
            <div className="p-6 space-y-8 animate-in fade-in">
              <section>
                <h3 className="text-sm font-bold text-zinc-300 mb-4 pb-2 border-b border-[var(--border-color)]">
                  🎨 主题配色
                </h3>
                <div className="grid grid-cols-6 gap-3 max-w-sm">
                  {THEME_COLORS.map((t) => (
                    <button
                      key={t.color}
                      title={t.name}
                      onClick={() => setThemeColor(t.color)}
                      className="group relative w-10 h-10 rounded-full transition-all duration-200 hover:scale-110 focus:outline-none"
                      style={{
                        backgroundColor: t.color,
                        boxShadow:
                          themeColor === t.color
                            ? `0 0 0 2px #18181b, 0 0 0 4px ${t.color}`
                            : 'none'
                      }}
                    >
                      {themeColor === t.color && (
                        <Check
                          size={16}
                          className="absolute inset-0 m-auto text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                        />
                      )}
                      <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        {t.name}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-bold text-zinc-300 mb-4 pb-2 border-b border-[var(--border-color)]">
                  字号缩放
                </h3>
                <div className="flex items-center gap-4 bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] max-w-sm">
                  <span className="text-xs text-zinc-400">小</span>
                  <input
                    type="range"
                    min="75"
                    max="150"
                    step="5"
                    value={uiScale}
                    onChange={(e) => setUiScale(Number(e.target.value))}
                    className="flex-1 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-[var(--primary-color)]"
                  />
                  <span className="text-xs text-zinc-400">大</span>
                  <span className="w-12 text-right text-sm font-mono text-[var(--primary-color)]">
                    {uiScale}%
                  </span>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-bold text-zinc-300 mb-4 pb-2 border-b border-[var(--border-color)]">
                  动态反馈
                </h3>
                <div className="flex items-center justify-between p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-zinc-200 block">
                      节点连接线动画
                    </label>
                    <p className="text-xs text-zinc-500 mt-1">
                      显示画布中节点间数据流动的脉冲动画。
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer ml-4">
                    <input
                      type="checkbox"
                      checked={showConnectionAnimations}
                      onChange={(e) => setShowConnectionAnimations(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div
                      className={`w-10 h-5 bg-zinc-700 rounded-full peer peer-checked:bg-[var(--primary-color)] peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all`}
                    ></div>
                  </label>
                </div>
              </section>
            </div>
          )}

          {activeSettingsTab === 'workspace' && (
            <div className="p-6 space-y-8 animate-in fade-in">
              <section>
                <h3 className="text-sm font-bold text-zinc-300 mb-4 pb-2 border-b border-[var(--border-color)]">
                  默认保存路径
                </h3>
                <div className="space-y-4 max-w-xl">
                  <div>
                    <label className="text-xs font-medium text-zinc-500 mb-1 block">
                      图片输出目录
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={imageSavePath}
                        onChange={(e) => setImageSavePath(e.target.value)}
                        className="flex-1 rounded-lg px-3 py-2 text-sm outline-none transition-colors border font-mono bg-[var(--bg-secondary)] border-[var(--border-color)] text-zinc-200 focus:border-[var(--primary-color)]"
                      />
                      <button
                        onClick={async () => {
                          if (window.api?.localCacheAPI?.openDirectory) {
                            const res = await window.api.localCacheAPI.openDirectory(imageSavePath)
                            if (res && res.success && res.path) {
                              setImageSavePath(res.path)
                            }
                          }
                        }}
                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm rounded-lg transition-colors whitespace-nowrap"
                      >
                        浏览...
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-500 mb-1 block">
                      视频输出目录
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={videoSavePath}
                        onChange={(e) => setVideoSavePath(e.target.value)}
                        className="flex-1 rounded-lg px-3 py-2 text-sm outline-none transition-colors border font-mono bg-[var(--bg-secondary)] border-[var(--border-color)] text-zinc-200 focus:border-[var(--primary-color)]"
                      />
                      <button
                        onClick={async () => {
                          if (window.api?.localCacheAPI?.openDirectory) {
                            const res = await window.api.localCacheAPI.openDirectory(videoSavePath)
                            if (res && res.success && res.path) {
                              setVideoSavePath(res.path)
                            }
                          }
                        }}
                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm rounded-lg transition-colors whitespace-nowrap"
                      >
                        浏览...
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-bold text-zinc-300 mb-4 pb-2 border-b border-[var(--border-color)]">
                  防呆与静音
                </h3>
                <div className="flex items-center justify-between p-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)]">
                  <div className="flex-1">
                    <label className="text-sm font-medium text-zinc-200 block">跳过删除确认</label>
                    <p className="text-xs text-zinc-500 mt-1">
                      删除节点或历史记录时不再弹出二次确认框。
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
                      className={`w-10 h-5 bg-zinc-700 rounded-full peer peer-checked:bg-[var(--primary-color)] peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all`}
                    ></div>
                  </label>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-bold text-zinc-300 mb-4 pb-2 border-b border-[var(--border-color)]">
                  自动保存跨度 (分钟)
                </h3>
                <div className="flex items-center gap-4 bg-[var(--bg-secondary)] p-4 rounded-lg border border-[var(--border-color)] max-w-sm">
                  <span className="text-xs text-zinc-400">1m</span>
                  <input
                    type="range"
                    min="1"
                    max="30"
                    step="1"
                    value={autoSaveInterval}
                    onChange={(e) => setAutoSaveInterval(Number(e.target.value))}
                    className="flex-1 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-[var(--primary-color)]"
                  />
                  <span className="text-xs text-zinc-400">30m</span>
                  <span className="w-8 text-right text-sm font-mono text-[var(--primary-color)]">
                    {autoSaveInterval}
                  </span>
                </div>
              </section>
            </div>
          )}

          {activeSettingsTab === 'models' && (
            <div className="p-6 h-full flex flex-col animate-in fade-in">
              <div className="flex justify-between items-center mb-6">
                <div className="flex gap-1.5 bg-[var(--bg-secondary)] p-1 rounded-lg border border-[var(--border-color)]">
                  {['Chat', 'Image', 'Video'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveApiTab(tab)}
                      className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all ${
                        activeApiTab === tab
                          ? 'bg-zinc-700 text-white shadow-sm'
                          : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                      }`}
                    >
                      {tab === 'Chat'
                        ? '💬 文本 (Chat)'
                        : tab === 'Image'
                          ? '🖼️ 图片 (Image)'
                          : '🎞️ 视频 (Video)'}
                    </button>
                  ))}
                </div>
                <Button
                  className="h-8 text-xs px-4"
                  style={{ backgroundColor: 'var(--primary-color)', color: '#fff' }}
                  onClick={() => addNewModel(activeApiTab)}
                >
                  <Plus size={14} className="mr-1.5" /> 添加新模型
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3 pb-8">
                {(Array.isArray(apiConfigs) ? apiConfigs : [])
                  .filter((api) => !DELETED_MODEL_IDS.includes(api.id) && api.type === activeApiTab)
                  .map((api) => (
                    <div
                      key={api.id}
                      className="p-4 rounded-xl border relative group transition-colors hover:border-zinc-700 bg-[var(--bg-secondary)] border-[var(--border-color)]/80"
                    >
                      {api.isCustom && (
                        <button
                          onClick={() => deleteApiConfig(api.id)}
                          className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-red-500"
                          title="删除自定义模型"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                      <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-2 h-2 rounded-full ${getStatusColor(api.id)} shadow-[0_0_8px_currentColor] opacity-80`}
                          ></div>
                          <input
                            type="text"
                            value={api.provider}
                            onChange={(e) => updateApiConfig(api.id, { provider: e.target.value })}
                            className="text-base font-bold bg-transparent border-b border-transparent hover:border-zinc-700 focus:border-[var(--primary-color)] outline-none w-56 text-zinc-100 transition-colors"
                            placeholder="显示名称 (如 GPT-4)"
                          />
                        </div>

                        <div className="grid grid-cols-[80px_1fr] items-center gap-3 ml-5">
                          <label className="text-xs font-medium text-zinc-500">模型 ID</label>
                          <input
                            type="text"
                            value={api.modelName}
                            onChange={(e) => updateApiConfig(api.id, { modelName: e.target.value })}
                            className="w-full rounded-lg px-3 py-2 text-xs outline-none transition-colors border font-mono bg-[var(--bg-base)] border-[var(--border-color)] text-zinc-300 focus:border-[var(--primary-color)]"
                            placeholder="实际传给 API 的标识 (如 gpt-4)"
                          />
                        </div>
                        {((api.modelName && api.modelName.toLowerCase().trim() === 'doubao') ||
                          (api.provider && api.provider.toLowerCase().trim() === 'doubao')) && (
                          <div className="ml-[100px] text-[10px] text-red-500/90 font-medium mt-1">
                            ⚠️ 注意：不支持直接填写 doubao。
                            <br />
                            请严格传入完整的模型端点 ID（例如 doubao-seedance-2）
                          </div>
                        )}

                        <div className="grid grid-cols-[80px_1fr] items-center gap-3 ml-5">
                          <label className="text-xs font-medium text-zinc-500">Base URL</label>
                          <input
                            type="text"
                            value={api.url || ''}
                            onChange={(e) => updateApiConfig(api.id, { url: e.target.value })}
                            className="w-full rounded-lg px-3 py-2 text-xs outline-none transition-colors border font-mono bg-[var(--bg-base)] border-[var(--border-color)] text-zinc-300 focus:border-[var(--primary-color)]"
                            placeholder="留空使用分类默认 URL"
                          />
                        </div>

                        <div className="grid grid-cols-[80px_1fr] items-center gap-3 ml-5">
                          <label className="text-xs font-medium text-zinc-500">API Key</label>
                          <div className="relative">
                            <input
                              type={visibleKeys.has(api.id) ? 'text' : 'password'}
                              value={api.key || ''}
                              onChange={(e) => updateApiConfig(api.id, { key: e.target.value.trim() })}
                              className="w-full rounded-lg px-3 py-2 pr-9 text-xs outline-none transition-colors border font-mono bg-[var(--bg-base)] border-[var(--border-color)] text-zinc-300 focus:border-[var(--primary-color)]"
                              placeholder="留空使用分类默认 Key"
                            />
                            <button
                              type="button"
                              onClick={() => setVisibleKeys(prev => {
                                const next = new Set(prev)
                                next.has(api.id) ? next.delete(api.id) : next.add(api.id)
                                return next
                              })}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                              tabIndex={-1}
                            >
                              {visibleKeys.has(api.id) ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t border-[var(--border-color)]/50 flex justify-end">
                        <button
                          onClick={() => testApiConnection(api.id)}
                          disabled={apiTesting === api.id}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            apiStatus[api.id] === 'success'
                              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                              : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 border border-transparent'
                          }`}
                        >
                          {apiTesting === api.id ? (
                            <>
                              <Loader2 size={12} className="animate-spin" /> 测试通信中...
                            </>
                          ) : apiStatus[api.id] === 'success' ? (
                            <>
                              <CheckCircle2 size={12} /> 通信正常
                            </>
                          ) : (
                            <>
                              <LinkIcon size={12} /> 测试连接
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                {(Array.isArray(apiConfigs) ? apiConfigs : []).filter(
                  (api) => !DELETED_MODEL_IDS.includes(api.id) && api.type === activeApiTab
                ).length === 0 && (
                  <div className="py-12 text-center text-zinc-500 border-2 border-dashed border-[var(--border-color)] rounded-xl">
                    暂无模型，请点击右上角手动添加。
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
