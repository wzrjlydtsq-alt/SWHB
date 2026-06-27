#!/usr/bin/env node

const path = require('path')
const { spawnSync } = require('child_process')

const root = path.resolve(__dirname, '../..')
const args = process.argv.slice(2)
const deep = args.includes('--deep')

const moduleScripts = [
  'scripts/qa/test-workspace-module.cjs',
  'scripts/qa/test-canvas-module.cjs',
  'scripts/qa/test-production-module.cjs',
  'scripts/qa/test-dubbing-module.cjs'
]

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

function recordFailure(result) {
  if (result.status !== 0) {
    if (result.error) console.error(result.error.message)
    return 1
  }
  return 0
}

let failed = 0

for (const script of moduleScripts) {
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    stdio: 'inherit'
  })
  failed += recordFailure(result)
}

if (deep) {
  const commands = [
    ['npm', ['test'], 'unit tests'],
    ['npm', ['run', 'typecheck'], 'typecheck'],
    ['npm', ['run', 'build'], 'build']
  ]

  for (const [cmd, commandArgs, label] of commands) {
    console.log(`\n[deep] running ${label}`)
    const result = spawnCommand(cmd, commandArgs, {
      cwd: root,
      stdio: 'inherit'
    })
    failed += recordFailure(result)
  }
}

if (failed > 0) {
  console.error(`\nModule QA failed: ${failed} script(s) failed.`)
  process.exit(1)
}

console.log('\nModule QA passed.')
