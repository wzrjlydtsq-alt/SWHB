/**
 * 标准插件基类定义
 * 所有未来的工具（生图、生视频、大模型对话等）都必须继承或实现类似结构
 */

export class BasePlugin {
  constructor(id, name) {
    this.id = id
    this.name = name
  }

  /**
   * 引擎调用的统一执行入口。
   * 入参 inputs 将由引擎从上游输出（或静态参数）中动态装配注入。
   * 必须返回一个对象，作为后续下游节点的输入源。
   *
   * @param {Object} inputs - 输入参数对象字典
   * @param {Object} context - 运行期上下文 (nodeId, signal 等等)
   * @returns {Promise<Object>} 输出字典
   */
  // eslint-disable-next-line no-unused-vars
  async execute(inputs, context) {
    throw new Error('Plugin must implement execute(inputs, context)')
  }
}
