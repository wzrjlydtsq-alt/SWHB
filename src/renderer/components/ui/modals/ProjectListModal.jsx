import { Trash2 } from '../../../utils/icons.jsx'
import { Modal } from '../Modal.jsx'

export function ProjectListModal({
  projectListOpen,
  setProjectListOpen,
  projects,
  handleLoadFromHistory,
  handleDeleteHistoryProject
}) {
  return (
    <Modal isOpen={projectListOpen} onClose={() => setProjectListOpen(false)} title="项目管理">
      <div className="p-4 space-y-3">
        {projects.length === 0 ? (
          <div className="text-center py-8 text-[var(--text-muted)]">暂无历史项目</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
            {projects.map((project) => (
              <div
                key={project.id}
                className="p-3 rounded-lg border group relative flex flex-col gap-2 bg-[var(--bg-secondary)] border-[var(--border-color)] hover:brightness-125"
              >
                <div className="font-medium text-sm truncate" title={project.name}>
                  {project.name}
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">
                  {new Date(project.updatedAt).toLocaleString()}
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => handleLoadFromHistory(project, setProjectListOpen)}
                    className="flex-1 px-2 py-1.5 rounded bg-[var(--primary-color)] text-white text-xs hover:brightness-110 transition-colors"
                  >
                    加载
                  </button>
                  <button
                    onClick={() => handleDeleteHistoryProject(project.id)}
                    className="px-2 py-1.5 rounded text-xs transition-colors bg-[var(--bg-panel)] text-[var(--text-muted)] hover:text-red-400 hover:brightness-125"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
