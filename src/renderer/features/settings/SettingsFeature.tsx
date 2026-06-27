import { useEffect, useMemo } from 'react'
import { useApiConfigManager } from '../../hooks/useApiConfigManager.ts'
import { ModalManager } from '../../components/ui/ModalManager.tsx'
import { getImageDimensions } from '../../utils/fileHelpers.ts'
import { isVideoUrl } from '../../utils/projectUtils.ts'
import { useAppStore } from '../../store/useAppStore.ts'

export function SettingsFeature({
  theme,
  apiConfigs,
  setApiConfigs,
  settingsOpen,
  setSettingsOpen,
  chatApiKey,
  imageApiKey,
  videoApiKey,
  jimengSessionId,
  setJimengSessionId,
  jimengUseLocalFile,
  setJimengUseLocalFile,
  apiConfigsMap,
  globalApiKey,
  batchModalOpen,
  setBatchModalOpen,
  batchSelectedIds,
  setBatchSelectedIds,
  addNode,
  screenToWorld,
  handleSplitGridFromUrl,
  projectListOpen,
  setProjectListOpen,
  projects,
  handleLoadFromHistory,
  handleDeleteHistoryProject,
  handleSaveAndCreateNew,
  createCharacterOpen,
  setCreateCharacterOpen,
  createCharacterVideoSourceType,
  setCreateCharacterVideoSourceType,
  createCharacterVideoUrl,
  setCreateCharacterVideoUrl,
  createCharacterSelectedTaskId,
  setCreateCharacterSelectedTaskId,
  createCharacterHistoryDropdownOpen,
  setCreateCharacterHistoryDropdownOpen,
  createCharacterStartSecond,
  setCreateCharacterStartSecond,
  createCharacterEndSecond,
  setCreateCharacterEndSecond,
  createCharacterEndpoint,
  setCreateCharacterEndpoint,
  createCharacterSubmitting,
  setCreateCharacterSubmitting,
  createCharacterVideoError,
  setCreateCharacterVideoError,
  createCharacter
}: any) {
  const history = useAppStore((state) => state.history)
  const setHistory = useAppStore((state) => state.setHistory)
  const setActiveDropdown = useAppStore((state) => state.setActiveDropdown)
  const historyMap = useMemo(() => {
    const map = new Map()
    for (const item of history || []) map.set(item.id, item)
    return map
  }, [history])

  useEffect(() => {
    if (settingsOpen) setActiveDropdown(null)
  }, [settingsOpen, setActiveDropdown])

  const {
    apiTesting,
    apiStatus,
    addNewModel,
    updateApiConfig,
    deleteApiConfig,
    testApiConnection,
    getStatusColor
  } = useApiConfigManager({
    apiConfigs,
    setApiConfigs,
    apiConfigsMap,
    globalApiKey
  })

  return (
    <ModalManager
      theme={theme}
      apiConfigs={apiConfigs}
      setApiConfigs={setApiConfigs}
      settingsOpen={settingsOpen}
      setSettingsOpen={setSettingsOpen}
      chatApiKey={chatApiKey}
      imageApiKey={imageApiKey}
      videoApiKey={videoApiKey}
      jimengSessionId={jimengSessionId}
      setJimengSessionId={setJimengSessionId}
      jimengUseLocalFile={jimengUseLocalFile}
      setJimengUseLocalFile={setJimengUseLocalFile}
      deleteApiConfig={deleteApiConfig}
      updateApiConfig={updateApiConfig}
      testApiConnection={testApiConnection}
      apiTesting={apiTesting}
      apiStatus={apiStatus}
      addNewModel={addNewModel}
      getStatusColor={getStatusColor}
      batchModalOpen={batchModalOpen}
      setBatchModalOpen={setBatchModalOpen}
      batchSelectedIds={batchSelectedIds}
      setBatchSelectedIds={setBatchSelectedIds}
      history={history}
      setHistory={setHistory}
      addNode={addNode}
      getImageDimensions={getImageDimensions}
      isVideoUrl={isVideoUrl}
      screenToWorld={screenToWorld}
      setLightboxItem={() => {}}
      handleSplitGridFromUrl={handleSplitGridFromUrl}
      projectListOpen={projectListOpen}
      setProjectListOpen={setProjectListOpen}
      projects={projects}
      handleLoadFromHistory={handleLoadFromHistory}
      handleDeleteHistoryProject={handleDeleteHistoryProject}
      handleSaveAndCreateNew={handleSaveAndCreateNew}
      lightboxItem={null}
      createCharacterOpen={createCharacterOpen}
      setCreateCharacterOpen={setCreateCharacterOpen}
      createCharacterVideoSourceType={createCharacterVideoSourceType}
      setCreateCharacterVideoSourceType={setCreateCharacterVideoSourceType}
      createCharacterVideoUrl={createCharacterVideoUrl}
      setCreateCharacterVideoUrl={setCreateCharacterVideoUrl}
      createCharacterSelectedTaskId={createCharacterSelectedTaskId}
      setCreateCharacterSelectedTaskId={setCreateCharacterSelectedTaskId}
      createCharacterHistoryDropdownOpen={createCharacterHistoryDropdownOpen}
      setCreateCharacterHistoryDropdownOpen={setCreateCharacterHistoryDropdownOpen}
      createCharacterStartSecond={createCharacterStartSecond}
      setCreateCharacterStartSecond={setCreateCharacterStartSecond}
      createCharacterEndSecond={createCharacterEndSecond}
      setCreateCharacterEndSecond={setCreateCharacterEndSecond}
      createCharacterEndpoint={createCharacterEndpoint}
      setCreateCharacterEndpoint={setCreateCharacterEndpoint}
      createCharacterSubmitting={createCharacterSubmitting}
      setCreateCharacterSubmitting={setCreateCharacterSubmitting}
      createCharacterVideoError={createCharacterVideoError}
      setCreateCharacterVideoError={setCreateCharacterVideoError}
      createCharacter={createCharacter}
      historyMap={historyMap}
    />
  )
}
