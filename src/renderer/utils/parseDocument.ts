/**
 * parseDocument - 一次性解析文档，同时提取镜头、角色、道具、场景
 *
 * 支持在同一份文档中混合书写：
 *   镜头一  ...内容...
 *   镜头二  ...内容...
 *   角色一  ...内容...
 *   道具一  ...内容...
 *   场景一  ...内容...
 *
 * 支持中文数字和阿拉伯数字。
 * 支持 .txt / .md / .docx 格式。
 *
 * @param {string} text - 原始文本
 * @returns {{ shots: ParsedItem[], characters: ParsedItem[], props: ParsedItem[], scenes: ParsedItem[] }}
 */

import { chineseToNumber } from './parseScript.ts'
import mammoth from 'mammoth'

interface ParsedItem {
  index: number
  title: string
  content: string
}

export interface ParseResult {
  shots: ParsedItem[]
  characters: ParsedItem[]
  props: ParsedItem[]
  scenes: ParsedItem[]
}

export interface DocumentIndexChunk {
  id: string
  kind: 'page' | 'sheet' | 'row-range' | 'text'
  label: string
  text: string
  page?: number
  sheet?: string
  rowStart?: number
  rowEnd?: number
}

export interface DocumentExtractionIndex {
  kind: 'pdf' | 'excel' | 'text'
  totalPages?: number
  parsedPages?: number
  totalSheets?: number
  parsedSheets?: number
  totalRows?: number
  parsedRows?: number
  truncatedPages?: number
  truncatedSheets?: number
  truncatedRows?: number
  chunks: DocumentIndexChunk[]
}

// 统一的标记匹配：镜头X / 角色X / 道具X / 场景X
const SECTION_PATTERN = /(镜头|角色|道具|场景)([一二三四五六七八九十百千万零\d]+)/g
const DOCUMENT_CHUNK_TEXT_LIMIT = 4000

function normalizeExtractedText(value = '') {
  return value.replace(/\s+/g, ' ').trim()
}

function limitChunkText(value = '', limit = DOCUMENT_CHUNK_TEXT_LIMIT) {
  const normalized = normalizeExtractedText(value)
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized
}

export function parseDocument(text: string): ParseResult {
  const result: ParseResult = {
    shots: [],
    characters: [],
    props: [],
    scenes: []
  }

  if (!text || typeof text !== 'string') return result

  // 第一遍：收集所有标记及其位置
  const markers: Array<{
    type: '镜头' | '角色' | '道具' | '场景'
    fullMatch: string
    numberPart: string
    startIndex: number
  }> = []

  let match
  while ((match = SECTION_PATTERN.exec(text)) !== null) {
    markers.push({
      type: match[1] as '镜头' | '角色' | '道具' | '场景',
      fullMatch: match[0],
      numberPart: match[2],
      startIndex: match.index
    })
  }

  if (markers.length === 0) return result

  // 按出现位置排序（混合文档中标记可能交错）
  markers.sort((a, b) => a.startIndex - b.startIndex)

  // 第二遍：提取每个标记到下一个标记之间的内容
  const shotCounter = { 镜头: 0, 角色: 0, 道具: 0, 场景: 0 }

  for (let i = 0; i < markers.length; i++) {
    const m = markers[i]
    const start = m.startIndex
    const end = i < markers.length - 1 ? markers[i + 1].startIndex : text.length
    const rawContent = text.slice(start, end).trim()

    shotCounter[m.type]++

    const item: ParsedItem = {
      index: shotCounter[m.type],
      title: m.fullMatch,
      content: rawContent
    }

    switch (m.type) {
      case '镜头':
        result.shots.push(item)
        break
      case '角色':
        result.characters.push(item)
        break
      case '道具':
        result.props.push(item)
        break
      case '场景':
        result.scenes.push(item)
        break
    }
  }

  return result
}

/**
 * 从 .docx 文件的 ArrayBuffer 中提取纯文本
 */
export async function extractTextFromDocx(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ arrayBuffer })
    return result.value || ''
  } catch (err) {
    console.error('[parseDocument] docx 解析失败:', err)
    throw new Error('Word 文档解析失败，请确认文件格式正确')
  }
}

export async function extractPdfDocumentIndex(
  arrayBuffer: ArrayBuffer,
  options: { maxPages?: number; maxCharsPerPage?: number } = {}
): Promise<DocumentExtractionIndex> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const task = pdfjs.getDocument({
      data: new Uint8Array(arrayBuffer),
      disableWorker: true,
      isEvalSupported: false
    } as any)
    const pdf = await task.promise
    const totalPages = pdf.numPages
    const pageLimit = Math.min(totalPages, options.maxPages || 80)
    const chunks: DocumentIndexChunk[] = []

    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber++) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = content.items
        .map((item: any) => ('str' in item ? item.str : ''))
        .filter(Boolean)
        .join(' ')
      const normalized = limitChunkText(text, options.maxCharsPerPage || DOCUMENT_CHUNK_TEXT_LIMIT)
      if (normalized) {
        chunks.push({
          id: `page-${pageNumber}`,
          kind: 'page',
          label: `Page ${pageNumber}`,
          page: pageNumber,
          text: normalized
        })
      }
    }

    await (pdf as any).destroy()
    return {
      kind: 'pdf',
      totalPages,
      parsedPages: pageLimit,
      truncatedPages: Math.max(0, totalPages - pageLimit),
      chunks
    }
  } catch (err) {
    console.error('[parseDocument] PDF 解析失败:', err)
    throw new Error('PDF 文本解析失败，请确认文件未加密且格式正确')
  }
}

export function renderDocumentIndexPreview(index: DocumentExtractionIndex, chunkLimit = 12): string {
  const chunks = index.chunks.slice(0, chunkLimit).map((chunk) => `[${chunk.label}]\n${chunk.text}`)
  const suffixes: string[] = []
  if (index.truncatedPages) suffixes.push(`... (${index.truncatedPages} more pages not included)`)
  if (index.truncatedRows) suffixes.push(`... (${index.truncatedRows} more rows)`)
  if (index.truncatedSheets) suffixes.push(`... (${index.truncatedSheets} more sheets not included)`)
  if (index.chunks.length > chunkLimit) suffixes.push(`... (${index.chunks.length - chunkLimit} more indexed chunks not included)`)
  return [...chunks, ...suffixes].join('\n\n').trim()
}

export async function extractTextFromPdf(arrayBuffer: ArrayBuffer): Promise<string> {
  const index = await extractPdfDocumentIndex(arrayBuffer, { maxPages: 12 })
  return renderDocumentIndexPreview(index, 12)
}

export async function extractExcelDocumentIndex(
  arrayBuffer: ArrayBuffer,
  options: { maxSheets?: number; rowsPerChunk?: number; maxRowsPerSheet?: number; maxColumns?: number } = {}
): Promise<DocumentExtractionIndex> {
  try {
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
    const maxSheets = options.maxSheets || 20
    const rowsPerChunk = options.rowsPerChunk || 50
    const maxRowsPerSheet = options.maxRowsPerSheet || 1200
    const maxColumns = options.maxColumns || 24
    const sheetNames = workbook.SheetNames.slice(0, maxSheets)
    const chunks: DocumentIndexChunk[] = []
    let totalRows = 0
    let parsedRows = 0
    let truncatedRows = 0

    sheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        blankrows: false,
        raw: false
      }) as Array<Array<string | number | boolean | null | undefined>>
      totalRows += rows.length
      const rowsToIndex = rows.slice(0, maxRowsPerSheet)
      parsedRows += rowsToIndex.length
      truncatedRows += Math.max(0, rows.length - rowsToIndex.length)
      for (let start = 0; start < rowsToIndex.length; start += rowsPerChunk) {
        const chunkRows = rowsToIndex.slice(start, start + rowsPerChunk)
        const text = chunkRows
          .map((row) =>
            row
              .slice(0, maxColumns)
              .map((cell) => String(cell ?? '').replace(/\s+/g, ' ').trim())
              .join('\t')
              .trimEnd()
          )
          .filter(Boolean)
          .join('\n')
        if (text.trim()) {
          const rowStart = start + 1
          const rowEnd = start + chunkRows.length
          chunks.push({
            id: `${sheetName}-${rowStart}-${rowEnd}`,
            kind: start === 0 ? 'sheet' : 'row-range',
            label: `${sheetName} R${rowStart}-R${rowEnd}`,
            sheet: sheetName,
            rowStart,
            rowEnd,
            text: limitChunkText(text)
          })
        }
      }
    })
    return {
      kind: 'excel',
      totalSheets: workbook.SheetNames.length,
      parsedSheets: sheetNames.length,
      totalRows,
      parsedRows,
      truncatedRows,
      truncatedSheets: Math.max(0, workbook.SheetNames.length - sheetNames.length),
      chunks
    }
  } catch (err) {
    console.error('[parseDocument] Excel 解析失败:', err)
    throw new Error('Excel 表格解析失败，请确认文件格式正确')
  }
}

export async function extractTextFromExcel(arrayBuffer: ArrayBuffer): Promise<string> {
  const index = await extractExcelDocumentIndex(arrayBuffer, {
    maxSheets: 6,
    rowsPerChunk: 80,
    maxRowsPerSheet: 80,
    maxColumns: 18
  })
  return renderDocumentIndexPreview(index, 6)
}

export function createTextDocumentIndex(text: string, options: { chunkSize?: number; maxChunks?: number } = {}): DocumentExtractionIndex {
  const chunkSize = options.chunkSize || 3000
  const maxChunks = options.maxChunks || 80
  const normalized = text.replace(/\r\n/g, '\n').trim()
  const chunks: DocumentIndexChunk[] = []
  for (let start = 0; start < normalized.length && chunks.length < maxChunks; start += chunkSize) {
    const chunkText = normalized.slice(start, start + chunkSize).trim()
    if (!chunkText) continue
    chunks.push({
      id: `text-${chunks.length + 1}`,
      kind: 'text',
      label: `Text ${chunks.length + 1}`,
      text: chunkText
    })
  }
  return {
    kind: 'text',
    chunks
  }
}

/**
 * 根据文件名判断是否为 .docx
 */
export function isDocxFile(fileName: string): boolean {
  return /\.docx$/i.test(fileName)
}

/**
 * 获取解析摘要（用于 UI 显示）
 */
export function getParseResultSummary(parsed: ParseResult): string {
  const parts: string[] = []
  if (parsed.shots.length > 0) parts.push(`${parsed.shots.length} 个镜头`)
  if (parsed.characters.length > 0) parts.push(`${parsed.characters.length} 个角色`)
  if (parsed.props.length > 0) parts.push(`${parsed.props.length} 个道具`)
  if (parsed.scenes.length > 0) parts.push(`${parsed.scenes.length} 个场景`)
  return parts.length > 0 ? parts.join('、') : ''
}
