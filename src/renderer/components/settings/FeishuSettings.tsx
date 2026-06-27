import { useState, useEffect, useCallback } from 'react'

/**
 * 飞书机器人集成设置面板
 */
export function FeishuSettings() {
  const [config, setConfig] = useState({
    enabled: false,
    appId: '',
    appSecret: '',
    whitelist: '',
    status: 'disconnected'
  })
  const [showSecret, setShowSecret] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)

  // 加载配置
  useEffect(() => {
    window.api
      ?.invoke('feishu:get-config')
      .then((cfg) => {
        if (cfg) setConfig(cfg)
      })
      .catch(() => {})
  }, [])

  // 定时刷新状态
  useEffect(() => {
    const timer = setInterval(() => {
      window.api
        ?.invoke('feishu:get-status')
        .then((res) => {
          if (res) setConfig((prev) => ({ ...prev, status: res.status }))
        })
        .catch(() => {})
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await window.api?.invoke('feishu:save-config', config)
    } catch (e) {
      console.error('保存飞书配置失败:', e)
    }
    setSaving(false)
  }, [config])

  const handleTest = useCallback(async () => {
    setTesting(true)
    try {
      const res = await window.api?.invoke('feishu:test-connection')
      if (res?.success) {
        setConfig((prev) => ({ ...prev, status: res.status || 'connected' }))
      } else {
        alert(`连接失败: ${res?.error || '未知错误'}`)
      }
    } catch (e) {
      alert(`连接失败: ${e.message}`)
    }
    setTesting(false)
  }, [])

  const handleDisconnect = useCallback(async () => {
    await window.api?.invoke('feishu:disconnect')
    setConfig((prev) => ({ ...prev, status: 'disconnected', enabled: false }))
    await window.api?.invoke('feishu:save-config', { ...config, enabled: false })
  }, [config])

  const statusColors = {
    connected: {
      bg: 'bg-[var(--bg-secondary)] border border-[var(--border-color)]',
      text: 'text-[var(--text-secondary)]',
      label: '🟢 已连接'
    },
    connecting: {
      bg: 'bg-[var(--bg-secondary)] border border-[var(--border-color)]',
      text: 'text-[var(--text-secondary)]',
      label: '🟡 连接中'
    },
    disconnected: {
      bg: 'bg-[var(--bg-secondary)] border border-[var(--border-color)]',
      text: 'text-[var(--text-secondary)]',
      label: '🔴 未连接'
    },
    error: {
      bg: 'bg-[var(--bg-secondary)] border border-[var(--border-color)]',
      text: 'text-[var(--text-secondary)]',
      label: '❌ 连接错误'
    }
  }
  const st = statusColors[config.status] || statusColors.disconnected

  return (
    <div className="space-y-4">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <span className="text-sm font-semibold text-[var(--text-primary)]">飞书机器人集成</span>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>
          {st.label}
        </span>
      </div>

      {/* 启用开关 */}
      <label className="flex items-center justify-between cursor-pointer group">
        <span className="text-xs text-[var(--text-secondary)]">启用飞书机器人</span>
        <div
          className={`w-10 h-5 rounded-full transition-colors relative border ${config.enabled ? 'bg-[var(--bg-elevated)] border-[var(--border-strong)]' : 'bg-[var(--bg-input)] border-[var(--border-color)]'}`}
          onClick={() => {
            const newVal = !config.enabled
            setConfig((prev) => ({ ...prev, enabled: newVal }))
          }}
        >
          <div
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-[var(--text-primary)] shadow-none transition-transform ${config.enabled ? 'translate-x-5' : 'translate-x-0.5'}`}
          />
        </div>
      </label>

      {/* App ID */}
      <div>
        <label className="text-[10px] text-[var(--text-secondary)] block mb-1">App ID</label>
        <input
          type="text"
          value={config.appId}
          onChange={(e) => setConfig((prev) => ({ ...prev, appId: e.target.value }))}
          placeholder="cli_xxxxxxxxxx"
          className="w-full h-8 px-3 text-xs rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--border-strong)] focus:outline-none"
        />
      </div>

      {/* App Secret */}
      <div>
        <label className="text-[10px] text-[var(--text-secondary)] block mb-1">App Secret</label>
        <div className="relative">
          <input
            type={showSecret ? 'text' : 'password'}
            value={config.appSecret}
            onChange={(e) => setConfig((prev) => ({ ...prev, appSecret: e.target.value }))}
            placeholder="xxxxxxxxxxxxxxxx"
            className="w-full h-8 px-3 pr-8 text-xs rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--border-strong)] focus:outline-none"
          />
          <button
            onClick={() => setShowSecret(!showSecret)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs"
          >
            {showSecret ? '🙈' : '👁️'}
          </button>
        </div>
      </div>

      {/* 白名单 */}
      <div>
        <label className="text-[10px] text-[var(--text-secondary)] block mb-1">
          用户白名单{' '}
          <span className="text-[var(--text-muted)]">（飞书 userId，逗号分隔，留空不限制）</span>
        </label>
        <input
          type="text"
          value={config.whitelist}
          onChange={(e) => setConfig((prev) => ({ ...prev, whitelist: e.target.value }))}
          placeholder="留空则所有用户可用"
          className="w-full h-8 px-3 text-xs rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--border-strong)] focus:outline-none"
        />
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 h-8 rounded-lg text-xs font-medium bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-strong)] transition-colors disabled:opacity-50"
        >
          {saving ? '保存中...' : '💾 保存配置'}
        </button>
        {config.status === 'connected' ? (
          <button
            onClick={handleDisconnect}
            className="h-8 px-4 rounded-lg text-xs font-medium bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-color)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            断开
          </button>
        ) : (
          <button
            onClick={handleTest}
            disabled={testing || !config.appId || !config.appSecret}
            className="h-8 px-4 rounded-lg text-xs font-medium bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-color)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
          >
            {testing ? '连接中...' : '测试连接'}
          </button>
        )}
      </div>

      {/* 配置教程 */}
      <div>
        <button
          onClick={() => setShowTutorial(!showTutorial)}
          className="text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1"
        >
          📖 {showTutorial ? '收起' : '查看'}配置教程
        </button>

        {showTutorial && (
          <div className="mt-2 p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[10px] text-[var(--text-secondary)] space-y-1.5">
            <div>
              1. 访问{' '}
              <a
                href="https://open.feishu.cn"
                target="_blank"
                className="text-[var(--text-primary)] underline"
              >
                open.feishu.cn
              </a>{' '}
              → 创建「企业自建应用」
            </div>
            <div>2. 应用详情 → 添加能力 → 选择「机器人」</div>
            <div>
              3. 权限管理 → 开通{' '}
              <code className="bg-[var(--bg-input)] px-1 rounded">im:message</code> 等权限
            </div>
            <div>
              4. 事件订阅 → 选择「<strong>长连接 WebSocket</strong>」模式
            </div>
            <div>
              5. 订阅事件{' '}
              <code className="bg-[var(--bg-input)] px-1 rounded">im.message.receive_v1</code>
            </div>
            <div>6. 凭证页面 → 复制 App ID 和 App Secret 填入上方</div>
            <div>7. 版本管理 → 创建版本并发布</div>
            <div>8. 回到这里 → 开启开关 → 测试连接</div>
            <div className="pt-1 text-[var(--text-muted)]">
              💡 使用 WebSocket 模式无需公网服务器，本地电脑直连飞书。
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
