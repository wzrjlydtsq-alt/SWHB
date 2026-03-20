import { BasePlugin } from '../plugin_base.js'
import { apiClient } from '../../../services/apiClient.js'

export class LLMTextPlugin extends BasePlugin {
  constructor() {
    super('LLMTextPlugin', '通用大模型文本生成')

    // 强制指明输入端口的类型以支持将来 UI 的反向绘制
    this.inputs = {
      prompt: { type: 'string', required: true, description: 'User input prompt' },
      system_prompt: {
        type: 'string',
        required: false,
        description: 'System behavior instructions'
      },
      api_key: { type: 'string', required: false },
      api_url: { type: 'string', required: false },
      model_id: { type: 'string', default: 'gpt-3.5-turbo' }
    }

    // 强制指名此节点会输出什么数据类型的管脚
    this.outputs = {
      text: { type: 'string' }
    }
  }

  async execute(inputs, ctx) {
    const {
      prompt,
      system_prompt = 'You are a helpful assistant.',
      api_key,
      api_url,
      model_id = 'gpt-3.5-turbo'
    } = inputs

    if (!prompt) {
      throw new Error(`[LLMTextPlugin] Missing required input: prompt`)
    }

    // 这里通过引擎上下文提供给插件去触发 UI 变动的事件 (比如进度条)
    ctx.engine.emit('node:progress', {
      nodeId: ctx.nodeId,
      progress: 10,
      message: '请求大模型中...'
    })

    try {
      const messages = [
        { role: 'system', content: system_prompt },
        { role: 'user', content: prompt }
      ]

      const payload = {
        model: model_id,
        messages,
        temperature: 0.7
      }

      // 如果提供了 signal，可以带进去取消请求 (取决于 apiClient 怎么实现)
      const data = await apiClient(
        '/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        },
        {
          baseUrl: api_url,
          apiKey: api_key
        }
      )

      const generatedText =
        data?.choices?.[0]?.message?.content || data?.data?.choices?.[0]?.message?.content || ''
      if (!generatedText) {
        throw new Error('LLM API returned an empty response.')
      }

      ctx.engine.emit('node:progress', { nodeId: ctx.nodeId, progress: 100, message: '生成完毕' })

      // 返回与 this.outputs 定义格式对应的值字典
      return { text: generatedText.trim() }
    } catch (err) {
      console.error(`[LLMTextPlugin] Error generating text:`, err)
      throw err
    }
  }
}
