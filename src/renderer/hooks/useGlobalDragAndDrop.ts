import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore.ts'

export const useGlobalDragAndDrop = ({
  isPanning,
  isPanningRef,
  isDragging,
  dragNodeId,
  resizingNodeId,
  isSelecting,
  isSelectingRef,
  connectingSource,
  connectingTarget,
  handleMouseMove,
  handleMouseUp,
  canvasRef
}) => {
  useEffect(() => {
    const isInteracting =
      isPanning ||
      isPanningRef.current ||
      isDragging ||
      dragNodeId ||
      resizingNodeId ||
      isSelecting ||
      isSelectingRef.current ||
      connectingSource ||
      connectingTarget

    if (!isInteracting) return

    const handleGlobalPointerMove = (e) => {
      if (e.movementX === undefined) {
        e.movementX = 0
      }
      if (e.movementY === undefined) {
        e.movementY = 0
      }
      handleMouseMove(e, canvasRef)
    }

    const handleGlobalMouseMove = (e) => {
      handleMouseMove(e, canvasRef)
    }

    const handleGlobalPointerUp = () => {
      handleMouseUp()
    }

    const handleGlobalMouseUp = () => {
      handleMouseUp()
    }

    const resetInteractionState = () => {
      handleMouseUp()
      const state = useAppStore.getState()
      state.setIsPanning(false)
      state.setIsDragging(false)
      state.setDragNodeId(null)
      state.setResizingNodeId(null)
      state.setIsSelecting(false)
      state.setSelectionBox(null)
      state.setConnectingSource(null)
      state.setConnectingTarget(null)
      state.setConnectingInputType(null)
      state.setHoverTargetId(null)
      isPanningRef.current = false
      isSelectingRef.current = false
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        resetInteractionState()
      }
    }

    const supportsPointerEvents = typeof window !== 'undefined' && 'PointerEvent' in window
    if (supportsPointerEvents) {
      window.addEventListener('pointermove', handleGlobalPointerMove, {
        capture: true,
        passive: false
      })
      window.addEventListener('pointerup', handleGlobalPointerUp, { capture: true, passive: false })
    } else {
      window.addEventListener('mousemove', handleGlobalMouseMove, { capture: true, passive: false })
      window.addEventListener('mouseup', handleGlobalMouseUp, { capture: true, passive: false })
    }
    window.addEventListener('blur', resetInteractionState, { capture: true })
    window.addEventListener('dragend', resetInteractionState, { capture: true })
    window.addEventListener('drop', resetInteractionState, { capture: true })
    window.addEventListener('lostpointercapture', resetInteractionState, { capture: true })
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (supportsPointerEvents) {
        window.removeEventListener('pointermove', handleGlobalPointerMove, { capture: true })
        window.removeEventListener('pointerup', handleGlobalPointerUp, { capture: true })
      } else {
        window.removeEventListener('mousemove', handleGlobalMouseMove, { capture: true })
        window.removeEventListener('mouseup', handleGlobalMouseUp, { capture: true })
      }
      window.removeEventListener('blur', resetInteractionState, { capture: true })
      window.removeEventListener('dragend', resetInteractionState, { capture: true })
      window.removeEventListener('drop', resetInteractionState, { capture: true })
      window.removeEventListener('lostpointercapture', resetInteractionState, { capture: true })
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [
    isPanning,
    isDragging,
    dragNodeId,
    resizingNodeId,
    isSelecting,
    connectingSource,
    connectingTarget,
    handleMouseMove,
    handleMouseUp,
    isPanningRef,
    isSelectingRef,
    canvasRef
  ])
}
