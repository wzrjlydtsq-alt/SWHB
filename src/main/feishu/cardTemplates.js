/**
 * 飞书卡片消息模板
 * 用于生成结构化的飞书卡片回复
 */

/** 生成完成结果卡片 */
export function makeResultCard({ title, imageKey, prompt, model, ratio, duration, status }) {
  const elements = []

  // 图片预览
  if (imageKey) {
    elements.push({
      tag: 'img',
      img_key: imageKey,
      alt: { tag: 'plain_text', content: prompt || '生成结果' }
    })
  }

  // 参数信息
  const fields = [
    { is_short: true, text: { tag: 'lark_md', content: `**模型** ${model || '未知'}` } },
    { is_short: true, text: { tag: 'lark_md', content: `**比例** ${ratio || '未知'}` } }
  ]
  if (duration) {
    fields.push({ is_short: true, text: { tag: 'lark_md', content: `**时长** ${duration}` } })
  }
  if (status) {
    fields.push({ is_short: true, text: { tag: 'lark_md', content: `**状态** ${status}` } })
  }
  elements.push({ tag: 'div', fields })

  // 提示词摘要
  if (prompt) {
    elements.push({
      tag: 'note',
      elements: [
        {
          tag: 'plain_text',
          content: `💬 ${prompt.slice(0, 120)}${prompt.length > 120 ? '...' : ''}`
        }
      ]
    })
  }

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: title || '🎨 生成完成' },
      template: 'purple'
    },
    elements
  }
}

/** 状态查询卡片 */
export function makeStatusCard({ projectName, queueing, running, completed, failed }) {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '📊 任务状态' },
      template: 'blue'
    },
    elements: [
      {
        tag: 'div',
        fields: [
          {
            is_short: true,
            text: { tag: 'lark_md', content: `**项目** ${projectName || '未选择'}` }
          },
          { is_short: true, text: { tag: 'lark_md', content: `**排队中** ${queueing || 0}` } },
          { is_short: true, text: { tag: 'lark_md', content: `**生成中** ${running || 0}` } },
          { is_short: true, text: { tag: 'lark_md', content: `**已完成** ${completed || 0}` } },
          { is_short: true, text: { tag: 'lark_md', content: `**失败** ${failed || 0}` } }
        ]
      }
    ]
  }
}

/** 项目列表卡片 */
export function makeProjectListCard(projects) {
  const lines = (projects || []).map((p, i) => `${i + 1}. **${p.name || p.id}**`).join('\n')

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '📂 项目列表' },
      template: 'indigo'
    },
    elements: [
      {
        tag: 'div',
        text: { tag: 'lark_md', content: lines || '暂无项目' }
      },
      {
        tag: 'note',
        elements: [{ tag: 'plain_text', content: '💡 发送"切换到 [项目名]"可切换项目' }]
      }
    ]
  }
}

/** 错误提示卡片 */
export function makeErrorCard(message) {
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '⚠️ 操作提示' },
      template: 'red'
    },
    elements: [
      {
        tag: 'div',
        text: { tag: 'lark_md', content: message || '发生未知错误' }
      }
    ]
  }
}
