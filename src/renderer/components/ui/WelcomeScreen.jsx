import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../../store/useAppStore'

// 开屏视频路径（通过 xinghe 协议加载本地文件）
const WELCOME_VIDEO_SRC = `xinghe://local?path=${encodeURIComponent('D:/KF/ljxh.1/3月14日(1).mp4')}`

export const WelcomeScreen = ({ projects, setProjects, handleDeleteHistoryProject }) => {
  const currentProject = useAppStore((state) => state.currentProject)
  const setCurrentProject = useAppStore((state) => state.setCurrentProject)

  const [isFadingOut, setIsFadingOut] = useState(false)
  const [projectNameInput, setProjectNameInput] = useState('')
  const [isVisible, setIsVisible] = useState(true)
  const [hoveredProjectId, setHoveredProjectId] = useState(null)

  const videoRef = useRef(null)

  // 进入画布后停止视频
  useEffect(() => {
    if (isFadingOut && videoRef.current) {
      videoRef.current.pause()
    }
  }, [isFadingOut])

  // 如果从 store hydration 获得了项目就直接淡出
  useEffect(() => {
    if (currentProject && isVisible && !isFadingOut) {
      setIsFadingOut(true)
      setTimeout(() => setIsVisible(false), 800)
    }
  }, [currentProject, isVisible, isFadingOut])

  // 返回首页：当 currentProject 变为 null 时，重新显示欢迎屏
  useEffect(() => {
    if (!currentProject && !isVisible) {
      setIsVisible(true)
      setIsFadingOut(false)
      // 恢复视频播放
      if (videoRef.current) {
        videoRef.current.play().catch(() => {})
      }
    }
  }, [currentProject])

  if (!isVisible) return null

  // ========== 创建项目 ==========
  const handleCreateProject = () => {
    const name = projectNameInput.trim()
    if (!name) return
    const newId = `proj-${Date.now()}`
    setIsFadingOut(true)
    setTimeout(() => {
      setCurrentProject({ id: newId, name, createdAt: new Date().toISOString() })
      useAppStore.getState().setProjectName(name)
      setProjects((prev) => [
        { id: newId, name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), thumbnail: null },
        ...prev
      ])
      setIsVisible(false)
    }, 800)
  }

  // ========== 加载项目（从 SQLite 优先，回退到旧 data 字段） ==========
  const handleLoadProject = async (project) => {
    if (!project?.id) return
    setIsFadingOut(true)
    setTimeout(async () => {
      try {
        const store = useAppStore.getState()

        // 优先从 SQLite 加载
        let savedNodes = []
        let savedConnections = []
        if (window.dbAPI?.nodes?.list) {
          savedNodes = await window.dbAPI.nodes.list(project.id)
        }
        if (window.dbAPI?.connections?.list) {
          savedConnections = await window.dbAPI.connections.list(project.id)
        }

        // 回退到旧的 data 字段
        if (savedNodes.length === 0 && project.data?.nodes) {
          savedNodes = project.data.nodes
        }
        if (savedConnections.length === 0 && project.data?.connections) {
          savedConnections = project.data.connections
        }

        store.setNodes(savedNodes || [])
        store.setConnections(savedConnections || [])
        if (project.data?.view) store.setView(project.data.view)
        store.setProjectName(project.data?.projectName || project.name)
        store.setCurrentProject({
          id: project.id,
          name: project.name,
          createdAt: project.createdAt || project.updatedAt || new Date().toISOString()
        })

        // 加载项目专属历史记录
        if (window.dbAPI?.settings) {
          const historyKey = `tapnow_history_v2_${project.id}`
          const historyJson = await window.dbAPI.settings.get(historyKey)
          if (historyJson) {
            try {
              const parsed = JSON.parse(historyJson)
              if (Array.isArray(parsed)) store.setHistory(parsed)
            } catch { /* ignore */ }
          } else {
            store.setHistory([])
          }
        }

        setIsVisible(false)
      } catch (e) {
        console.error('[WelcomeScreen] 加载项目失败:', e)
        setIsFadingOut(false)
      }
    }, 800)
  }

  const canCreate = projectNameInput.trim().length > 0

  return (
    <div
      className={`fixed inset-0 z-[90] flex flex-col transition-opacity duration-[1500ms] pointer-events-auto overflow-hidden ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{ background: '#0a0a0a' }}
    >
      {/* ========== 顶部：循环视频 ========== */}
      <div className="relative flex-[1] min-h-0 overflow-hidden">
        <video
          ref={videoRef}
          src={WELCOME_VIDEO_SRC}
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          loop
          muted
          playsInline
        />
        {/* 半透明叠加层 */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(180deg, rgba(18,24,48,0.15) 0%, rgba(10,10,10,0.6) 100%)'
          }}
        />
        {/* 品牌标语 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
          <h1
            className="text-3xl font-light tracking-[0.4em] text-white/90 mb-4 select-none"
            style={{ fontFamily: "'Inter', 'Noto Sans SC', sans-serif" }}
          >
            星河智绘
          </h1>
          <p className="text-xs tracking-[0.6em] text-white/40 select-none ml-[0.6em]">
            伏线千里，化念为形
          </p>
        </div>
      </div>

      {/* ========== 下半部分：黑灰流体背景 ========== */}
      <div
        className="flex-[1.2] min-h-0 flex flex-col relative overflow-hidden"
        style={{ background: '#0d0d0d' }}
      >
        {/* 流体动画背景层 1 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `
              radial-gradient(ellipse 80% 60% at 20% 40%, rgba(40,40,50,0.5) 0%, transparent 60%),
              radial-gradient(ellipse 60% 80% at 80% 60%, rgba(30,30,40,0.4) 0%, transparent 60%),
              radial-gradient(ellipse 70% 50% at 50% 30%, rgba(50,50,60,0.3) 0%, transparent 60%)`,
            animation: 'fluidShift 12s ease-in-out infinite alternate'
          }}
        />
        {/* 流体动画背景层 2 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `
              radial-gradient(ellipse 50% 70% at 70% 70%, rgba(35,35,45,0.4) 0%, transparent 55%),
              radial-gradient(ellipse 90% 40% at 30% 80%, rgba(25,25,35,0.35) 0%, transparent 50%)`,
            animation: 'fluidShift2 15s ease-in-out infinite alternate'
          }}
        />

        {/* 与视频的过渡融合 */}
        <div
          className="absolute top-0 left-0 right-0 h-12 pointer-events-none z-10"
          style={{ background: 'linear-gradient(180deg, #0a0a0a 0%, transparent 100%)' }}
        />

        {/* 中间：创建项目区 */}
        <div className="flex-shrink-0 flex items-center justify-center py-6 px-6 z-20">
          <div
            className="flex items-center gap-3 px-6 py-4 rounded-2xl border max-w-lg w-full"
            style={{
              background: 'rgba(255,255,255,0.04)',
              borderColor: 'rgba(255,255,255,0.1)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)'
            }}
          >
            <input
              type="text"
              className="flex-1 bg-transparent text-white text-sm tracking-wide outline-none placeholder:text-white/25"
              placeholder="输入新项目名称..."
              maxLength={30}
              value={projectNameInput}
              onChange={(e) => setProjectNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canCreate) handleCreateProject()
              }}
              spellCheck="false"
              autoFocus
            />
            <button
              onClick={handleCreateProject}
              disabled={!canCreate}
              className={`px-5 py-2 rounded-xl text-xs font-medium tracking-wider transition-all duration-300 shrink-0 ${
                canCreate
                  ? 'bg-gradient-to-r from-gray-500/60 to-gray-400/50 text-white hover:from-gray-400/70 hover:to-gray-300/60 shadow-lg shadow-black/30 active:scale-95'
                  : 'bg-white/5 text-white/20 cursor-not-allowed'
              }`}
              title={canCreate ? '创建新项目' : '请先输入项目名称'}
            >
              创建项目
            </button>
          </div>
        </div>

        {/* 底部：项目列表 */}
        <div className="flex-1 min-h-0 flex flex-col z-20 px-8 pb-4">
          {projects.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-white/20 text-sm tracking-wider">暂无项目，创建你的第一个项目吧</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar pt-2">
              <div className="flex flex-wrap gap-3 justify-center content-start">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    onClick={() => handleLoadProject(project)}
                    onMouseEnter={() => setHoveredProjectId(project.id)}
                    onMouseLeave={() => setHoveredProjectId(null)}
                    className="relative group w-[150px] p-3.5 rounded-xl border cursor-pointer transition-all duration-300 hover:scale-[1.03] hover:shadow-xl"
                    style={{
                      background:
                        hoveredProjectId === project.id
                          ? 'rgba(255,255,255,0.07)'
                          : 'rgba(255,255,255,0.025)',
                      borderColor:
                        hoveredProjectId === project.id
                          ? 'rgba(160,160,180,0.3)'
                          : 'rgba(255,255,255,0.06)',
                      boxShadow:
                        hoveredProjectId === project.id ? '0 4px 16px rgba(0,0,0,0.3)' : 'none'
                    }}
                  >
                    <div
                      className="text-sm text-white/85 truncate font-medium mb-2 leading-tight"
                      title={project.name}
                    >
                      {project.name}
                    </div>
                    <div className="text-[10px] text-white/30">
                      {new Date(project.updatedAt).toLocaleDateString('zh-CN', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                    {hoveredProjectId === project.id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (handleDeleteHistoryProject) handleDeleteHistoryProject(project.id)
                        }}
                        className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all text-xs"
                        title="删除项目"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 流体动画 keyframes */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @keyframes fluidShift {
            0%   { transform: translate(0, 0) scale(1); }
            33%  { transform: translate(15px, -10px) scale(1.05); }
            66%  { transform: translate(-10px, 8px) scale(0.97); }
            100% { transform: translate(5px, -5px) scale(1.02); }
          }
          @keyframes fluidShift2 {
            0%   { transform: translate(0, 0) scale(1); }
            50%  { transform: translate(-20px, 12px) scale(1.06); }
            100% { transform: translate(10px, -8px) scale(0.98); }
          }
        `
        }}
      />
    </div>
  )
}
