/**
 * parseScript - 解析剧本文本，按"镜头X"标记分段提取镜头内容
 *
 * 支持格式：
 *   - 中文数字：镜头一、镜头二、镜头十二 ...
 *   - 阿拉伯数字：镜头1、镜头2、镜头12 ...
 *
 * @param {string} text - 原始剧本文本
 * @returns {{ shots: Array<{ index: number, title: string, content: string }>, count: number }}
 */

// 中文数字 → 阿拉伯数字映射
const CN_NUM_MAP = {
  零: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9
}
const CN_UNIT_MAP = { 十: 10, 百: 100, 千: 1000, 万: 10000 }

/**
 * 将中文数字字符串转为阿拉伯数字
 * 例如：'十二' → 12, '二十' → 20, '一百二十三' → 123
 */
export function chineseToNumber(cn) {
  if (!cn) return 0

  // 纯阿拉伯数字
  if (/^\d+$/.test(cn)) return parseInt(cn, 10)

  let result = 0
  let current = 0
  let prevUnit = 1

  for (const char of cn) {
    if (CN_NUM_MAP[char] !== undefined) {
      current = CN_NUM_MAP[char]
    } else if (CN_UNIT_MAP[char] !== undefined) {
      const unit = CN_UNIT_MAP[char]
      if (current === 0 && unit === 10) {
        // 处理 "十二" 这种省略 "一" 的写法
        result += unit
      } else {
        result += current * unit
        current = 0
      }
      prevUnit = unit
    }
  }

  // 末位没有单位的数字（如 "二十三" 中的 "三"）
  result += current

  return result
}

/**
 * 解析剧本文本
 */
export function parseScript(text) {
  if (!text || typeof text !== 'string') {
    return { shots: [], count: 0 }
  }

  // 匹配 "镜头" + 中文数字或阿拉伯数字
  const pattern = /镜头([一二三四五六七八九十百千万零\d]+)/g
  const matches = []
  let match

  while ((match = pattern.exec(text)) !== null) {
    matches.push({
      fullMatch: match[0], // e.g. "镜头一"
      numberPart: match[1], // e.g. "一"
      startIndex: match.index // 在原文中的位置
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
