import { useEffect } from 'react'

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

    window.addEventListener('pointermove', handleGlobalPointerMove, {
      capture: true,
      passive: false
    })
    window.addEventListener('pointerup', handleGlobalPointerUp, { capture: true, passive: false })
    window.addEventListener('mousemove', handleGlobalMouseMove, { capture: true, passive: false })
    window.addEventListener('mouseup', handleGlobalMouseUp, { capture: true, passive: false })

    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove, { capture: true })
      window.removeEventListener('pointerup', handleGlobalPointerUp, { capture: true })
      window.removeEventListener('mousemove', handleGlobalMouseMove, { capture: true })
      window.removeEventListener('mouseup', handleGlobalMouseUp, { capture: true })
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
