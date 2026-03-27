/**
 * parseScenes - 解析文本，按"场景X"标记分段提取场景内容
 *
 * 支持格式：
 *   - 中文数字：场景一、场景二、场景十二 ...
 *   - 阿拉伯数字：场景1、场景2、场景12 ...
 *
 * @param {string} text - 原始文本
 * @returns {{ shots: Array<{ index: number, title: string, content: string }>, count: number }}
 */

export function parseScenes(text) {
  if (!text || typeof text !== 'string') {
    return { shots: [], count: 0 }
  }

  // 匹配 "场景" + 中文数字或阿拉伯数字
  const pattern = /场景([一二三四五六七八九十百千万零\d]+)/g
  const matches = []
  let match

  while ((match = pattern.exec(text)) !== null) {
    matches.push({
      fullMatch: match[0],
      numberPart: match[1],
      startIndex: match.index
    })
  }

  if (matches.length === 0) {
    return { shots: [], count: 0 }
  }

  const shots = matches.map((m, i) => {
    const start = m.startIndex
    const end = i < matches.length - 1 ? matches[i + 1].startIndex : text.length
    const rawContent = text.slice(start, end).trim()

    return {
      index: i + 1,
      title: m.fullMatch,
      content: rawContent
    }
  })

  return { shots, count: shots.length }
}
