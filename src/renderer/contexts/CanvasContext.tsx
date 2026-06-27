import { createContext, useContext } from 'react'

export const CanvasContext = createContext(null)

export function useCanvasContext() {
  const context = useContext(CanvasContext)
  if (!context) {
    throw new Error('useCanvasContext must be used within a CanvasContext.Provider')
  }
  return context
}
