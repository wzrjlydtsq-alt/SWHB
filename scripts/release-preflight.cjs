#!/usr/bin/env node

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')
const asar = require('@electron/asar')

const projectRoot = path.resolve(__dirname, '..')
const args = process.argv.slice(2)

function argValue(name, fallback) {
  const prefix = `${name}=`
  const hit = args.find((item) => item.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : fallback
}

const unpackedDir = path.resolve(
  projectRoot,
  argValue('--unpacked', process.env.RELEASE_UNPACKED_DIR || 'dist/win-unpacked')
)
const runSmoke = args.includes('--smoke')

const results = []

function add(status, title, detail = '') {
  results.push({ status, title, detail })
}

function exists(filePath) {
  return fs.existsSync(filePath)
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function walkFiles(root, out = []) {
  if (!exists(root)) return out
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) walkFiles(full, out)
    else if (entry.isFile()) out.push(full)
  }
  return out
}

function normalizeAsarEntry(entry) {
  return entry.replace(/^[/\\]+/, '').replace(/\\/g, '/')
}

function collectAsarEntries(asarPath) {
  if (!exists(asarPath)) return []
  return asar.listPackage(asarPath).map(normalizeAsarEntry)
}

function collectAsarSizes(asarPath) {
  const raw = asar.getRawHeader(asarPath).header
  const files = []

  function visit(node, segments = []) {
    for (const [name, child] of Object.entries(node.files || {})) {
      const next = [...segments, name]
      if (child.files) visit(child, next)
      else files.push({ entry: next.join('/'), size: Number(child.size || 0) })
    }
  }

  visit(raw)
  return files
}

function hasEntry(entries, suffix) {
  const normalized = suffix.replace(/\\/g, '/')
  return entries.some((entry) => entry === normalized || entry.endsWith(`/${normalized}`))
}

function checkArtifactBasics(pkg, entries) {
  const exePath = path.join(unpackedDir, 'XingheZhihui.exe')
  const asarPath = path.join(unpackedDir, 'resources', 'app.asar')
  const updateConfigPath = path.join(unpackedDir, 'resources', 'app-update.yml')
  const installerPath = path.join(projectRoot, 'dist', `${pkg.name}-${pkg.version}-setup.exe`)
  const blockmapPath = `${installerPath}.blockmap`
  const latestPath = path.join(projectRoot, 'dist', 'latest.yml')

  add(exists(unpackedDir) ? 'pass' : 'fail', 'win-unpacked exists', unpackedDir)
  add(exists(exePath) ? 'pass' : 'fail', 'packaged executable exists', exePath)
  add(exists(asarPath) ? 'pass' : 'fail', 'app.asar exists', asarPath)
  add(hasEntry(entries, 'out/main/index.js') ? 'pass' : 'fail', 'main bundle is packaged')
  add(hasEntry(entries, 'out/preload/index.js') ? 'pass' : 'fail', 'preload bundle is packaged')
  add(hasEntry(entries, 'out/renderer/index.html') ? 'pass' : 'fail', 'renderer bundle is packaged')
  add(exists(updateConfigPath) ? 'pass' : 'fail', 'packaged updater config exists', updateConfigPath)
  add(exists(installerPath) ? 'pass' : 'fail', 'installer exists for package version', installerPath)
  add(exists(blockmapPath) ? 'pass' : 'fail', 'installer blockmap exists', blockmapPath)
  add(exists(latestPath) ? 'pass' : 'fail', 'latest.yml exists', latestPath)

  if (exists(latestPath)) {
    const latest = readText(latestPath)
    add(
      latest.includes(`${pkg.name}-${pkg.version}-setup.exe`) ? 'pass' : 'fail',
      'latest.yml points at current installer',
      `${pkg.name}-${pkg.version}-setup.exe`
    )
  }
}

function checkBuilderConfig() {
  const builderPath = path.join(projectRoot, 'electron-builder.yml')
  const text = readText(builderPath)
  add(text.includes('!{.env,.env.*') ? 'pass' : 'fail', 'env files are excluded from package')
  add(text.includes('resources/**') ? 'pass' : 'fail', 'resources are configured for package/unpack')
  add(
    text.includes('node_modules/better-sqlite3/**') ? 'pass' : 'fail',
    'better-sqlite3 is configured for asarUnpack'
  )
  add(text.includes('out/**') ? 'pass' : 'warn', 'files whitelist includes built out directory')
  add(text.includes('!*.db') ? 'pass' : 'fail', 'local sqlite files are excluded')
  add(text.includes('https://image.lingjingxinghe.cn/app-updates/') ? 'pass' : 'fail', 'primary update feed is configured')
}

function checkForbiddenAsarEntries(entries) {
  const forbidden = entries.filter((entry) => {
    const base = path.posix.basename(entry).toLowerCase()
    if (entry.startsWith('out/') || entry.startsWith('node_modules/') || entry.startsWith('resources/')) {
      return false
    }
    if (['package.json'].includes(base)) return false
    if (/\.(db|db-shm|db-wal|log|ps1|bat|cmd)$/i.test(base)) return true
    if (/\.(png|jpg|jpeg|webp|md|txt|ini|yaml|yml)$/i.test(base)) return true
    if (entry.startsWith('docs/') || entry.startsWith('server/') || entry.startsWith('scripts/')) return true
    return false
  })

  add(
    forbidden.length === 0 ? 'pass' : 'fail',
    'app.asar contains no stray repo/dev files',
    forbidden.slice(0, 20).join(', ')
  )
}

function checkSourceAssetsInAsar(asarPath) {
  const sourceAssetsRoot = path.join(projectRoot, 'src', 'renderer', 'assets')
  const assetFiles = walkFiles(sourceAssetsRoot).filter((file) =>
    /\.(png|jpe?g|webp|gif|svg|ico|ttf|otf|woff2?|gltf|glb|wasm)$/i.test(file)
  )
  const packageFiles = collectAsarSizes(asarPath).filter((item) => item.entry.startsWith('out/renderer/'))
  const packageSizes = new Map()
  for (const item of packageFiles) {
    const list = packageSizes.get(item.size) || []
    list.push(item.entry)
    packageSizes.set(item.size, list)
  }

  const missing = []
  for (const asset of assetFiles) {
    const stat = fs.statSync(asset)
    if (stat.size <= 1) continue
    const matches = packageSizes.get(stat.size) || []
    if (matches.length === 0) {
      missing.push(path.relative(projectRoot, asset))
    }
  }

  const counts = {
    checked: assetFiles.length,
    missing: missing.length,
    fonts: assetFiles.filter((file) => /\.(ttf|otf|woff2?)$/i.test(file)).length,
    models: assetFiles.filter((file) => /\.(gltf|glb)$/i.test(file)).length,
    images: assetFiles.filter((file) => /\.(png|jpe?g|webp|gif|svg|ico)$/i.test(file)).length
  }

  add(
    missing.length === 0 ? 'pass' : 'fail',
    'renderer images/fonts/models are present in app.asar',
    `${JSON.stringify(counts)}${missing.length ? ` missing: ${missing.slice(0, 10).join(', ')}` : ''}`
  )
}

function checkNativeAndRuntimeFiles(entries) {
  const unpackedRoot = path.join(unpackedDir, 'resources', 'app.asar.unpacked')
  const unpackedFiles = walkFiles(unpackedRoot).map((file) =>
    path.relative(unpackedRoot, file).replace(/\\/g, '/')
  )
  const nativeInAsar = entries.filter((entry) => /\.(node|dll|exe)$/i.test(entry))
  const nativeOnlyInAsar = nativeInAsar.filter((entry) => !unpackedFiles.includes(entry))
  const betterSqliteNative = unpackedFiles.find((file) => /better-sqlite3\/.*better_sqlite3\.node$/i.test(file))
  const canvasNative = unpackedFiles.find((file) => /@napi-rs\/canvas.*\.(node|dll)$/i.test(file))

  add(
    nativeOnlyInAsar.length === 0 ? 'pass' : 'fail',
    'native/executable files are not trapped inside app.asar',
    nativeOnlyInAsar.length
      ? nativeOnlyInAsar.slice(0, 20).join(', ')
      : `${nativeInAsar.length} native/executable asar headers all have unpacked counterparts`
  )
  add(betterSqliteNative ? 'pass' : 'fail', 'better-sqlite3 native binary is unpacked', betterSqliteNative || '')
  add(canvasNative ? 'pass' : 'info', '@napi-rs/canvas native binary is unpacked when present', canvasNative || 'not present')

  const ffmpegCandidates = [
    path.join(unpackedDir, 'resources', 'ffmpeg.exe'),
    path.join(unpackedDir, 'resources', 'bin', 'ffmpeg.exe'),
    path.join(unpackedRoot, 'resources', 'ffmpeg.exe'),
    path.join(unpackedRoot, 'resources', 'bin', 'ffmpeg.exe'),
    path.join(unpackedRoot, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
  ]
  const sourceUsesFfmpeg = readText(path.join(projectRoot, 'src', 'main', 'ipcHandlers.js')).includes('ffmpeg')
  const packagedFfmpeg = ffmpegCandidates.find(exists)
  add(
    !sourceUsesFfmpeg || packagedFfmpeg ? 'pass' : 'fail',
    'ffmpeg runtime dependency is packaged for clean machines',
    packagedFfmpeg || 'src/main/ipcHandlers.js calls ffmpeg.exe but no packaged ffmpeg.exe was found'
  )

  const workerLike = entries.filter((entry) => /\.(worker\.js|wasm)$/i.test(entry))
  add('info', 'worker/wasm package inventory', workerLike.length ? workerLike.join(', ') : 'no explicit worker/wasm assets found')
}

function checkProductionConfig(entries) {
  const asarPath = path.join(unpackedDir, 'resources', 'app.asar')
  const envInAsar = entries.filter((entry) => /(^|\/)\.env(\.|$)/.test(entry))
  add(envInAsar.length === 0 ? 'pass' : 'fail', 'no .env files are packaged', envInAsar.join(', '))

  const constants = readText(path.join(projectRoot, 'src', 'renderer', 'utils', 'constants.ts'))
  const cloudClient = readText(path.join(projectRoot, 'src', 'renderer', 'services', 'cloud', 'cloudClient.ts'))
  const updater = readText(path.join(projectRoot, 'src', 'main', 'updater.js'))
  const appUpdate = exists(path.join(unpackedDir, 'resources', 'app-update.yml'))
    ? readText(path.join(unpackedDir, 'resources', 'app-update.yml'))
    : ''

  add(constants.includes("key: ''") ? 'pass' : 'warn', 'default model configs do not ship API tokens')
  add(
    constants.includes('JIMENG_SESSION_ID') && /JIMENG_SESSION_ID\s*=\s*'[^']+'/.test(constants)
      ? 'warn'
      : 'pass',
    'no hard-coded session token defaults',
    'JIMENG_SESSION_ID has a non-empty default in src/renderer/utils/constants.ts'
  )
  add(
    cloudClient.includes("http://47.109.138.168/api/v1") ? 'warn' : 'pass',
    'cloud API production default uses HTTPS or build env override',
    'default is http://47.109.138.168/api/v1 unless VITE_CLOUD_API_BASE_URL/VITE_API_BASE_URL is set at build time'
  )
  add(
    updater.includes('https://image.lingjingxinghe.cn/app-updates/') &&
      updater.includes('https://ljxhimage2.oss-cn-chengdu.aliyuncs.com/app-updates/')
      ? 'pass'
      : 'fail',
    'updater has primary and fallback HTTPS feeds'
  )
  add(
    appUpdate.includes('https://image.lingjingxinghe.cn/app-updates/') ? 'pass' : 'fail',
    'packaged app-update.yml uses production update feed'
  )

  const packageText = exists(asarPath) ? asar.extractFile(asarPath, 'package.json').toString('utf8') : ''
  add(packageText.includes('"version"') ? 'pass' : 'warn', 'packaged package.json is readable')
}

function runPackagedSmoke(pkg) {
  const exePath = path.join(unpackedDir, 'XingheZhihui.exe')
  if (!exists(exePath)) {
    add('fail', 'packaged smoke launch', `missing ${exePath}`)
    return Promise.resolve()
  }

  const smokeRoot = fs.mkdtempSync(path.join(os.tmpdir(), `xinghe-smoke-${pkg.version}-`))
  const userDataDir = path.join(smokeRoot, 'user-data')
  fs.mkdirSync(userDataDir, { recursive: true })

  return new Promise((resolve) => {
    const child = spawn(exePath, [`--user-data-dir=${userDataDir}`, '--disable-gpu'], {
      cwd: path.dirname(exePath),
      windowsHide: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        XINGHE_RELEASE_SMOKE: '1'
      }
    })

    let exited = false
    child.on('exit', (code, signal) => {
      exited = true
      add(code === 0 ? 'pass' : 'fail', 'packaged smoke launch', `exited early code=${code} signal=${signal || ''}; userData=${userDataDir}`)
      resolve()
    })
    child.on('error', (error) => {
      exited = true
      add('fail', 'packaged smoke launch', error.message)
      resolve()
    })

    setTimeout(() => {
      if (!exited) {
        add('pass', 'packaged smoke launch', `app stayed alive for 15s with clean userData=${userDataDir}`)
        try {
          child.kill()
        } catch {
          // ignore
        }
        resolve()
      }
    }, 15000)
  })
}

function printResults() {
  const icon = { pass: 'PASS', fail: 'FAIL', warn: 'WARN', info: 'INFO' }
  for (const item of results) {
    console.log(`[${icon[item.status] || item.status}] ${item.title}${item.detail ? ` - ${item.detail}` : ''}`)
  }
  const summary = results.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1
    return acc
  }, {})
  console.log(`\nSummary: ${JSON.stringify(summary)}`)
}

async function main() {
  const pkg = JSON.parse(readText(path.join(projectRoot, 'package.json')))
  const asarPath = path.join(unpackedDir, 'resources', 'app.asar')
  const entries = collectAsarEntries(asarPath)

  checkBuilderConfig()
  checkArtifactBasics(pkg, entries)
  if (exists(asarPath)) {
    checkForbiddenAsarEntries(entries)
    checkSourceAssetsInAsar(asarPath)
    checkNativeAndRuntimeFiles(entries)
    checkProductionConfig(entries)
  }
  if (runSmoke) {
    await runPackagedSmoke(pkg)
  } else {
    add('info', 'clean userData smoke launch', 'run npm run check:release:smoke after packaging')
  }

  printResults()
  if (results.some((item) => item.status === 'fail')) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
