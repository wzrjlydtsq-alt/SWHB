/**
 * TypeScript 迁移脚本
 *
 * 将 src/renderer 下的 .js → .ts, .jsx → .tsx
 * 同时更新所有文件中的 import 引用
 */
const fs = require('fs')
const path = require('path')

const RENDERER_DIR = path.resolve(__dirname, '../src/renderer')

// 已经是 .ts/.tsx 的文件不处理
const SKIP_PATTERNS = [/\.d\.ts$/, /node_modules/]

// 收集所有需要重命名的文件
function collectFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      collectFiles(fullPath, files)
    } else if (entry.isFile()) {
      if (SKIP_PATTERNS.some((p) => p.test(fullPath))) continue
      if (entry.name.endsWith('.jsx') || entry.name.endsWith('.js')) {
        files.push(fullPath)
      }
    }
  }
  return files
}

// 决定新扩展名
function getNewExt(filePath) {
  if (filePath.endsWith('.jsx')) return '.tsx'
  if (filePath.endsWith('.js')) return '.ts'
  return null
}

// Step 1: 收集文件并建立映射
const files = collectFiles(RENDERER_DIR)
const renameMap = new Map() // oldPath → newPath
const importMap = new Map() // oldBasename → newBasename (不含扩展名的路径不需要改)

console.log(`\n[迁移] 发现 ${files.length} 个文件需要重命名\n`)

for (const f of files) {
  const newExt = getNewExt(f)
  if (!newExt) continue
  const oldExt = path.extname(f)
  const newPath = f.slice(0, -oldExt.length) + newExt
  renameMap.set(f, newPath)

  // 记录 import 替换规则（含扩展名的导入路径）
  const oldBasename = path.basename(f)
  const newBasename = path.basename(newPath)
  importMap.set(oldBasename, newBasename)
}

// Step 2: 更新所有文件中的 import 引用（在重命名前）
// 包括已经是 .ts/.tsx 的文件
function collectAllSourceFiles(dir, result = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      collectAllSourceFiles(fullPath, result)
    } else if (entry.isFile()) {
      if (/\.(js|jsx|ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        result.push(fullPath)
      }
    }
  }
  return result
}

const allSourceFiles = collectAllSourceFiles(RENDERER_DIR)
// 也检查 main 和 preload 目录
const mainDir = path.resolve(__dirname, '../src/main')
const preloadDir = path.resolve(__dirname, '../src/preload')
if (fs.existsSync(mainDir)) collectAllSourceFiles(mainDir, allSourceFiles)
if (fs.existsSync(preloadDir)) collectAllSourceFiles(preloadDir, allSourceFiles)

let updatedImports = 0

for (const sourceFile of allSourceFiles) {
  let content = fs.readFileSync(sourceFile, 'utf-8')
  let modified = false

  for (const [oldName, newName] of importMap) {
    // 替换含扩展名的 import/require
    // e.g., from './toast.js' → from './toast.ts'
    // e.g., from '../components/AppLayout.jsx' → from '../components/AppLayout.tsx'
    const patterns = [
      // import from 'xxx.js'
      new RegExp(`(from\\s+['"])(.*?/${oldName.replace('.', '\\.')})(['"])`, 'g'),
      // import('xxx.js')
      new RegExp(`(import\\(['"])(.*?/${oldName.replace('.', '\\.')})(['"]\\))`, 'g'),
      // require('xxx.js')
      new RegExp(`(require\\(['"])(.*?/${oldName.replace('.', '\\.')})(['"]\\))`, 'g'),
      // 不带路径前缀的导入 (直接文件名)
      new RegExp(`(from\\s+['"]\\./)${oldName.replace('.', '\\.')}(['"])`, 'g')
    ]

    for (const pattern of patterns) {
      const newContent = content.replace(pattern, (match) => {
        return match.replace(oldName, newName)
      })
      if (newContent !== content) {
        content = newContent
        modified = true
        updatedImports++
      }
    }
  }

  if (modified) {
    fs.writeFileSync(sourceFile, content, 'utf-8')
  }
}

console.log(`[迁移] 更新了 ${updatedImports} 处 import 引用\n`)

// Step 3: 执行重命名
let renamed = 0
for (const [oldPath, newPath] of renameMap) {
  try {
    fs.renameSync(oldPath, newPath)
    renamed++
  } catch (err) {
    console.error(`[错误] 重命名失败: ${oldPath} → ${newPath}`, err.message)
  }
}

console.log(`[迁移] 成功重命名 ${renamed} 个文件`)
console.log(`       .js  → .ts  : ${files.filter((f) => f.endsWith('.js')).length} 个`)
console.log(`       .jsx → .tsx : ${files.filter((f) => f.endsWith('.jsx')).length} 个`)
console.log(`\n[完成] TypeScript 迁移脚本执行完毕`)
