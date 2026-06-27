/**
 * parseCharacters - 解析文本，按"角色X"标记分段提取角色内容
 *
 * 支持格式：
 *   - 中文数字：角色一、角色二、角色十二 ...
 *   - 阿拉伯数字：角色1、角色2、角色12 ...
 *
 * @param {string} text - 原始文本
 * @returns {{ shots: Array<{ index: number, title: string, content: string }>, count: number }}
 */

export function parseCharacters(text) {
  if (!text || typeof text !== 'string') {
    return { shots: [], count: 0 }
  }

  // 匹配 "角色" + 中文数字或阿拉伯数字
  const pattern = /角色([一二三四五六七八九十百千万零\d]+)/g
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
