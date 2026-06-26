import { useAppStore } from '../store/useAppStore.ts'

export function getProjectCacheContext() {
  const project = useAppStore.getState().currentProject
  return {
    projectId: project?.id || null,
    cacheRoot: project?.cacheRoot || project?.cachePath || null
  }
}

export function withProjectCacheContext(payload = {}) {
  return {
    ...payload,
    ...getProjectCacheContext()
  }
}
