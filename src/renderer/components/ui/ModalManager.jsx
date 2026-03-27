import { lazy, Suspense } from 'react'
import { Lightbox } from './Lightbox.jsx'

// 懒加载弹窗组件 — 只在打开时才下载
const CreateCharacterModal = lazy(() =>
  import('./modals/CreateCharacterModal.jsx').then((m) => ({
    default: m.CreateCharacterModal
  }))
)
const ProjectListModal = lazy(() =>
  import('./modals/ProjectListModal.jsx').then((m) => ({
    default: m.ProjectListModal
  }))
)
const SettingsModal = lazy(() =>
  import('./modals/SettingsModal.jsx').then((m) => ({
    default: m.SettingsModal
  }))
)
const BatchModal = lazy(() =>
  import('./modals/BatchModal.jsx').then((m) => ({
    default: m.BatchModal
  }))
)

/**
 * ModalManager — 弹窗调度器
 * 各弹窗实现已拆分到 ./modals/ 目录下的独立组件
 * 使用 React.lazy 懒加载，只在打开弹窗时才下载代码
 */
export function ModalManager({
  apiConfigs,
  settingsOpen,
  setSettingsOpen,
  globalApiKey,
  setGlobalApiKey,
  globalApiUrl,
  setGlobalApiUrl,
  jimengSessionId,
  setJimengSessionId,
  jimengUseLocalFile,
  setJimengUseLocalFile,
  deleteApiConfig,
  updateApiConfig,
  testApiConnection,
  apiTesting,
  apiStatus,
  addNewModel,
  getStatusColor,
  batchModalOpen,
  setBatchModalOpen,
  batchSelectedIds,
  setBatchSelectedIds,
  history,
  setHistory,
  addNode,
  getImageDimensions,
  isVideoUrl,
  screenToWorld,
  setLightboxItem,
  projectListOpen,
  setProjectListOpen,
  projects,
  handleLoadFromHistory,
  handleDeleteHistoryProject,
  handleSaveAndCreateNew,
  lightboxItem,
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
  createCharacter,
  historyMap
}) {
  return (
    <Suspense fallback={null}>
      {createCharacterOpen && (
        <CreateCharacterModal
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
          history={history}
          apiConfigs={apiConfigs}
        />
      )}

      <Lightbox
        item={lightboxItem}
        onClose={() => setLightboxItem(null)}
        onNavigate={(newIndex) => {
          if (
            lightboxItem &&
            lightboxItem.mjImages &&
            lightboxItem.mjImages.length > newIndex &&
            newIndex >= 0
          ) {
            const validIndex = Math.max(0, Math.min(newIndex, lightboxItem.mjImages.length - 1))
            setHistory((prev) =>
              prev.map((hItem) =>
                hItem.id === lightboxItem.id
                  ? {
                      ...hItem,
                      url: lightboxItem.mjImages[validIndex],
                      selectedMjImageIndex: validIndex
                    }
                  : hItem
              )
            )
            setLightboxItem({
              ...lightboxItem,
              url: lightboxItem.mjImages[validIndex],
              selectedMjImageIndex: validIndex
            })
          }
        }}
      />

      {projectListOpen && (
        <ProjectListModal
          projectListOpen={projectListOpen}
          setProjectListOpen={setProjectListOpen}
          projects={projects}
          handleLoadFromHistory={handleLoadFromHistory}
          handleDeleteHistoryProject={handleDeleteHistoryProject}
          handleSaveAndCreateNew={handleSaveAndCreateNew}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          settingsOpen={settingsOpen}
          setSettingsOpen={setSettingsOpen}
          apiConfigs={apiConfigs}
          globalApiKey={globalApiKey}
          setGlobalApiKey={setGlobalApiKey}
          globalApiUrl={globalApiUrl}
          setGlobalApiUrl={setGlobalApiUrl}
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
        />
      )}

      {batchModalOpen && (
        <BatchModal
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
          setLightboxItem={setLightboxItem}
        />
      )}
    </Suspense>
  )
}
