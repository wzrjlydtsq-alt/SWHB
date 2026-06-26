/**
 * DAG Engine M1.5 增强测试
 * - 并行执行验证
 * - 断点续跑验证
 * - 层级分组验证
 */
import { describe, it, expect, vi } from 'vitest'
import { buildExecutionGraph, buildExecutionLayers } from '../graph'
import { WorkflowEngine, NODE_STATUS } from '../engine'

// ═══════ 辅助：创建模拟插件 ═══════
function createMockPlugin(delayMs = 50, shouldFail = false) {
  return {
    execute: vi.fn(async (inputs, ctx) => {
      await new Promise((r) => setTimeout(r, delayMs))
      if (shouldFail) throw new Error('Mock plugin failure')
      return { default_output: `result_${ctx.nodeId}` }
    })
  }
}

// ═══════ 辅助：创建测试工作流 ═══════

/**
 * 三个无依赖节点：A, B, C（全部可并行）
 * 预期层级：[[A, B, C]]
 */
function threeParallelWorkflow() {
  return {
    A: { class_type: 'test', inputs: { prompt: 'a' } },
    B: { class_type: 'test', inputs: { prompt: 'b' } },
    C: { class_type: 'test', inputs: { prompt: 'c' } }
  }
}

/**
 * 链式依赖：A → B → C → D → E
 * 预期层级：[[A], [B], [C], [D], [E]]
 */
function chainWorkflow() {
  return {
    A: { class_type: 'test', inputs: { prompt: 'a' } },
    B: { class_type: 'test', inputs: { src: ['A', 'default_output'] } },
    C: { class_type: 'test', inputs: { src: ['B', 'default_output'] } },
    D: { class_type: 'test', inputs: { src: ['C', 'default_output'] } },
    E: { class_type: 'test', inputs: { src: ['D', 'default_output'] } }
  }
}

/**
 * 钻石依赖：A→B, A→C, B→D, C→D
 * 预期层级：[[A], [B, C], [D]]
 */
function diamondWorkflow() {
  return {
    A: { class_type: 'test', inputs: { prompt: 'a' } },
    B: { class_type: 'test', inputs: { src: ['A', 'default_output'] } },
    C: { class_type: 'test', inputs: { src: ['A', 'default_output'] } },
    D: {
      class_type: 'test',
      inputs: { b: ['B', 'default_output'], c: ['C', 'default_output'] }
    }
  }
}

// ═══════════════════════════════════
//  graph.ts 测试
// ═══════════════════════════════════

describe('buildExecutionLayers', () => {
  it('三个无依赖节点应分在同一层', () => {
    const { layers } = buildExecutionLayers(threeParallelWorkflow())
    expect(layers).toHaveLength(1)
    expect(layers[0].sort()).toEqual(['A', 'B', 'C'])
  })

  it('链式依赖应各占一层', () => {
    const { layers } = buildExecutionLayers(chainWorkflow())
    expect(layers).toHaveLength(5)
    expect(layers[0]).toEqual(['A'])
    expect(layers[1]).toEqual(['B'])
    expect(layers[2]).toEqual(['C'])
    expect(layers[3]).toEqual(['D'])
    expect(layers[4]).toEqual(['E'])
  })

  it('钻石依赖应分三层', () => {
    const { layers } = buildExecutionLayers(diamondWorkflow())
    expect(layers).toHaveLength(3)
    expect(layers[0]).toEqual(['A'])
    expect(layers[1].sort()).toEqual(['B', 'C'])
    expect(layers[2]).toEqual(['D'])
  })

  it('兼容性：buildExecutionGraph 仍返回线性顺序', () => {
    const { executionOrder } = buildExecutionGraph(diamondWorkflow())
    expect(executionOrder).toHaveLength(4)
    // A 一定在 B、C 前面，D 一定在最后
    expect(executionOrder.indexOf('A')).toBeLessThan(executionOrder.indexOf('B'))
    expect(executionOrder.indexOf('A')).toBeLessThan(executionOrder.indexOf('C'))
    expect(executionOrder.indexOf('D')).toBe(3)
  })
})

// ═══════════════════════════════════
//  engine.ts 并行执行测试
// ═══════════════════════════════════

describe('WorkflowEngine 并行执行', () => {
  it('三个无依赖节点应并发执行，耗时接近单个', async () => {
    const engine = new WorkflowEngine()
    const plugin = createMockPlugin(100) // 每个 100ms
    engine.registerPlugin('test', plugin)

    const start = Date.now()
    await engine.executeWorkflow(threeParallelWorkflow())
    const elapsed = Date.now() - start

    // 并行应 ~100ms，串行应 ~300ms；设 200ms 阈值判断
    expect(elapsed).toBeLessThan(250)
    expect(engine.status).toBe('completed')
    expect(plugin.execute).toHaveBeenCalledTimes(3)
  })

  it('链式依赖应串行执行', async () => {
    const engine = new WorkflowEngine()
    const plugin = createMockPlugin(30)
    engine.registerPlugin('test', plugin)

    await engine.executeWorkflow(chainWorkflow())

    expect(engine.status).toBe('completed')
    expect(plugin.execute).toHaveBeenCalledTimes(5)
    // B 应能拿到 A 的输出
    const callArgs = plugin.execute.mock.calls
    // 第二次调用（B）的 inputs 应包含来自 A 的数据
    expect(callArgs[1][0].src).toBeDefined()
  })

  it('所有节点状态最终为 completed', async () => {
    const engine = new WorkflowEngine()
    engine.registerPlugin('test', createMockPlugin(10))

    await engine.executeWorkflow(diamondWorkflow())

    const statuses = engine.getNodeStatuses()
    for (const [, status] of statuses) {
      expect(status).toBe(NODE_STATUS.COMPLETED)
    }
  })
})

// ═══════════════════════════════════
//  engine.ts 断点续跑测试
// ═══════════════════════════════════

describe('WorkflowEngine 断点续跑', () => {
  it('中间节点失败时下游应被 skip', async () => {
    const engine = new WorkflowEngine()
    const okPlugin = createMockPlugin(10, false)
    const failPlugin = createMockPlugin(10, true)

    // A 成功, C-fail 失败, B 成功, D/E 依赖 C 应被 skip
    const workflow = {
      A: { class_type: 'ok', inputs: { prompt: 'a' } },
      B: { class_type: 'ok', inputs: { prompt: 'b' } },
      C: { class_type: 'fail', inputs: { src: ['A', 'default_output'] } },
      D: { class_type: 'ok', inputs: { src: ['C', 'default_output'] } },
      E: { class_type: 'ok', inputs: { src: ['D', 'default_output'] } }
    }

    engine.registerPlugin('ok', okPlugin)
    engine.registerPlugin('fail', failPlugin)

    await engine.executeWorkflow(workflow)

    expect(engine.status).toBe('partial')

    const statuses = engine.getNodeStatuses()
    expect(statuses.get('A')).toBe(NODE_STATUS.COMPLETED)
    expect(statuses.get('B')).toBe(NODE_STATUS.COMPLETED)
    expect(statuses.get('C')).toBe(NODE_STATUS.FAILED)
    expect(statuses.get('D')).toBe(NODE_STATUS.SKIPPED)
    expect(statuses.get('E')).toBe(NODE_STATUS.SKIPPED)

    const failed = engine.getFailedNodes()
    expect(failed).toHaveLength(1)
    expect(failed[0].nodeId).toBe('C')
  })

  it('resumeWorkflow 应只重跑失败和 skipped 节点', async () => {
    const engine = new WorkflowEngine()
    let callCount = 0
    const okPlugin = {
      execute: vi.fn(async (inputs, ctx) => {
        return { default_output: `ok_${ctx.nodeId}` }
      })
    }
    // 第一次失败，第二次（resume 时）成功
    const sometimesFailPlugin = {
      execute: vi.fn(async (inputs, ctx) => {
        callCount++
        if (callCount === 1) throw new Error('First attempt fails')
        return { default_output: `recovered_${ctx.nodeId}` }
      })
    }

    const workflow = {
      A: { class_type: 'ok', inputs: { prompt: 'a' } },
      C: { class_type: 'sometimes', inputs: { src: ['A', 'default_output'] } },
      D: { class_type: 'ok', inputs: { src: ['C', 'default_output'] } }
    }

    engine.registerPlugin('ok', okPlugin)
    engine.registerPlugin('sometimes', sometimesFailPlugin)

    // 第一次执行：C 失败，D 被 skip
    await engine.executeWorkflow(workflow)
    expect(engine.status).toBe('partial')
    expect(engine.getNodeStatuses().get('C')).toBe(NODE_STATUS.FAILED)
    expect(engine.getNodeStatuses().get('D')).toBe(NODE_STATUS.SKIPPED)

    // A 的 execute 应该被调用 1 次
    const aCallsBefore = okPlugin.execute.mock.calls.filter(
      (c) => c[1].nodeId === 'A'
    ).length
    expect(aCallsBefore).toBe(1)

    // 断点续跑
    await engine.resumeWorkflow()

    expect(engine.status).toBe('completed')

    // A 不应被重新执行（已 completed）
    const aCallsAfter = okPlugin.execute.mock.calls.filter(
      (c) => c[1].nodeId === 'A'
    ).length
    expect(aCallsAfter).toBe(1) // 没有增加

    // C 和 D 应该执行成功
    expect(engine.getNodeStatuses().get('C')).toBe(NODE_STATUS.COMPLETED)
    expect(engine.getNodeStatuses().get('D')).toBe(NODE_STATUS.COMPLETED)
  })

  it('无失败节点时 resumeWorkflow 应静默返回', async () => {
    const engine = new WorkflowEngine()
    engine.registerPlugin('test', createMockPlugin(5))

    await engine.executeWorkflow(threeParallelWorkflow())
    expect(engine.status).toBe('completed')

    await engine.resumeWorkflow()
    expect(engine.status).toBe('completed')
  })

  it('无 workflow 时 resumeWorkflow 应抛错', async () => {
    const engine = new WorkflowEngine()
    await expect(engine.resumeWorkflow()).rejects.toThrow('No workflow to resume')
  })

  it('多分支同时失败，各自的下游都应 skip', async () => {
    const engine = new WorkflowEngine()
    const workflow = {
      A: { class_type: 'fail', inputs: { prompt: 'a' } },
      B: { class_type: 'fail', inputs: { prompt: 'b' } },
      C: { class_type: 'ok', inputs: { src: ['A', 'default_output'] } },
      D: { class_type: 'ok', inputs: { src: ['B', 'default_output'] } },
      E: {
        class_type: 'ok',
        inputs: { c: ['C', 'default_output'], d: ['D', 'default_output'] }
      }
    }

    engine.registerPlugin('ok', createMockPlugin(5))
    engine.registerPlugin('fail', createMockPlugin(5, true))

    await engine.executeWorkflow(workflow)

    expect(engine.status).toBe('partial')
    const statuses = engine.getNodeStatuses()
    expect(statuses.get('A')).toBe(NODE_STATUS.FAILED)
    expect(statuses.get('B')).toBe(NODE_STATUS.FAILED)
    expect(statuses.get('C')).toBe(NODE_STATUS.SKIPPED)
    expect(statuses.get('D')).toBe(NODE_STATUS.SKIPPED)
    expect(statuses.get('E')).toBe(NODE_STATUS.SKIPPED)
    expect(engine.getFailedNodes()).toHaveLength(2)
  })

  it('已完成节点的输出在 resume 后仍可用', async () => {
    const engine = new WorkflowEngine()
    let failOnce = true
    const conditionalPlugin = {
      execute: vi.fn(async (_inputs, ctx) => {
        if (ctx.nodeId === 'B' && failOnce) {
          failOnce = false
          throw new Error('Temporary failure')
        }
        return { default_output: `val_${ctx.nodeId}` }
      })
    }

    const workflow = {
      A: { class_type: 'cond', inputs: { prompt: 'a' } },
      B: { class_type: 'cond', inputs: { src: ['A', 'default_output'] } }
    }

    engine.registerPlugin('cond', conditionalPlugin)

    await engine.executeWorkflow(workflow)
    expect(engine.nodeOutputs.get('A')).toEqual({ default_output: 'val_A' })

    await engine.resumeWorkflow()
    expect(engine.nodeOutputs.get('A')).toEqual({ default_output: 'val_A' })
    expect(engine.nodeOutputs.get('B')).toEqual({ default_output: 'val_B' })
    expect(engine.status).toBe('completed')
  })
})

// ═══════════════════════════════════
//  边界场景测试
// ═══════════════════════════════════

describe('WorkflowEngine 边界场景', () => {
  it('空工作流应直接 completed', async () => {
    const engine = new WorkflowEngine()
    await engine.executeWorkflow({})
    expect(engine.status).toBe('completed')
  })

  it('单节点工作流应正常执行', async () => {
    const engine = new WorkflowEngine()
    engine.registerPlugin('test', createMockPlugin(5))

    await engine.executeWorkflow({
      solo: { class_type: 'test', inputs: { prompt: 'only one' } }
    })

    expect(engine.status).toBe('completed')
    expect(engine.nodeOutputs.has('solo')).toBe(true)
  })

  it('无 class_type 的节点应被跳过', async () => {
    const engine = new WorkflowEngine()
    engine.registerPlugin('test', createMockPlugin(5))

    await engine.executeWorkflow({
      A: { class_type: 'test', inputs: { prompt: 'a' } },
      B: { inputs: { prompt: 'no class type' } },
      C: { class_type: 'test', inputs: { prompt: 'c' } }
    })

    expect(engine.status).toBe('completed')
  })

  it('循环依赖应抛出异常', () => {
    expect(() => {
      buildExecutionLayers({
        A: { class_type: 'test', inputs: { src: ['B', 'out'] } },
        B: { class_type: 'test', inputs: { src: ['A', 'out'] } }
      })
    }).toThrow(/cyclical/i)
  })

  it('未注册的插件应导致节点 failed', async () => {
    const engine = new WorkflowEngine()

    await engine.executeWorkflow({
      A: { class_type: 'nonexistent', inputs: { prompt: 'a' } }
    })

    expect(engine.status).toBe('partial')
    expect(engine.getNodeStatuses().get('A')).toBe(NODE_STATUS.FAILED)
    expect(engine.getFailedNodes()[0].error.message).toContain('nonexistent')
  })

  it('重复执行时应重置状态', async () => {
    const engine = new WorkflowEngine()
    engine.registerPlugin('test', createMockPlugin(5))

    await engine.executeWorkflow(threeParallelWorkflow())
    expect(engine.nodeOutputs.size).toBe(3)

    await engine.executeWorkflow({ X: { class_type: 'test', inputs: { p: '1' } } })
    expect(engine.nodeOutputs.size).toBe(1)
    expect(engine.nodeOutputs.has('A')).toBe(false)
  })

  it('并发执行时应拒绝', async () => {
    const engine = new WorkflowEngine()
    engine.registerPlugin('test', createMockPlugin(200))

    const p1 = engine.executeWorkflow(threeParallelWorkflow())
    await expect(engine.executeWorkflow(threeParallelWorkflow())).rejects.toThrow('already running')
    await p1
  })

  it('abort 应中断后续层执行', async () => {
    const engine = new WorkflowEngine()
    engine.registerPlugin('test', createMockPlugin(50))

    engine.on('node:completed', ({ nodeId }: any) => {
      if (nodeId === 'A') engine.abortWorkflow()
    })

    await expect(engine.executeWorkflow(chainWorkflow())).rejects.toThrow('aborted')
    expect(engine.status).toBe('aborted')
  })

  it('事件触发顺序应正确', async () => {
    const engine = new WorkflowEngine()
    engine.registerPlugin('test', createMockPlugin(5))
    const events: string[] = []

    engine.on('workflow:start', () => {
      events.push('workflow:start')
    })
    engine.on('workflow:scheduled', () => {
      events.push('workflow:scheduled')
    })
    engine.on('node:start', ({ nodeId }: any) => {
      events.push(`node:start:${nodeId}`)
    })
    engine.on('node:completed', ({ nodeId }: any) => {
      events.push(`node:completed:${nodeId}`)
    })
    engine.on('workflow:completed', () => {
      events.push('workflow:completed')
    })

    await engine.executeWorkflow({
      X: { class_type: 'test', inputs: { prompt: 'x' } }
    })

    expect(events).toEqual([
      'workflow:start',
      'workflow:scheduled',
      'node:start:X',
      'node:completed:X',
      'workflow:completed'
    ])
  })
})

// ═══════════════════════════════════
//  graph.ts 边界测试
// ═══════════════════════════════════

describe('buildExecutionLayers 边界', () => {
  it('空对象应返回空层级', () => {
    const { layers } = buildExecutionLayers({})
    expect(layers).toEqual([])
  })

  it('W 型拓扑应正确分层', () => {
    const { layers } = buildExecutionLayers({
      A: { class_type: 't', inputs: {} },
      B: { class_type: 't', inputs: {} },
      C: { class_type: 't', inputs: {} },
      D: { class_type: 't', inputs: { a: ['A', 'o'], b: ['B', 'o'] } },
      E: { class_type: 't', inputs: { b: ['B', 'o'], c: ['C', 'o'] } },
      F: { class_type: 't', inputs: { d: ['D', 'o'], e: ['E', 'o'] } }
    })

    expect(layers).toHaveLength(3)
    expect(layers[0].sort()).toEqual(['A', 'B', 'C'])
    expect(layers[1].sort()).toEqual(['D', 'E'])
    expect(layers[2]).toEqual(['F'])
  })

  it('引用不存在的上游节点应被忽略', () => {
    const { layers } = buildExecutionLayers({
      A: { class_type: 't', inputs: { ghost: ['NONEXISTENT', 'out'] } },
      B: { class_type: 't', inputs: {} }
    })
    expect(layers).toHaveLength(1)
    expect(layers[0].sort()).toEqual(['A', 'B'])
  })
})
