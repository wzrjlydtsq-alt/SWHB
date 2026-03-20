/**
 * workflowService.js
 * 提供工作流導入、導出和 URL 轉換功能。
 */

import { apiClient } from './apiClient.js'

/**
 * 导入工作流
 */
export const importWorkflow = async ({
  setNodes,
  setConnections,
  setSelectedNodeIds,
  screenToWorld,
  canvasRef,
  localCacheServerUrl = 'http://localhost:9527'
}) => {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) {
        resolve(null)
        return
      }

      try {
        const text = await file.text()
        const data = JSON.parse(text)

        if (data.type !== 'workflow') {
          alert('这不是一个有效的工作流文件。\n\n请使用“保存当前选取工作流”功能导出的文件。')
          resolve(null)
          return
        }

        if (!data.nodes || data.nodes.length === 0) {
          alert('工作流文件中没有节点数据')
          resolve(null)
          return
        }

        // 尝试获取本地库文件列表
        let localFiles = []
        try {
          const localFilesData = await apiClient(
            '/list-files',
            {},
            { baseUrl: localCacheServerUrl }
          )
          if (localFilesData && localFilesData.success && localFilesData.files) {
            localFiles = localFilesData.files
          }
        } catch (err) {
          console.error('Workflow fetch error:', err)
          console.log('[导入工作流] 本地服务器未连接')
        }

        const findLocalFileBySize = (dataUrl) => {
          if (!localFiles.length) return null
          try {
            const base64 = dataUrl.split(',')[1]
            if (!base64) return null
            const estimatedSize = Math.floor(base64.length * 0.75)
            const tolerance = estimatedSize * 0.05
            const match = localFiles.find((f) => Math.abs(f.size - estimatedSize) < tolerance)
            return match
              ? `${localCacheServerUrl}/file/${encodeURIComponent(match.rel_path)}`
              : null
          } catch (err) {
            console.error('Local fetch error:', err)
          }
          return null
        }

        const convertNodeUrls = async (node) => {
          const stack = [node]
          while (stack.length > 0) {
            const current = stack.pop()
            if (!current || typeof current !== 'object') continue
            for (const key in current) {
              const val = current[key]
              if (
                typeof val === 'string' &&
                (val.startsWith('data:image/') || val.startsWith('data:video/'))
              ) {
                try {
                  const localUrl = findLocalFileBySize(val)
                  if (localUrl) {
                    const testRes = await fetch(localUrl, { method: 'HEAD' })
                    if (testRes.ok) {
                      current[key] = localUrl
                      continue
                    }
                  }
                  const res = await fetch(val)
                  const blob = await res.blob()
                  current[key] = URL.createObjectURL(blob)
                } catch (err) {
                  console.error('Original fetch error:', err)
                }
              } else if (typeof val === 'object' && val !== null) {
                stack.push(val)
              }
            }
          }
          return node
        }

        const idMap = new Map()
        data.nodes.forEach((node) => {
          idMap.set(node.id, `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
        })

        const canvasElement = canvasRef.current
        let importX = 100,
          importY = 100
        if (canvasElement) {
          const rect = canvasElement.getBoundingClientRect()
          const worldPos = screenToWorld(rect.width / 2 + rect.left, rect.height / 2 + rect.top)
          importX = worldPos.x
          importY = worldPos.y
        }

        let minX = Infinity,
          minY = Infinity
        data.nodes.forEach((node) => {
          if (node.x < minX) minX = node.x
          if (node.y < minY) minY = node.y
        })

        const newNodes = []
        for (const node of data.nodes) {
          const convertedNode = await convertNodeUrls({ ...node })
          convertedNode.id = idMap.get(node.id)
          convertedNode.x = node.x - minX + importX
          convertedNode.y = node.y - minY + importY
          newNodes.push(convertedNode)
        }

        const newConnections = (data.connections || [])
          .filter((conn) => (conn.source || conn.from) && (conn.target || conn.to))
          .map((conn) => ({
            ...conn,
            from: idMap.get(conn.source || conn.from),
            to: idMap.get(conn.target || conn.to)
          }))
          .filter((conn) => conn.from && conn.to)

        setNodes((prev) => [...prev, ...newNodes])
        setConnections((prev) => [...prev, ...newConnections])
        setSelectedNodeIds(new Set(newNodes.map((n) => n.id)))

        resolve({ nodesCount: newNodes.length, connectionsCount: newConnections.length })
      } catch (error) {
        console.error('导入工作流失败:', error)
        alert('导入失败: ' + (error.message || '无效的JSON文件'))
        reject(error)
      }
    }
    input.click()
  })
}
