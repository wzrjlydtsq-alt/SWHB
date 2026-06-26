import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { ParticleCanvas } from './ParticleCanvas'

// ═══════════════════════════════════════════
// HUD 装饰组件
// ═══════════════════════════════════════════

const HUD_CYAN = 'hsla(195, 55%, 55%, 0.55)'
const HUD_CYAN_DIM = 'hsla(195, 40%, 50%, 0.35)'
const HUD_FONT = "'Courier New', 'Consolas', monospace"

/** 虚假坐标 */
const CoordDisplay = ({ active }) => {
  const [coords, setCoords] = useState({ x: '0482', y: '7731' })
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => {
      setCoords({
        x: String(Math.floor(Math.random() * 9999)).padStart(4, '0'),
        y: String(Math.floor(Math.random() * 9999)).padStart(4, '0')
      })
    }, 2000)
    return () => clearInterval(timer)
  }, [active])

  return (
    <div
      style={{
        position: 'absolute',
        top: 20,
        left: 24,
        pointerEvents: 'none',
        fontFamily: HUD_FONT,
        fontSize: 11,
        color: HUD_CYAN,
        letterSpacing: '0.15em',
        lineHeight: 1.6
      }}
    >
      <div style={{ opacity: 0.7 }}>SECTOR_ID</div>
      <div>X:{coords.x}</div>
      <div>Y:{coords.y}</div>
    </div>
  )
}

/** SYSTEM ONLINE 状态 */
const SystemStatus = () => (
  <div
    style={{
      position: 'absolute',
      top: 20,
      right: 24,
      pointerEvents: 'none',
      fontFamily: HUD_FONT,
      fontSize: 11,
      color: HUD_CYAN,
      letterSpacing: '0.2em',
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }}
  >
    <span style={{ opacity: 0.7 }}>SYS.STATUS</span>
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: 'hsl(155, 70%, 55%)',
        animation: 'hud-breathe 2s ease-in-out infinite',
        boxShadow: '0 0 8px hsl(155, 70%, 55%)'
      }}
    />
    <span>ONLINE</span>
  </div>
)

/** 左侧旋转轨道环（对标参考图的大型旋转元素） */
const OrbitalRing = () => (
  <div
    style={{
      position: 'absolute',
      left: -140,
      top: '50%',
      transform: 'translateY(-50%)',
      width: 650,
      height: 650,
      pointerEvents: 'none',
      opacity: 0.25
    }}
  >
    {/* 外层慢速旋转 */}
    <svg
      viewBox="0 0 320 320"
      style={{
        position: 'absolute',
        inset: 0,
        animation: 'hud-rotate 30s linear infinite'
      }}
    >
      <circle
        cx="160"
        cy="160"
        r="150"
        fill="none"
        stroke="hsl(200, 50%, 55%)"
        strokeWidth="0.6"
        strokeDasharray="8 12"
      />
      <circle
        cx="160"
        cy="160"
        r="120"
        fill="none"
        stroke="hsl(210, 45%, 50%)"
        strokeWidth="0.4"
        strokeDasharray="3 8"
      />
      {/* 刻度标记 */}
      {Array.from({ length: 36 }).map((_, i) => {
        const angle = (i * 10 * Math.PI) / 180
        const r1 = 148
        const r2 = i % 3 === 0 ? 142 : 145
        return (
          <line
            key={i}
            x1={160 + r1 * Math.cos(angle)}
            y1={160 + r1 * Math.sin(angle)}
            x2={160 + r2 * Math.cos(angle)}
            y2={160 + r2 * Math.sin(angle)}
            stroke="hsl(200, 50%, 55%)"
            strokeWidth={i % 3 === 0 ? '1' : '0.4'}
          />
        )
      })}
      {/* 十字准线 */}
      <line x1="160" y1="5" x2="160" y2="25" stroke="hsl(200, 50%, 55%)" strokeWidth="0.5" />
      <line x1="160" y1="295" x2="160" y2="315" stroke="hsl(200, 50%, 55%)" strokeWidth="0.5" />
      <line x1="5" y1="160" x2="25" y2="160" stroke="hsl(200, 50%, 55%)" strokeWidth="0.5" />
      <line x1="295" y1="160" x2="315" y2="160" stroke="hsl(200, 50%, 55%)" strokeWidth="0.5" />
    </svg>
    {/* 内层反向旋转 */}
    <svg
      viewBox="0 0 320 320"
      style={{
        position: 'absolute',
        inset: 0,
        animation: 'hud-rotate 20s linear infinite reverse'
      }}
    >
      <circle
        cx="160"
        cy="160"
        r="85"
        fill="none"
        stroke="hsl(195, 55%, 55%)"
        strokeWidth="0.5"
        strokeDasharray="5 10"
      />
      <circle cx="160" cy="160" r="50" fill="none" stroke="hsl(195, 55%, 55%)" strokeWidth="0.3" />
      {/* 小三角指示器 */}
      <polygon points="160,72 156,80 164,80" fill="hsl(195, 55%, 55%)" opacity="0.6" />
      <polygon points="160,248 156,240 164,240" fill="hsl(195, 55%, 55%)" opacity="0.6" />
      <polygon points="72,160 80,156 80,164" fill="hsl(195, 55%, 55%)" opacity="0.6" />
      <polygon points="248,160 240,156 240,164" fill="hsl(195, 55%, 55%)" opacity="0.6" />
    </svg>
    {/* 中心静态圆点 */}
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: 4,
        height: 4,
        borderRadius: '50%',
        background: 'hsl(195, 60%, 60%)',
        boxShadow: '0 0 12px hsl(195, 60%, 55%)'
      }}
    />
  </div>
)

/** 扫描进度条 */
const ScanBar = () => (
  <div
    style={{
      position: 'absolute',
      bottom: 24,
      left: 24,
      pointerEvents: 'none',
      fontFamily: HUD_FONT,
      fontSize: 10,
      color: HUD_CYAN_DIM,
      letterSpacing: '0.15em'
    }}
  >
    <div style={{ marginBottom: 4, opacity: 0.6 }}>SCAN.FREQ_42.7GHz</div>
    <div
      style={{
        width: 120,
        height: 2,
        background: 'hsla(195, 40%, 35%, 0.4)',
        borderRadius: 1,
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      <div
        style={{
          width: '30%',
          height: '100%',
          background: 'linear-gradient(90deg, transparent, hsla(195, 60%, 60%, 0.9), transparent)',
          animation: 'hud-scan 3s linear infinite'
        }}
      />
    </div>
  </div>
)

/** 旋转准星 */
const Reticle = () => (
  <div
    style={{
      position: 'absolute',
      bottom: 20,
      right: 24,
      pointerEvents: 'none',
      width: 40,
      height: 40
    }}
  >
    <svg viewBox="0 0 40 40" style={{ animation: 'hud-rotate 12s linear infinite', opacity: 0.4 }}>
      <circle
        cx="20"
        cy="20"
        r="16"
        fill="none"
        stroke="hsl(195, 55%, 55%)"
        strokeWidth="0.8"
        strokeDasharray="4 6"
      />
      <circle cx="20" cy="20" r="10" fill="none" stroke="hsl(195, 55%, 55%)" strokeWidth="0.5" />
      <line x1="20" y1="2" x2="20" y2="8" stroke="hsl(195, 55%, 55%)" strokeWidth="0.6" />
      <line x1="20" y1="32" x2="20" y2="38" stroke="hsl(195, 55%, 55%)" strokeWidth="0.6" />
      <line x1="2" y1="20" x2="8" y2="20" stroke="hsl(195, 55%, 55%)" strokeWidth="0.6" />
      <line x1="32" y1="20" x2="38" y2="20" stroke="hsl(195, 55%, 55%)" strokeWidth="0.6" />
    </svg>
  </div>
)

// ═══════════════════════════════════════════
// 机甲风 clip-path
// ═══════════════════════════════════════════
const CHAMFER = 12
const clipChamfer = `polygon(${CHAMFER}px 0, calc(100% - ${CHAMFER}px) 0, 100% ${CHAMFER}px, 100% calc(100% - ${CHAMFER}px), calc(100% - ${CHAMFER}px) 100%, ${CHAMFER}px 100%, 0 calc(100% - ${CHAMFER}px), 0 ${CHAMFER}px)`
const clipChamferSm = `polygon(8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px), 0 8px)`

// ═══════════════════════════════════════════
// 主组件
// ═══════════════════════════════════════════

export const WelcomeScreen = () => {
  const currentProject = useAppStore((state) => state.currentProject)
  const setProjectGalleryOpen = useAppStore((state) => state.setProjectGalleryOpen)

  const [isFadingOut, setIsFadingOut] = useState(false)
  const [isVisible, setIsVisible] = useState(() => !useAppStore.getState().currentProject)
  const [rippleActive, setRippleActive] = useState(false)
  const rippleRef = useRef(null)

  const particleActive = isVisible && !isFadingOut

  // 从 store hydration 获得了项目 → 淡出
  useEffect(() => {
    if (currentProject && isVisible && !isFadingOut) {
      setIsFadingOut(true)
      setTimeout(() => setIsVisible(false), 800)
    }
  }, [currentProject, isVisible, isFadingOut])

  // 返回首页
  useEffect(() => {
    if (!currentProject && !isVisible) {
      setIsVisible(true)
      setIsFadingOut(false)
    }
  }, [currentProject])

  if (!isVisible) return null

  // ═══ 水波纹入口 ═══
  const handleEnter = (e) => {
    // 触发水波纹
    setRippleActive(true)
    // 延迟后淡出 → 打开画廊
    setTimeout(() => {
      setIsFadingOut(true)
      setTimeout(() => {
        setProjectGalleryOpen(true)
        setIsVisible(false)
        setRippleActive(false)
      }, 800)
    }, 600)
  }

  // ═══════════════════════════════════════════
  // RENDER — 全部内容垂直居中
  // ═══════════════════════════════════════════

  return (
    <div
      className={`fixed inset-0 z-[100010] flex items-center justify-center transition-opacity duration-[1200ms] overflow-hidden ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'
      }`}
      style={{ background: '#080c14' }}
    >
      {/* 水波纹全屏 CSS */}
      <style>{`
        @keyframes hud-breathe { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
        @keyframes hud-rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes hud-scan { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
        @keyframes hud-border-glow {
          0%,100% { border-color: hsla(195, 50%, 45%, 0.35); box-shadow: 0 0 10px hsla(195, 60%, 55%, 0.1); }
          50% { border-color: hsla(195, 55%, 55%, 0.55); box-shadow: 0 0 20px hsla(195, 60%, 55%, 0.25); }
        }

        /* ═══ 科幻门户动画 ═══ */
        @keyframes portal-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes portal-spin-r { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
        @keyframes portal-core-pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.08); }
        }
        @keyframes portal-glow {
          0%, 100% { box-shadow: 0 0 30px hsla(195, 60%, 50%, 0.15), 0 0 60px hsla(195, 60%, 50%, 0.08), inset 0 0 40px hsla(195, 60%, 50%, 0.06); }
          50% { box-shadow: 0 0 50px hsla(195, 60%, 55%, 0.3), 0 0 100px hsla(195, 60%, 55%, 0.15), inset 0 0 60px hsla(195, 60%, 55%, 0.12); }
        }
        @keyframes portal-scan {
          0% { transform: translateY(100%); opacity: 0; }
          20% { opacity: 0.6; }
          80% { opacity: 0.6; }
          100% { transform: translateY(-100%); opacity: 0; }
        }
        @keyframes portal-particle-orbit {
          0% { transform: rotate(0deg) translateX(105px) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: rotate(360deg) translateX(105px) rotate(-360deg); opacity: 0; }
        }
        @keyframes portal-ripple-out {
          0% { transform: scale(0.5); opacity: 0.6; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes portal-warp {
          0% { transform: scale(1); filter: brightness(1); }
          40% { transform: scale(0.85); filter: brightness(1.8); }
          100% { transform: scale(3); filter: brightness(0); opacity: 0; }
        }
        .portal-container:hover .portal-ring-outer { animation-duration: 6s; }
        .portal-container:hover .portal-ring-inner { animation-duration: 4s; }
        .portal-container:hover .portal-core-glow { opacity: 0.85 !important; }
        .portal-container:hover .portal-text { text-shadow: 0 0 20px hsla(195, 70%, 65%, 0.6); }
        .portal-container.portal-warping { animation: portal-warp 1s ease-in forwards; }
      `}</style>

      {/* ===== Layer 0: 粒子背景 ===== */}
      <div className="absolute inset-0">
        <ParticleCanvas active={particleActive} />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 50% 50%, hsla(210, 40%, 18%, 0.4) 0%, transparent 70%)'
          }}
        />
      </div>

      {/* ===== Layer 1: HUD 装饰 ===== */}
      <CoordDisplay active={particleActive} />
      <SystemStatus />
      <ScanBar />
      <Reticle />
      <OrbitalRing />

      {/* 顶部六边形分隔线 */}
      <div
        className="absolute top-14 left-1/2 -translate-x-1/2 pointer-events-none"
        style={{ opacity: 0.2 }}
      >
        <svg width="200" height="12" viewBox="0 0 200 12">
          <line x1="0" y1="6" x2="70" y2="6" stroke="hsl(195,50%,55%)" strokeWidth="0.5" />
          <polygon
            points="80,0 90,6 80,12 70,6"
            fill="none"
            stroke="hsl(195,50%,55%)"
            strokeWidth="0.5"
          />
          <polygon
            points="120,0 110,6 120,12 130,6"
            fill="none"
            stroke="hsl(195,50%,55%)"
            strokeWidth="0.5"
          />
          <line x1="130" y1="6" x2="200" y2="6" stroke="hsl(195,50%,55%)" strokeWidth="0.5" />
        </svg>
      </div>

      {/* ===== 中央内容 ===== */}
      <div className="relative z-10 flex flex-col items-center">
        {/* 品牌标语 */}
        <div className="select-none mb-14">
          <h1
            className="text-4xl font-light tracking-[0.5em] mb-3 text-center"
            style={{
              fontFamily: "'Inter', 'Noto Sans SC', sans-serif",
              color: 'hsla(200, 50%, 88%, 0.95)',
              textShadow: '0 0 40px hsla(195, 60%, 55%, 0.35), 0 0 80px hsla(195, 60%, 55%, 0.15)'
            }}
          >
            星河智绘
          </h1>
          <p
            className="text-xs tracking-[0.6em] ml-[0.6em] text-center"
            style={{ color: 'hsla(195, 35%, 65%, 0.55)' }}
          >
            伏线千里，化念为形
          </p>
        </div>

        {/* ═══ 科幻门户入口 ═══ */}
        <div
          ref={rippleRef}
          className={`portal-container relative cursor-pointer select-none ${rippleActive ? 'portal-warping' : ''}`}
          style={{ width: 220, height: 220 }}
          onClick={handleEnter}
        >
          {/* 外环 — 顺时针旋转 (渐变虚线) */}
          <svg
            className="portal-ring-outer absolute inset-0"
            width="220"
            height="220"
            style={{ animation: 'portal-spin 12s linear infinite' }}
          >
            <defs>
              <linearGradient id="ring-grad-1" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="hsla(195, 70%, 65%, 0.7)" />
                <stop offset="50%" stopColor="hsla(210, 60%, 55%, 0.1)" />
                <stop offset="100%" stopColor="hsla(195, 70%, 65%, 0.7)" />
              </linearGradient>
            </defs>
            <circle
              cx="110"
              cy="110"
              r="105"
              fill="none"
              stroke="url(#ring-grad-1)"
              strokeWidth="1.5"
              strokeDasharray="8 16 4 12"
              opacity="0.7"
            />
            {/* 刻度标记 */}
            {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
              <line
                key={deg}
                x1="110"
                y1="8"
                x2="110"
                y2="14"
                stroke="hsla(195, 60%, 60%, 0.4)"
                strokeWidth="1"
                transform={`rotate(${deg} 110 110)`}
              />
            ))}
          </svg>

          {/* 中环 — 逆时针旋转 (渐变实线段) */}
          <svg
            className="portal-ring-inner absolute"
            width="220"
            height="220"
            style={{ inset: 0, animation: 'portal-spin-r 8s linear infinite' }}
          >
            <defs>
              <linearGradient id="ring-grad-2" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="hsla(180, 60%, 55%, 0)" />
                <stop offset="30%" stopColor="hsla(195, 65%, 60%, 0.6)" />
                <stop offset="70%" stopColor="hsla(210, 65%, 60%, 0.6)" />
                <stop offset="100%" stopColor="hsla(220, 60%, 55%, 0)" />
              </linearGradient>
            </defs>
            <circle
              cx="110"
              cy="110"
              r="88"
              fill="none"
              stroke="url(#ring-grad-2)"
              strokeWidth="1"
              strokeDasharray="40 80 20 60"
            />
          </svg>

          {/* 内部六边形框 */}
          <svg className="absolute" width="220" height="220" style={{ inset: 0 }}>
            <polygon
              points="110,40 155,67 155,123 110,150 65,123 65,67"
              fill="none"
              stroke="hsla(195, 55%, 55%, 0.2)"
              strokeWidth="1"
              strokeLinejoin="round"
            />
            <polygon
              points="110,52 147,73 147,117 110,138 73,117 73,73"
              fill="none"
              stroke="hsla(195, 55%, 55%, 0.1)"
              strokeWidth="0.6"
              strokeDasharray="4 6"
              strokeLinejoin="round"
            />
          </svg>

          {/* 核心辉光 */}
          <div
            className="portal-core-glow absolute"
            style={{
              inset: 40,
              borderRadius: '50%',
              background:
                'radial-gradient(circle at 50% 45%, hsla(195, 50%, 45%, 0.25) 0%, hsla(210, 40%, 20%, 0.15) 50%, transparent 75%)',
              animation: 'portal-core-pulse 3s ease-in-out infinite',
              transition: 'opacity 0.5s'
            }}
          />

          {/* 全息扫描线 */}
          <div className="absolute overflow-hidden" style={{ inset: 45, borderRadius: '50%' }}>
            <div
              style={{
                width: '100%',
                height: 2,
                background:
                  'linear-gradient(90deg, transparent 0%, hsla(195, 70%, 65%, 0.5) 30%, hsla(195, 70%, 65%, 0.5) 70%, transparent 100%)',
                animation: 'portal-scan 3s ease-in-out infinite',
                filter: 'blur(1px)'
              }}
            />
          </div>

          {/* 核心动画 glow 圈 */}
          <div
            className="absolute"
            style={{
              inset: 35,
              borderRadius: '50%',
              animation: 'portal-glow 4s ease-in-out infinite',
              border: '1px solid hsla(195, 55%, 55%, 0.15)'
            }}
          />

          {/* 中心内容 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10">
            {/* 图标 — 三层菱形 */}
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2L2 7l10 5 10-5-10-5z"
                stroke="hsla(195, 65%, 75%, 0.9)"
                strokeWidth="1.2"
              />
              <path d="M2 12l10 5 10-5" stroke="hsla(195, 55%, 65%, 0.6)" strokeWidth="1.2" />
              <path d="M2 17l10 5 10-5" stroke="hsla(195, 45%, 55%, 0.4)" strokeWidth="1.2" />
              {/* 核心光点 */}
              <circle cx="12" cy="8" r="1.5" fill="hsla(195, 70%, 75%, 0.6)">
                <animate attributeName="r" values="1.5;2.2;1.5" dur="2s" repeatCount="indefinite" />
                <animate
                  attributeName="opacity"
                  values="0.6;1;0.6"
                  dur="2s"
                  repeatCount="indefinite"
                />
              </circle>
            </svg>

            <span
              className="portal-text"
              style={{
                fontSize: 11,
                fontFamily: "'Inter', 'Noto Sans SC', sans-serif",
                fontWeight: 500,
                letterSpacing: '0.3em',
                color: 'hsla(195, 50%, 80%, 0.9)',
                textShadow: '0 0 12px hsla(195, 60%, 55%, 0.3)',
                transition: 'text-shadow 0.5s'
              }}
            >
              进入工作台
            </span>
          </div>

          {/* 轨道粒子 (6个) */}
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="absolute"
              style={{
                left: '50%',
                top: '50%',
                width: 4,
                height: 4,
                marginLeft: -2,
                marginTop: -2,
                animation: `portal-particle-orbit ${6 + i * 0.7}s linear infinite`,
                animationDelay: `${-i * 1.1}s`
              }}
            >
              <div
                style={{
                  width: 3 + (i % 2),
                  height: 3 + (i % 2),
                  borderRadius: '50%',
                  background: `hsla(${190 + i * 8}, 65%, 70%, ${0.5 + (i % 3) * 0.15})`,
                  boxShadow: `0 0 6px hsla(${190 + i * 8}, 65%, 65%, 0.4)`
                }}
              />
            </div>
          ))}

          {/* 点击时的涟漪扩散 */}
          {rippleActive && (
            <>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="absolute"
                  style={{
                    inset: 0,
                    borderRadius: '50%',
                    border: '1.5px solid hsla(195, 65%, 65%, 0.3)',
                    animation: `portal-ripple-out 0.8s ease-out ${i * 0.15}s forwards`,
                    pointerEvents: 'none'
                  }}
                />
              ))}
            </>
          )}
        </div>

        {/* 底部提示 */}
        <p
          className="mt-10 text-[10px] tracking-[0.3em]"
          style={{ color: 'hsla(195, 30%, 55%, 0.25)', fontFamily: "'Courier New', monospace" }}
        >
          [ CLICK TO ENTER WORKSPACE ]
        </p>
      </div>
    </div>
  )
}
