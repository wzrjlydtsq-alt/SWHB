#!/usr/bin/env node

const { createSuite } = require('./module-test-utils.cjs')

const suite = createSuite('Production module')

const appLayout = 'src/renderer/components/AppLayout.tsx'
const production = 'src/renderer/features/production/ProductionBoard.tsx'
const unattended = 'src/renderer/features/production/useUnattendedMode.ts'
const uiSlice = 'src/renderer/store/slices/createUiSlice.ts'
const projectFile = 'src/renderer/hooks/useProjectFile.ts'
const saveWidget = 'src/renderer/components/ui/ProjectSaveWidget.tsx'
const preload = 'src/preload/index.js'
const ipc = 'src/main/ipcHandlers.js'

suite.fileExists(production)
suite.contains(
  appLayout,
  /page:\s*'production'.*label:\s*'Production'/,
  'Production nav item is registered'
)
suite.contains(
  appLayout,
  /<ProductionBoard embedded/,
  'ProductionBoard is mounted as embedded workspace'
)
suite.contains(
  production,
  /productionBoardMode === 'video'/,
  'Production supports video/image mode split'
)
suite.contains(production, /setStoreVideoRows\(rows\)/, 'Production persists video rows to store')
suite.contains(production, /setStoreImageRows\(rows\)/, 'Production persists image rows to store')
suite.contains(production, /setStoreSharedRefs/, 'Production shares common refs between modes')
suite.contains(production, /handleImportDocument/, 'Production imports text/docx shot documents')
suite.contains(production, /parseDocument/, 'Production uses structured document parsing')
suite.contains(production, /cache:copy-file/, 'Production media cell can cache or link local files')
suite.contains(
  production,
  /localCacheAPI\.saveCache/,
  'Production falls back to local cache for readable files'
)
suite.contains(production, /handleBatchUploadAssets/, 'Production has batch asset upload')
suite.contains(
  production,
  /ossAPI\?\.getConfig[\s\S]*OSS 未配置/,
  'Production validates OSS configuration before upload'
)
suite.contains(production, /ossAPI\.uploadFile/, 'Production uploads local assets to OSS')
suite.contains(
  production,
  /assetAPI\.create/,
  'Production creates provider assets after OSS upload'
)
suite.contains(production, /assetAPI\.poll/, 'Production polls asset readiness')
suite.contains(
  production,
  /copyUploadFailureDiagnostics/,
  'Production can copy upload failure diagnostics'
)
suite.contains(
  production,
  /getStartGeneration/,
  'Production uses registered canvas generation entrypoint'
)
suite.contains(
  production,
  /const \[rowTaskMap,\s*setRowTaskMap\]/,
  'Production maps rows to generated task ids'
)
suite.contains(
  production,
  /history\.filter\(\(h\) => taskIds\.includes\(h\.sourceNodeId\)\)/,
  'Production receives task results from history'
)
suite.contains(production, /copyRowDiagnostics/, 'Production can copy task diagnostics')
suite.contains(
  unattended,
  /PHASES\s*=\s*{[\s\S]*IMAGE_GENERATION[\s\S]*ASSET_UPLOAD[\s\S]*VIDEO_GENERATION/,
  'Unattended mode covers image/upload/video phases'
)
suite.contains(
  unattended,
  /handleBatchUploadAssets\(false,\s*true\)/,
  'Unattended mode silently uploads generated assets'
)
suite.contains(unattended, /startRowTask\(row,\s*i\)/, 'Unattended mode dispatches row tasks')
suite.contains(uiSlice, /productionBoardVideoRows/, 'Store includes video rows')
suite.contains(uiSlice, /productionBoardImageRows/, 'Store includes image rows')
suite.contains(
  projectFile,
  /productionBoard:\s*{[\s\S]*videoRows[\s\S]*imageRows[\s\S]*sharedRefs/,
  'Project save includes production board modes and shared refs'
)
suite.contains(
  saveWidget,
  /productionBoard:\s*buildProductionBoardSnapshot/,
  'Manual JSON export includes production board snapshot'
)
suite.contains(preload, /ossAPI:\s*{[\s\S]*uploadFile/, 'Preload exposes OSS upload API')
suite.contains(ipc, /ipcMain\.handle\('oss:upload-file'/, 'Main process handles OSS file upload')
suite.contains(ipc, /ipcMain\.handle\('asset:create'/, 'Main process handles asset creation')

suite.summarize()
