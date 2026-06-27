#!/usr/bin/env node

const { createSuite } = require('./module-test-utils.cjs')

const suite = createSuite('Canvas module')

const appLayout = 'src/renderer/components/AppLayout.tsx'
const canvas = 'src/renderer/features/canvas/CanvasFeature.tsx'
const projectFile = 'src/renderer/hooks/useProjectFile.ts'
const saveWidget = 'src/renderer/components/ui/ProjectSaveWidget.tsx'
const generation = 'src/renderer/hooks/useGenerationManager.ts'
const workflow = 'src/renderer/hooks/useWorkflowExecutor.ts'
const canvasTools = 'src/renderer/utils/canvasTools.ts'
const toolDefinitions = 'src/renderer/utils/toolDefinitions.ts'
const chatManager = 'src/renderer/hooks/useChatManager.ts'
const canvasSlice = 'src/renderer/store/slices/createCanvasSlice.ts'
const appShortcuts = 'src/renderer/hooks/useAppShortcuts.ts'
const projectService = 'src/main/projectFileService.js'
const executor = 'src/main/engine/TaskExecutor.js'

suite.fileExists(canvas)
suite.contains(appLayout, /page:\s*'canvas'.*label:\s*'Canvas'/, 'Canvas nav item is registered')
suite.contains(
  appLayout,
  /<CanvasFeature[\s\S]*handleFileUpload=/,
  'CanvasFeature is mounted with upload handlers'
)
suite.contains(canvas, /useCanvasInteractions/, 'Canvas wires pointer interactions')
suite.contains(canvas, /useCanvasDragLogic/, 'Canvas wires drag logic')
suite.contains(canvas, /useGlobalDragAndDrop/, 'Canvas wires global drag and drop')
suite.contains(canvas, /useGenerationManager/, 'Canvas wires generation manager')
suite.contains(
  canvas,
  /registerStartGeneration\(startGeneration\)/,
  'Canvas registers generation entrypoint'
)
suite.contains(canvas, /handleVideoFileUpload/, 'Canvas receives video upload handler')
suite.contains(canvas, /CanvasContext\.Provider/, 'Canvas exposes CanvasContext')
suite.contains(
  projectFile,
  /nodes:\s*sanitizeNodesForProjectSave/,
  'Project save stores sanitized canvas nodes'
)
suite.contains(
  projectFile,
  /history:\s*sanitizeHistoryForSave/,
  'Project save stores sanitized history'
)
suite.contains(projectFile, /assetLibrary:/, 'Project save stores asset library')
suite.contains(projectFile, /productionBoard:/, 'Project save stores production board snapshot')
suite.contains(projectFile, /saveSync/, 'Project save supports beforeunload sync write')
suite.contains(projectService, /atomicWriteJSON/, 'Project file service uses atomic JSON write')
suite.contains(
  projectService,
  /preserveExistingCanvasIfNeeded/,
  'Project file service guards blank-canvas overwrite'
)
suite.contains(
  saveWidget,
  /productionBoard:\s*buildProductionBoardSnapshot/,
  'Manual JSON export includes production board'
)
suite.contains(
  saveWidget,
  /restoreProductionBoardSnapshot/,
  'Manual JSON import restores production board'
)
suite.contains(generation, /engineAPI\.submitTask/, 'Generation submits tasks through engine IPC')
suite.contains(generation, /onTaskUpdated/, 'Generation listens for task updates')
suite.contains(
  generation,
  /syncEngineStatus/,
  'Generation polls engine status after missed updates'
)
suite.contains(generation, /cacheCompletedTaskResult/, 'Generation caches completed remote results')
suite.contains(workflow, /updatePreviewFromTask/, 'Workflow writes task result previews to nodes')
suite.contains(
  canvasTools,
  /CANVAS_CLEAR_CONFIRM_TOKEN[\s\S]*confirm !== CANVAS_CLEAR_CONFIRM_TOKEN[\s\S]*state\.setNodes\(\[\]\)/,
  'Clear canvas tool requires explicit confirmation token'
)
suite.contains(
  toolDefinitions,
  /name:\s*'clear_canvas'[\s\S]*required:\s*\['confirm'\]/,
  'Clear canvas tool schema requires confirmation'
)
suite.contains(
  chatManager,
  /guardDangerousToolCall[\s\S]*fnName !== 'clear_canvas'[\s\S]*CLEAR_CANVAS_REQUEST_RE/,
  'Chat tool runner guards accidental clear_canvas calls'
)
suite.contains(
  canvasSlice,
  /Blocked ReactFlow remove-all change/,
  'Canvas blocks unexpected ReactFlow remove-all changes'
)
suite.contains(
  appShortcuts,
  /确定删除画布上的全部/,
  'Deleting all selected nodes requires confirmation'
)
suite.contains(
  executor,
  /const seedanceFps = framesPerSecond \|\| framespersecond/,
  'Seedance FPS is available to retry branches'
)

suite.summarize()
