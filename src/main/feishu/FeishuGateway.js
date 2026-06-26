/**
 * 飞书机器人网关
 * 使用 @larksuiteoapi/node-sdk 的 WebSocket 长连接模式收发消息
 */
import * as lark from '@larksuiteoapi/node-sdk'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

export class FeishuGateway {
  constructor(appId, appSecret) {
    this.appId = appId
    this.appSecret = appSecret
    this.client = null
    this.wsClient = null
    this.dispatcher = null
    this.status = 'disconnected' // disconnected | connecting | connected | error
    this.messageHandler = null
    this._rateLimitMap = new Map() // userId → lastTimestamp 防抖
  }

  /** 注册消息处理回调（必须在 start 前调用） */
  onMessage(handler) {
    this.messageHandler = handler
  }

  /** 启动 WebSocket 长连接 */
  async start() {
    if (!this.appId || !this.appSecret) {
      console.error('[飞书] App ID 或 App Secret 未配置')
      this.status = 'error'
      return
    }

    try {
      this.status = 'connecting'
      console.log('[飞书] 正在建立连接...')

      // 创建飞书 API 客户端
      this.client = new lark.Client({
        appId: this.appId,
        appSecret: this.appSecret,
        appType: lark.AppType.SelfBuild,
        domain: lark.Domain.Feishu // 中国版
      })

      // 创建事件分发器
      this.dispatcher = new lark.EventDispatcher({}).register({
        'im.message.receive_v1': async (data) => {
          try {
            await this._handleMessage(data)
          } catch (err) {
            console.error('[飞书] 消息处理异常:', err)
          }
        }
      })

      // 创建 WebSocket 长连接客户端（eventDispatcher 在 start 时传入）
      this.wsClient = new lark.WSClient({
        appId: this.appId,
        appSecret: this.appSecret,
        domain: lark.Domain.Feishu,
        loggerLevel: lark.LoggerLevel.info
      })

      await this.wsClient.start({ eventDispatcher: this.dispatcher })
      this.status = 'connected'
      console.log('[飞书] ✅ WebSocket 长连接已建立')
    } catch (err) {
      this.status = 'error'
      console.error('[飞书] ❌ 连接失败:', err.message || err)
      throw err
    }
  }

  /** 停止连接 */
  stop() {
    try {
      // WSClient 没有标准 stop 方法，设置标记即可
      this.wsClient = null
      this.dispatcher = null
      this.status = 'disconnected'
      console.log('[飞书] 连接已断开')
    } catch (err) {
      console.error('[飞书] 断开异常:', err)
    }
  }

  /** 获取连接状态 */
  getStatus() {
    return this.status
  }

  /** 处理收到的消息 */
  async _handleMessage(data) {
    // SDK EventDispatcher 回调数据结构：{ message, sender, ... }（无 event 层级）
    const msg = data?.message || data?.event?.message
    const sender = data?.sender || data?.event?.sender
    if (!msg || !sender) return

    const userId = sender.sender_id?.user_id || sender.sender_id?.open_id || 'unknown'

    // 防抖：同一用户 2 秒内只处理一条
    const now = Date.now()
    const lastTime = this._rateLimitMap.get(userId) || 0
    if (now - lastTime < 2000) {
      console.log(`[飞书] 防抖: 忽略来自 ${userId} 的频繁消息`)
      return
    }
    this._rateLimitMap.set(userId, now)

    // 解析消息内容
    const messageId = msg.message_id
    const chatId = msg.chat_id
    const messageType = msg.message_type // text / image / file ...

    let content = ''
    let imageKeys = []

    try {
      const body = JSON.parse(msg.content || '{}')
      if (messageType === 'text') {
        content = body.text || ''
      } else if (messageType === 'image') {
        imageKeys = [body.image_key]
        content = '[用户发送了一张图片]'
      } else {
        content = `[不支持的消息类型: ${messageType}]`
      }
    } catch {
      content = msg.content || ''
    }

    console.warn(`[飞书] 收到消息 from=${userId}: ${content.slice(0, 50)}`)

    // 构造标准消息对象
    const feishuMessage = {
      messageId,
      chatId,
      userId,
      userName: sender.sender_id?.open_id || userId,
      content,
      imageKeys,
      messageType
    }

    // 调用注册的处理器
    if (this.messageHandler) {
      const reply = await this.messageHandler(feishuMessage)
      if (reply) {
        await this.sendReply(messageId, reply)
      }
    }
  }

  /** 发送回复 */
  async sendReply(messageId, reply) {
    if (!this.client) return

    try {
      if (reply.type === 'image' && reply.imagePath) {
        await this._replyImage(messageId, reply.imagePath)
      } else if (reply.type === 'card' && reply.card) {
        await this._replyCard(messageId, reply.card)
      } else {
        await this._replyText(messageId, reply.content || reply.text || '✅')
      }
    } catch (err) {
      console.error('[飞书] 回复失败:', err.message || err)
      // 降级为文本回复
      try {
        await this._replyText(messageId, reply.content || reply.text || '✅ 已执行')
      } catch (e2) {
        console.error('[飞书] 降级文本回复也失败:', e2)
      }
    }
  }

  /** 主动发消息到指定 chat（用于无人值守推送） */
  async sendMessage(chatId, text) {
    if (!this.client || !chatId) return
    try {
      await this.client.im.message.create({
        data: {
          receive_id_type: 'chat_id',
          receive_id: chatId,
          content: JSON.stringify({ text }),
          msg_type: 'text'
        }
      })
      console.log('[飞书] ✅ 主动消息已发送')
    } catch (err) {
      console.error('[飞书] 主动发消息失败:', err.message)
    }
  }

  /** 回复文本 */
  async _replyText(messageId, text) {
    await this.client.im.message.reply({
      path: { message_id: messageId },
      data: {
        content: JSON.stringify({ text }),
        msg_type: 'text'
      }
    })
  }

  /** 回复图片 */
  async _replyImage(messageId, imagePath) {
    // 先上传图片获取 image_key
    const imageKey = await this._uploadImage(imagePath)
    if (!imageKey) {
      await this._replyText(messageId, '⚠️ 图片上传失败')
      return
    }
    await this.client.im.message.reply({
      path: { message_id: messageId },
      data: {
        content: JSON.stringify({ image_key: imageKey }),
        msg_type: 'image'
      }
    })
  }

  /** 回复卡片 */
  async _replyCard(messageId, card) {
    await this.client.im.message.reply({
      path: { message_id: messageId },
      data: {
        content: JSON.stringify(card),
        msg_type: 'interactive'
      }
    })
  }

  /** 上传图片到飞书获取 image_key */
  async _uploadImage(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        console.error('[飞书] 图片文件不存在:', filePath)
        return null
      }
      const res = await this.client.im.image.create({
        data: {
          image_type: 'message',
          image: fs.createReadStream(filePath)
        }
      })
      return res?.data?.image_key || null
    } catch (err) {
      console.error('[飞书] 上传图片失败:', err)
      return null
    }
  }
}
