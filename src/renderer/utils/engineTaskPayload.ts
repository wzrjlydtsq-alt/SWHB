import { useAppStore } from '../store/useAppStore.ts'

export function withCurrentProjectTaskPayload(payload: Record<string, any> = {}) {
  const currentProject = useAppStore.getState().currentProject

  return {
    ...payload,
    projectId: payload.projectId || currentProject?.id || null,
    projectName: payload.projectName || currentProject?.name || null
  }
}
