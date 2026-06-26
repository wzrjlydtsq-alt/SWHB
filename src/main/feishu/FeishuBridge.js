/**
 * 飞书 IPC 桥接
 * 连接 FeishuGateway（主进程）和渲染进程的 useChatManager
 */
import { ipcMain, BrowserWindow } from 'electron'
import { FeishuGateway } from './FeishuGateway.js'
import { getSetting, setSetting } from '../database.js'

const registerFeishuHandler = (channel, handler) => {
  try {
    ipcMain.removeHandler(channel)
  } catch (err) {
    console.warn(`[FeishuBridge] Failed to remove previous IPC handler for ${channel}:`, err.message)
  }
  ipcMain.handle(channel, handler)
}

export class FeishuBridge {
  constructor() {
    this.gateway = null
    this._pendingReplies = new Map() // messageId → resolve
    this.setupIpcHandlers()
  }

  setupIpcHandlers() {
    // ── 渲染进程调用：获取飞书配置 ──
    registerFeishuHandler('feishu:get-config', () => {
      return {
        enabled: getSetting('feishu_enabled') === 'true',
        appId: getSetting('feishu_app_id') || '',
        appSecret: getSetting('feishu_app_secret') || '',
        status: this.gateway?.getStatus() || 'disconnected',
        whitelist: getSetting('feishu_whitelist') || ''
      }
    })

    // ── 渲染进程调用：保存飞书配置 ──
    registerFeishuHandler('feishu:save-config', (_, config) => {
      try {
        setSetting('feishu_enabled', config.enabled ? 'true' : 'false')
        if (config.appId !== undefined) setSetting('feishu_app_id', config.appId)
        if (config.appSecret !== undefined) setSetting('feishu_app_secret', config.appSecret)
        if (config.whitelist !== undefined) setSetting('feishu_whitelist', config.whitelist)

        if (config.enabled) {
          this.start()
        } else {
          this.stop()
        }
        return { success: true }
      } catch (err) {
        console.error('[飞书Bridge] 保存配置失败:', err)
        return { success: false, error: err.message }
      }
    })

    // ── 渲染进程回传 AI 处理结果 ──
    registerFeishuHandler('feishu:reply-message', async (_, reply) => {
      console.warn(
        '[飞书Bridge] 收到渲染进程回复:',
        reply.text?.slice(0, 80) || reply.content?.slice(0, 80)
      )
      const { messageId, text, content, imagePath, card } = reply
      if (!this.gateway) {
        console.warn('[飞书Bridge] gateway 为空，无法发送回复')
        return { success: false }
      }

      try {
        // 通过 Gateway 发送回复
        await this.gateway.sendReply(messageId, {
          type: imagePath ? 'image' : card ? 'card' : 'text',
          content: text || content || '✅',
          imagePath,
          card
        })
        console.warn('[飞书Bridge] ✅ 回复已发送到飞书')
      } catch (err) {
        console.error('[飞书Bridge] ❌ 发送回复失败:', err.message)
      }

      // 解决 pending promise
      const resolver = this._pendingReplies.get(messageId)
      if (resolver) {
        resolver(null) // 已通过 gateway 直接回复，不需要 promise 返回值
        this._pendingReplies.delete(messageId)
      }

      return { success: true }
    })

    // ── 渲染进程调用：获取连接状态 ──
    registerFeishuHandler('feishu:get-status', () => ({
      status: this.gateway?.getStatus() || 'disconnected'
    }))

    // ── 渲染进程调用：测试连接 ──
    registerFeishuHandler('feishu:test-connection', async () => {
      try {
        if (this.gateway?.getStatus() === 'connected') {
          return { success: true, status: 'connected' }
        }
        await this.start()
        return { success: true, status: this.gateway?.getStatus() || 'unknown' }
      } catch (err) {
        return { success: false, error: err.message }
      }
    })

    // ── 渲染进程调用：断开连接 ──
    registerFeishuHandler('feishu:disconnect', () => {
      this.stop()
      return { success: true }
    })

    // ── 渲染进程调用：主动推送消息（无人值守汇报） ──
    registerFeishuHandler('feishu:push-message', async (_, { chatId, text }) => {
      if (!this.gateway) return { success: false, error: '飞书未连接' }
      try {
        await this.gateway.sendMessage(chatId, text)
        return { success: true }
      } catch (err) {
        return { success: false, error: err.message }
      }
    })

    // ── 渲染进程调用：获取最近聊天列表（用于选择推送目标） ──
    registerFeishuHandler('feishu:list-chats', async () => {
      if (!this.gateway?.client) return { success: false, items: [] }
      try {
        const res = await this.gateway.client.im.chat.list({ params: { page_size: 20 } })
        const items = (res?.data?.items || []).map((c) => ({
          chatId: c.chat_id,
          name: c.name || c.description || '未命名群组'
        }))
        return { success: true, items }
      } catch (err) {
        return { success: false, items: [], error: err.message }
      }
    })
  }

  /** 启动飞书网关 */
  start() {
    const appId = getSetting('feishu_app_id')
    const appSecret = getSetting('feishu_app_secret')
    if (!appId || !appSecret) {
      console.warn('[飞书Bridge] App ID 或 App Secret 未配置，跳过启动')
      return
    }

    // 如果已有连接，先停止
    if (this.gateway) {
      this.stop()
    }

    this.gateway = new FeishuGateway(appId, appSecret)
    const whitelistStr = getSetting('feishu_whitelist') || ''
    const whitelist = whitelistStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    this.gateway.onMessage(async (msg) => {
      // ── 白名单检查 ──
      if (whitelist.length > 0 && !whitelist.includes(msg.userId)) {
        console.log(`[飞书Bridge] 用户 ${msg.userId} 不在白名单中`)
        return { type: 'text', content: '⚠️ 你没有权限使用此机器人。请联系管理员添加白名单。' }
      }

      // ── 检查渲染进程是否在线 ──
      const win = BrowserWindow.getAllWindows()[0]
      if (!win || win.isDestroyed()) {
        return { type: 'text', content: '⚠️ 星河智绘桌面端未在线，请先打开应用后再发送指令。' }
      }

      // ── 转发给渲染进程处理 ──
      console.warn(`[飞书Bridge] 转发消息给渲染进程: ${msg.content.slice(0, 50)}`)

      return new Promise((resolve) => {
        // 存储 resolve，等渲染进程通过 feishu:reply-message 回传结果
        this._pendingReplies.set(msg.messageId, resolve)

        // 发送给渲染进程
        win.webContents.send('feishu:incoming-message', {
          messageId: msg.messageId,
          chatId: msg.chatId,
          userId: msg.userId,
          userName: msg.userName,
          content: msg.content,
          imageKeys: msg.imageKeys,
          messageType: msg.messageType
        })

        // 超时保护（90秒，因为生成可能需要一些时间）
        setTimeout(() => {
          if (this._pendingReplies.has(msg.messageId)) {
            this._pendingReplies.delete(msg.messageId)
            resolve({
              type: 'text',
              content: '⏳ 处理超时（90秒），可能是生成任务较长。请稍后查看桌面端结果。'
            })
          }
        }, 90000)
      })
    })

    this.gateway.start().catch((err) => {
      console.error('[飞书Bridge] 启动网关失败:', err)
    })

    console.log('[飞书Bridge] 网关启动流程已触发')
  }

  /** 停止 */
  stop() {
    if (this.gateway) {
      this.gateway.stop()
      this.gateway = null
    }
    // 清理所有 pending replies
    for (const [id, resolver] of this._pendingReplies) {
      resolver({ type: 'text', content: '⚠️ 飞书连接已断开' })
    }
    this._pendingReplies.clear()
    console.log('[飞书Bridge] 已停止')
  }
}
