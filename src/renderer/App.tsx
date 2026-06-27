/**
 * 星河智绘 (Xinghe Zhihui)
 * 开发者: 郭瑞凡 (Guo Ruifan)
 * 最早开发时间: 2026-03-20
 */
import { useEffect } from 'react'
import { useAppInit } from './hooks/useAppInit.ts'

import { ProjectProvider } from './contexts/ProjectContext.tsx'
import { CanvasOperationsProvider } from './contexts/CanvasOperationsContext.tsx'
import { AppLayout } from './components/AppLayout.tsx'

function App() {
  useAppInit()

  useEffect(() => {
    document.documentElement.classList.add('theme-dark')
  }, [])

  return (
    <ProjectProvider>
      <CanvasOperationsProvider>
        <AppLayout />
      </CanvasOperationsProvider>
    </ProjectProvider>
  )
}

export default App
