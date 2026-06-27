const OSS = require('ali-oss')
const fs = require('fs')
const path = require('path')

const packageJson = require('../package.json')

const version = packageJson.version
const projectRoot = path.join(__dirname, '..')

loadDotEnv(path.join(projectRoot, '.env'))

const config = {
  accessKeyId: readEnv('ALIYUN_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_ID'),
  accessKeySecret: readEnv('ALIYUN_ACCESS_KEY_SECRET', 'OSS_ACCESS_KEY_SECRET'),
  region: process.env.ALIYUN_OSS_REGION || process.env.OSS_REGION || 'oss-cn-chengdu',
  bucket: process.env.ALIYUN_OSS_BUCKET || process.env.OSS_BUCKET || 'ljxhimage2',
  endpoint:
    process.env.ALIYUN_OSS_ENDPOINT ||
    process.env.OSS_ENDPOINT ||
    'https://oss-cn-chengdu.aliyuncs.com',
  authorizationV4: true
}

const publicBaseUrl = ensureTrailingSlash(
  process.env.APP_UPDATE_PUBLIC_URL || 'https://image.lingjingxinghe.cn/app-updates/'
)
const objectPrefix = normalizePrefix(process.env.APP_UPDATE_OSS_PREFIX || 'app-updates')

function readEnv(...names) {
  for (const name of names) {
    const value = process.env[name]
    if (value) return value
  }
  return ''
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return

  const content = fs.readFileSync(filePath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue

    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()
    value = value.replace(/^['"]|['"]$/g, '')

    if (key && process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

function normalizePrefix(prefix) {
  return prefix.replace(/^\/+|\/+$/g, '')
}

function ensureTrailingSlash(url) {
  return url.endsWith('/') ? url : `${url}/`
}

function requireConfig() {
  const missing = []
  if (!config.accessKeyId) missing.push('ALIYUN_ACCESS_KEY_ID')
  if (!config.accessKeySecret) missing.push('ALIYUN_ACCESS_KEY_SECRET')

  if (missing.length) {
    console.error(`Missing release OSS credentials: ${missing.join(', ')}`)
    console.error('Set them in your shell or in a local .env file before running npm run release.')
    process.exit(1)
  }
}

function getReleaseFiles(distDir) {
  const exeName = `xinghe-zhihui-${version}-setup.exe`
  return [exeName, `${exeName}.blockmap`, 'latest.yml'].map((name) => ({
    name,
    path: path.join(distDir, name),
    key: `${objectPrefix}/${name}`
  }))
}

async function uploadFiles() {
  requireConfig()

  const distDir = path.join(projectRoot, 'dist')
  if (!fs.existsSync(distDir)) {
    console.error('dist directory not found. Run the Windows build before publishing.')
    process.exit(1)
  }

  const files = getReleaseFiles(distDir)
  for (const file of files) {
    if (!fs.existsSync(file.path)) {
      console.error(`Missing release file: ${file.name}. Expected package version: ${version}`)
      process.exit(1)
    }
  }

  const client = new OSS(config)
  console.log(`Publishing desktop update v${version} to OSS bucket ${config.bucket}/${objectPrefix}`)

  for (const file of files) {
    const cacheControl = file.name.endsWith('.yml')
      ? 'no-cache, no-store, must-revalidate'
      : 'max-age=31536000'

    console.log(`Uploading ${file.name} -> ${file.key}`)
    await client.put(file.key, file.path, {
      headers: { 'Cache-Control': cacheControl }
    })
  }

  console.log('Desktop update published.')
  console.log(`Update manifest: ${new URL('latest.yml', publicBaseUrl).toString()}`)
}

uploadFiles().catch((error) => {
  console.error('Release upload failed:', error)
  process.exit(1)
})
