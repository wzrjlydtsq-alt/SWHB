const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const projectRoot = path.resolve(__dirname, '../..')

function quoteCmdArg(value) {
  const text = String(value)
  if (/^[A-Za-z0-9_./:-]+$/.test(text)) return text
  return `"${text.replace(/"/g, '\\"')}"`
}

function spawnCommand(cmd, args, options) {
  if (process.platform === 'win32' && cmd === 'npm') {
    return spawnSync(
      'cmd.exe',
      ['/d', '/s', '/c', [cmd, ...args].map(quoteCmdArg).join(' ')],
      options
    )
  }
  return spawnSync(cmd, args, options)
}

function relPath(filePath) {
  return filePath.replace(projectRoot + path.sep, '').replace(/\\/g, '/')
}

function read(rel) {
  const abs = path.join(projectRoot, rel)
  return fs.readFileSync(abs, 'utf8')
}

function exists(rel) {
  return fs.existsSync(path.join(projectRoot, rel))
}

function match(text, pattern) {
  if (pattern instanceof RegExp) return pattern.test(text)
  return text.includes(pattern)
}

function createSuite(name) {
  const checks = []

  function check(condition, title, detail = '') {
    checks.push({ ok: Boolean(condition), title, detail })
  }

  function fileExists(rel, title = `${rel} exists`) {
    check(exists(rel), title, rel)
  }

  function contains(rel, pattern, title, detail = '') {
    const text = read(rel)
    check(match(text, pattern), title, detail || rel)
  }

  function countAtLeast(rel, pattern, min, title) {
    const text = read(rel)
    const count = [...text.matchAll(pattern)].length
    check(count >= min, title, `${rel}: found ${count}, expected >= ${min}`)
  }

  function command(cmd, args, title, options = {}) {
    const result = spawnCommand(cmd, args, {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: options.timeoutMs || 120000
    })
    check(
      result.status === 0,
      title,
      (result.error?.message || result.stdout || result.stderr || '').slice(0, 600)
    )
  }

  function summarize() {
    console.log(`\n[${name}]`)
    for (const item of checks) {
      const prefix = item.ok ? '[PASS]' : '[FAIL]'
      console.log(`${prefix} ${item.title}${item.detail ? ` - ${item.detail}` : ''}`)
    }
    const failed = checks.filter((item) => !item.ok)
    console.log(`[SUMMARY] ${checks.length - failed.length}/${checks.length} passed`)
    if (failed.length) process.exitCode = 1
    return { total: checks.length, failed: failed.length }
  }

  return {
    projectRoot,
    relPath,
    read,
    exists,
    check,
    fileExists,
    contains,
    countAtLeast,
    command,
    summarize
  }
}

module.exports = { createSuite, projectRoot, read, exists, relPath }
