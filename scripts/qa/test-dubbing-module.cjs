#!/usr/bin/env node

const { createSuite } = require('./module-test-utils.cjs')

const suite = createSuite('Dubbing module')

const appLayout = 'src/renderer/components/AppLayout.tsx'
const panel = 'src/renderer/features/dubbing/OverseasDubbingPanel.tsx'
const service = 'src/renderer/features/dubbing/vodAiTranslationService.ts'
const queue = 'src/renderer/features/dubbing/dubbingQueue.ts'
const production = 'src/renderer/features/production/ProductionBoard.tsx'
const preload = 'src/preload/index.js'
const ipc = 'src/main/ipcHandlers.js'
const vodMain = 'src/main/engine/volcVodAiTranslation.js'

suite.fileExists(panel)
suite.contains(appLayout, /page:\s*'dubbing'/, 'Dubbing nav item is registered')
suite.contains(appLayout, /<OverseasDubbingPanel \/>/, 'Dubbing panel is mounted')
suite.contains(service, /getVodTranslationStatus/, 'Dubbing service checks VOD status')
suite.contains(service, /saveVodTranslationConfig/, 'Dubbing service saves VOD config')
suite.contains(service, /submitDubbingWorkflow/, 'Dubbing service submits workflow')
suite.contains(service, /getDubbingProject/, 'Dubbing service fetches project')
suite.contains(service, /continueDubbingWorkflow/, 'Dubbing service continues staged workflow')
suite.contains(service, /updateDubbingUtterances/, 'Dubbing service updates utterances')
suite.contains(service, /refreshDubbingProject/, 'Dubbing service refreshes project')
suite.contains(service, /uploadMediaByUrl/, 'Dubbing service uploads media by URL')
suite.contains(service, /queryUploadTask/, 'Dubbing service queries upload task')
suite.contains(
  queue,
  /STORAGE_KEY = 'xinghe_overseas_dubbing_queue'/,
  'Dubbing queue persists to local storage'
)
suite.contains(queue, /normalizeJob/, 'Dubbing queue normalizes jobs')
suite.contains(queue, /createFallbackUtterances/, 'Dubbing queue creates fallback utterances')
suite.contains(queue, /saveDubbingQueue/, 'Dubbing queue saves jobs')
suite.contains(queue, /enqueueDubbingJob/, 'Dubbing queue can enqueue jobs')
suite.contains(panel, /submitDubbingWorkflow/, 'Dubbing panel submits jobs')
suite.contains(panel, /uploadMediaByUrl/, 'Dubbing panel can stage URL uploads')
suite.contains(panel, /updateDubbingUtterances/, 'Dubbing panel can edit returned subtitles')
suite.contains(panel, /refreshDubbingProject/, 'Dubbing panel can refresh cloud state')
suite.contains(
  production,
  /enqueueDubbingJob/,
  'Production can send video preview to dubbing queue'
)
suite.contains(
  preload,
  /vodAITranslation:\s*{[\s\S]*submitWorkflow/,
  'Preload exposes VOD workflow IPC'
)
suite.contains(preload, /uploadMediaByUrl/, 'Preload exposes VOD URL upload IPC')
suite.contains(
  ipc,
  /ipcMain\.handle\('vod:ai-translation:submit-workflow'/,
  'Main handles VOD submit workflow'
)
suite.contains(
  ipc,
  /ipcMain\.handle\('vod:ai-translation:update-utterances'/,
  'Main handles VOD utterance updates'
)
suite.contains(
  ipc,
  /ipcMain\.handle\('vod:ai-translation:upload-media-by-url'/,
  'Main handles VOD URL upload'
)
suite.contains(vodMain, /vodAiTranslationActions/, 'Main VOD action map exists')
suite.contains(vodMain, /saveVodCredentialConfig/, 'Main VOD credential storage exists')

suite.summarize()
