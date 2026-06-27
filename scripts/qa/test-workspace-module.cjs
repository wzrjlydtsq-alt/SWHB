#!/usr/bin/env node

const { createSuite } = require('./module-test-utils.cjs')

const suite = createSuite('Workspace module')

const appLayout = 'src/renderer/components/AppLayout.tsx'
const workspace = 'src/renderer/features/workspace/WorkspaceHome.tsx'
const preload = 'src/preload/index.js'
const ipc = 'src/main/ipcHandlers.js'

suite.fileExists(workspace)
suite.contains(
  appLayout,
  /page:\s*'assistant'.*label:\s*'Workspace'/,
  'Workspace nav item is registered'
)
suite.contains(
  appLayout,
  /<WorkspaceHome[\s\S]*handleLoadFromHistory=/,
  'WorkspaceHome is mounted with project loader'
)
suite.contains(workspace, /WORKSPACE_FOLDERS_KEY/, 'Workspace persists folders')
suite.contains(workspace, /WORKSPACE_FILES_KEY/, 'Workspace persists files')
suite.contains(workspace, /WORKSPACE_AUDIT_LOG_KEY/, 'Workspace persists audit log')
suite.contains(workspace, /WORKSPACE_PENDING_OPS_KEY/, 'Workspace persists pending operations')
suite.contains(workspace, /WORKSPACE_TASKS_KEY/, 'Workspace persists task center')
suite.contains(workspace, /WORKSPACE_BROWSER_TARGETS_KEY/, 'Workspace persists browser targets')
suite.contains(workspace, /saveWorkspaceMessages/, 'Workspace saves chat messages per file')
suite.contains(workspace, /saveWorkspaceMaterials/, 'Workspace saves attached materials per file')
suite.contains(workspace, /appendAudit/, 'Workspace records audit entries')
suite.contains(workspace, /updateWorkspaceTasks/, 'Workspace updates task list')
suite.contains(
  workspace,
  /window\.api\?\.fsAPI\?\.writeTextFile/,
  'Workspace can write files through IPC'
)
suite.contains(
  workspace,
  /window\.api\?\.fsAPI\?\.copyPath/,
  'Workspace can copy files through IPC'
)
suite.contains(
  workspace,
  /window\.api\?\.fsAPI\?\.movePath/,
  'Workspace can move files through IPC'
)
suite.contains(
  workspace,
  /window\.api\?\.fsAPI\?\.deletePath/,
  'Workspace can delete files through IPC'
)
suite.contains(
  workspace,
  /window\.api\?\.fsAPI\?\.runCommand/,
  'Workspace can request command execution'
)
suite.contains(
  workspace,
  /window\.api\?\.terminalAPI\?\.start/,
  'Workspace can start terminal sessions'
)
suite.contains(preload, /fsAPI:\s*{[\s\S]*writeTextFile/, 'Preload exposes fsAPI')
suite.contains(preload, /terminalAPI:\s*{[\s\S]*start:/, 'Preload exposes terminalAPI')
suite.contains(
  ipc,
  /'fs:write-text-file'[\s\S]*fs\.writeFileSync/,
  'Main process handles fs writes'
)
suite.contains(ipc, /ipcMain\.handle\('terminal:start'/, 'Main process handles terminal start')
suite.contains(workspace, /setCloudAssetsOpen/, 'Workspace can open cloud assets')
suite.contains(workspace, /slice\(0,\s*200\)/, 'Audit log has a cap')
suite.contains(workspace, /slice\(0,\s*100\)/, 'Task list has a cap')

suite.summarize()
