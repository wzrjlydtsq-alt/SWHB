import { useState, useEffect } from 'react'
import { X, Sparkles, ArrowRight } from 'lucide-react'

/* ── 全局注入的版本号 ── */
declare const __APP_VERSION__: string
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'

/* ── localStorage Key ── */
const DISMISSED_KEY = 'xinghe_update_dismissed_version'

/* ═══════════════════════════════════════════
 *  更新公告内容
 *  每次发版时在这里编辑 changelog 内容
 * ═══════════════════════════════════════════ */
interface ChangeItem {
  emoji: string
  title: string
  desc: string
}

const CHANGELOG: ChangeItem[] = [
  {
    emoji: '✨',
    title: '新增 Grok 模型支持',
    desc: '在生成面板中直接接入全新的 Grok 视频模型，提供不一样的创意火花与画面张力。'
  },
  {
    emoji: '🎙️',
    title: '豆包音视频链路打通',
    desc: '豆包模型的视频与音频模块现已全面支持本地素材上传、安全审核与结果下发使用，创作流更顺滑。'
  },
  {
    emoji: '🚀',
    title: '画布性能史诗级提升',
    desc: '引入全新的“视口虚拟化渲染剔除机制”，当画布中堆积上百个视频结果时依然能保持极限拖拽丝滑。'
  },
  {
    emoji: '💬',
    title: '重构全局错误翻译引擎',
    desc: '解决了带换行符的云端 JSON 错误无法翻译的问题，彻底告别看代码排错和令人抓狂的双重错误前缀。'
  },
  {
    emoji: '💾',
    title: '其他多项深度修复',
    desc: '打通了任务历史模型的精确命名；修复了视频“另存为”时默认存为图片的格式 Bug，以及底层监控的幽灵抛错。'
  }
]

/* ═══════════════════════════════════════════
 *  组件
 * ═══════════════════════════════════════════ */
export function UpdateAnnouncement() {
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISSED_KEY)
    if (dismissed !== APP_VERSION) {
      setVisible(true)
    }
  }, [])

  const handleDismiss = () => {
    setClosing(true)
    localStorage.setItem(DISMISSED_KEY, APP_VERSION)
    setTimeout(() => setVisible(false), 400)
  }

  if (!visible) return null

  return (
    <div
      className={`fixed inset-0 z-[100001] flex items-center justify-center transition-all duration-400 ${
        closing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
      }`}
      style={{ backdropFilter: 'blur(8px)', background: 'rgba(0,0,0,0.6)' }}
    >
      {/* 弹窗主体 */}
      <div
        className={`relative w-[480px] max-w-[90vw] max-h-[80vh] flex flex-col overflow-hidden transition-transform duration-400 ${
          closing ? 'translate-y-4' : 'translate-y-0'
        }`}
        style={{
          background:
            'linear-gradient(135deg, hsla(210, 25%, 12%, 0.98) 0%, hsla(220, 20%, 8%, 0.98) 100%)',
          border: '1px solid hsla(195, 50%, 45%, 0.3)',
          borderRadius: 16,
          boxShadow:
            '0 0 60px hsla(195, 60%, 50%, 0.15), 0 20px 80px rgba(0,0,0,0.5), inset 0 1px 0 hsla(195, 50%, 60%, 0.1)'
        }}
      >
        {/* ── 头部装饰线 ── */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: '10%',
            right: '10%',
            height: 1,
            background: 'linear-gradient(90deg, transparent, hsla(195, 60%, 55%, 0.5), transparent)'
          }}
        />

        {/* ── 头部 ── */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{
                background:
                  'linear-gradient(135deg, hsla(195, 60%, 50%, 0.25), hsla(210, 50%, 40%, 0.15))',
                border: '1px solid hsla(195, 55%, 55%, 0.25)'
              }}
            >
              <Sparkles size={18} style={{ color: 'hsla(195, 65%, 70%, 0.9)' }} />
            </div>
            <div>
              <h2
                className="text-base font-semibold tracking-wide"
                style={{
                  color: 'hsla(200, 50%, 92%, 0.95)',
                  textShadow: '0 0 20px hsla(195, 60%, 55%, 0.2)'
                }}
              >
                版本更新 · v{APP_VERSION}
              </h2>
              <p
                className="text-[11px] mt-0.5"
                style={{ color: 'hsla(195, 30%, 60%, 0.6)', letterSpacing: '0.05em' }}
              >
                星河智绘已升级到新版本
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="p-2 rounded-lg transition-all hover:scale-110 active:scale-95"
            style={{
              color: 'hsla(195, 30%, 60%, 0.5)',
              background: 'hsla(200, 20%, 20%, 0.4)'
            }}
            title="关闭公告"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── 分隔线 ── */}
        <div className="mx-6" style={{ height: 1, background: 'hsla(200, 20%, 30%, 0.3)' }} />

        {/* ── 更新内容列表 ── */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4 space-y-2.5">
          {CHANGELOG.map((item, i) => (
            <div
              key={i}
              className="group flex items-start gap-3 px-3.5 py-3 rounded-xl transition-all duration-200 cursor-default"
              style={{
                background: 'hsla(200, 15%, 15%, 0.35)',
                border: '1px solid hsla(200, 20%, 25%, 0.25)',
                animationDelay: `${i * 60}ms`
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'hsla(195, 20%, 18%, 0.5)'
                e.currentTarget.style.borderColor = 'hsla(195, 50%, 45%, 0.3)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'hsla(200, 15%, 15%, 0.35)'
                e.currentTarget.style.borderColor = 'hsla(200, 20%, 25%, 0.25)'
              }}
            >
              <span className="text-lg leading-none mt-0.5 select-none shrink-0">{item.emoji}</span>
              <div className="min-w-0">
                <div
                  className="text-[13px] font-medium mb-0.5"
                  style={{ color: 'hsla(200, 45%, 88%, 0.95)' }}
                >
                  {item.title}
                </div>
                <div
                  className="text-[11px] leading-relaxed"
                  style={{ color: 'hsla(200, 20%, 60%, 0.75)' }}
                >
                  {item.desc}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── 底部按钮 ── */}
        <div className="px-6 pb-5 pt-3">
          <button
            onClick={handleDismiss}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.98]"
            style={{
              background:
                'linear-gradient(135deg, hsla(195, 55%, 45%, 0.35) 0%, hsla(210, 50%, 40%, 0.25) 100%)',
              border: '1px solid hsla(195, 55%, 55%, 0.3)',
              color: 'hsla(195, 60%, 85%, 0.95)',
              textShadow: '0 0 10px hsla(195, 60%, 55%, 0.2)',
              boxShadow: '0 0 20px hsla(195, 60%, 50%, 0.1)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background =
                'linear-gradient(135deg, hsla(195, 55%, 50%, 0.5), hsla(210, 50%, 45%, 0.35))'
              e.currentTarget.style.boxShadow = '0 0 30px hsla(195, 60%, 50%, 0.2)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background =
                'linear-gradient(135deg, hsla(195, 55%, 45%, 0.35), hsla(210, 50%, 40%, 0.25))'
              e.currentTarget.style.boxShadow = '0 0 20px hsla(195, 60%, 50%, 0.1)'
            }}
          >
            <span>了解了，开始使用</span>
            <ArrowRight size={14} />
          </button>
          <div className="flex items-center justify-between mt-3 px-1">
            <a
              href="https://ncn03qlmvr4l.feishu.cn/wiki/WKFdwYIoxib1NRk4oPpcHVk5ndb"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] transition-colors hover:underline"
              style={{ color: 'hsla(195, 60%, 60%, 0.9)' }}
            >
              阅读完整使用教程与排错指南 ↗
            </a>
            <p
              className="text-[10px]"
              style={{ color: 'hsla(195, 20%, 50%, 0.4)', letterSpacing: '0.05em' }}
            >
              此公告仅在版本更新时显示一次
            </p>
          </div>
        </div>

        {/* ── 底部装饰线 ── */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: '15%',
            right: '15%',
            height: 1,
            background: 'linear-gradient(90deg, transparent, hsla(195, 60%, 55%, 0.2), transparent)'
          }}
        />
      </div>
    </div>
  )
}
