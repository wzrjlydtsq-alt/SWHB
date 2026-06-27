import { useEffect, useRef } from 'react'

/**
 * 监听主进程转发的飞书消息，注入到 ChatManager 处理
 *
 * 工作流程：
 * 1. 主进程收到飞书消息 → IPC 发来 feishu:incoming-message
 * 2. 本 Hook 收到 → 调用 sendChatMessage 处理（复用全部 60+ 工具）
 * 3. AI 处理完 → IPC 回传结果给主进程 → 主进程回复飞书
 */
export function useFeishuBridge({ sendChatMessage, isChatSending }: any) {
  const sendingRef = useRef(false)

  // 同步更新 ref，避免闭包问题
  useEffect(() => {
    sendingRef.current = isChatSending
  }, [isChatSending])

  useEffect(() => {
    if (!window.api?.on) return

    const cleanup = window.api.on('feishu:incoming-message', async (msg: any) => {
      console.warn('[飞书Bridge-R] 收到消息:', msg.content?.slice(0, 80))

      const { messageId, content } = msg

      // 如果正在处理消息，回复忙碌
      if (sendingRef.current) {
        console.warn('[飞书Bridge-R] 正忙，回复等待')
        try {
          await window.api.invoke('feishu:reply-message', {
            messageId,
            text: '⏳ 正在处理上一条消息，请稍等...'
          })
        } catch (e) {
          console.error('[飞书Bridge-R] 回复忙碌失败:', e)
        }
        return
      }

      try {
        console.warn('[飞书Bridge-R] 开始调用 sendChatMessage...')
        const result: any = await sendChatMessage(content, { source: 'feishu', autoFallback: true })
        console.warn('[飞书Bridge-R] sendChatMessage 返回:', JSON.stringify(result)?.slice(0, 200))

        // 拿到 AI 回复后发送给主进程
        const replyText =
          result?.assistantMessage ||
          result?.content ||
          (typeof result === 'string' ? result : null) ||
          '✅ 已执行'

        const replyPayload: any = {
          messageId,
          text: typeof replyText === 'string' ? replyText : '✅ 已执行'
        }

        // 如果有生成的图片路径，附带上
        if (result?.generatedImagePath) {
          replyPayload.imagePath = result.generatedImagePath
        }

        console.warn('[飞书Bridge-R] 发送回复:', replyPayload.text?.slice(0, 80))
        await window.api.invoke('feishu:reply-message', replyPayload)
        console.warn('[飞书Bridge-R] ✅ 回复已发送')
      } catch (err) {
        console.error('[飞书Bridge-R] 处理失败:', err)
        try {
          await window.api.invoke('feishu:reply-message', {
            messageId,
            text: `❌ 处理失败: ${err.message || '未知错误'}`
          })
        } catch (e2) {
          console.error('[飞书Bridge-R] 错误回复也失败:', e2)
        }
      }
    })

    return cleanup
  }, [sendChatMessage])
}
