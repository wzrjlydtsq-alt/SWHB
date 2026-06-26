const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SCAN_DIRS = ['src', 'scripts', 'docs', 'server']
const SKIP_DIRS = new Set(['node_modules', '.git', 'out', 'dist', 'build', '.vs', '.vscode'])
const SKIP_FILES = new Set(['.env', '.env.local'])
const TEXT_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.txt',
  '.yml',
  '.yaml',
  '.env',
  '.toml'
])

const PATTERNS = [
  { name: 'OpenAI-like API key', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'VolcEngine access key', pattern: /\bAKLT[A-Za-z0-9]{20,}\b/g },
  { name: 'Alibaba Cloud access key', pattern: /\bLTAI[A-Za-z0-9]{12,}\b/g },
  { name: 'GitHub token', pattern: /\bghp_[A-Za-z0-9_]{20,}\b/g },
  { name: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{20,}\b/g },
  { name: 'Slack token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  {
    name: 'Signed cloud credential URL',
    pattern: /\bX-Tos-Credential=(?!YOUR_ACCESS_KEY_ID)[^&\s"']+/gi
  },
  {
    name: 'Hardcoded secret assignment',
    pattern:
      /\b(?:accessKey|secretKey|apiSecret|api_secret|clientSecret|client_secret|bearer|ark_ak|ark_sk)\b\s*[:=]\s*['"][^'"]{12,}['"]/gi
  },
  {
    name: 'Hardcoded credential assignment',
    pattern:
      /\b(?:accessKeyId|accessKeySecret|secretAccessKey|access_key_id|access_key_secret|secret_access_key|volcengine_ark_access_key_id|volcengine_ark_access_key_secret)\b\s*[:=]\s*['"][^'"]{12,}['"]/gi
  }
]

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    if (SKIP_FILES.has(entry.name)) continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, files)
      continue
    }
    const ext = path.extname(entry.name)
    if (TEXT_EXTENSIONS.has(ext) || entry.name.startsWith('.env')) files.push(fullPath)
  }
  return files
}

const findings = []

function isAllowedPlaceholder(lineText) {
  return (
    /['"]mock-[^'"]*['"]/i.test(lineText) ||
    /['"](?:changeme|placeholder|example|redacted)[^'"]*['"]/i.test(lineText) ||
    /\bYOUR_[A-Z0-9_]+\b/.test(lineText)
  )
}

for (const dir of SCAN_DIRS) {
  for (const file of walk(path.join(ROOT, dir))) {
    const text = fs.readFileSync(file, 'utf8')
    const lines = text.split(/\r?\n/)
    for (const { name, pattern } of PATTERNS) {
      pattern.lastIndex = 0
      let match
      while ((match = pattern.exec(text))) {
        const line = text.slice(0, match.index).split(/\r?\n/).length
        const lineText = lines[line - 1]?.trim() || ''
        if (isAllowedPlaceholder(lineText)) continue
        findings.push({ file: path.relative(ROOT, file), line, name, lineText })
      }
    }
  }
}

if (findings.length > 0) {
  console.error('Potential secrets found:')
  for (const item of findings) {
    console.error(`${item.file}:${item.line} [${item.name}] ${item.lineText}`)
  }
  process.exit(1)
}

console.log('No hardcoded secrets found.')
