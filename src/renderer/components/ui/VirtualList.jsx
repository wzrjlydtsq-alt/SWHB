import { memo, useRef, useState, useCallback } from 'react'

export const VirtualList = memo(
  ({
    items,
    itemHeight = 200,
    containerHeight = 500,
    renderItem,
    overscan = 2,
    className = ''
  }) => {
    const containerRef = useRef(null)
    const [scrollTop, setScrollTop] = useState(0)

    const totalHeight = items.length * itemHeight
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
    const endIndex = Math.min(
      items.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    )

    const visibleItems = []
    for (let i = startIndex; i <= endIndex; i++) {
      visibleItems.push({
        item: items[i],
        index: i,
        style: {
          position: 'absolute',
          top: i * itemHeight,
          left: 0,
          right: 0,
          height: itemHeight
        }
      })
    }

    const handleScroll = useCallback((e) => {
      setScrollTop(e.target.scrollTop)
    }, [])

    return (
      <div
        ref={containerRef}
        className={className}
        style={{ overflow: 'auto', height: containerHeight }}
        onScroll={handleScroll}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          {visibleItems.map(({ item, index, style }) => (
            <div key={item.id || index} style={style}>
              {renderItem(item, index)}
            </div>
          ))}
        </div>
      </div>
    )
  }
)

VirtualList.displayName = 'VirtualList'
