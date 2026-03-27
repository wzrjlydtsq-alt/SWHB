import React, { useState, memo } from 'react'
import { Plus, X, Music, LinkIcon } from '../../../utils/icons.jsx'
import { getXingheMediaSrc } from '../../../utils/fileHelpers.js'

/**
 * GenMediaPanel — 参考图/音频/首尾帧/AssetID 管理
 * 从 GenNode 中提取，减少 GenNode 体积
 */
export const GenMediaPanel = memo(function GenMediaPanel({
  nodeId,
  nodeType,
  connectedImages,
  manualImages,
  manualAudios,
  connectedAudios,
  assetIds,
  // 首尾帧 (仅 gen-video)
  showFrames,
  startFrame,
  endFrame,
  // callbacks
  updateNodeSettings,
  setLightboxItem,
  // 仅 gen-video seedance
  showSourceVideos,
  sourceVideosText
}) {
  const [assetIdInput, setAssetIdInput] = useState(null)
  const [localSourceVideos, setLocalSourceVideos] = useState(sourceVideosText || '')

  // ========== 通用拖拽处理 ==========
  const imageDropHandlers = {
    onDragEnter: (e) => { e.preventDefault(); e.stopPropagation() },
    onDragOver: (e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy' },
    onDrop: async (e) => {
      e.preventDefault()
      e.stopPropagation()
      const folderPaths = e.dataTransfer.getData('asset-paths')
      const assetPath = e.dataTransfer.getData('asset-path')
      if (folderPaths) {
        try {
          const paths = JSON.parse(folderPaths)
          const prev = manualImages || []
          const newPaths = paths.filter((p) => !prev.includes(p))
          if (newPaths.length > 0) {
            updateNodeSettings(nodeId, { manualImages: [...prev, ...newPaths] })
          }
        } catch { /* ignore */ }
      } else if (assetPath) {
        const prev = manualImages || []
        if (!prev.includes(assetPath)) {
          updateNodeSettings(nodeId, { manualImages: [...prev, assetPath] })
        }
      } else if (e.dataTransfer.files?.length > 0) {
        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']
        const prev = manualImages || []
        const newPaths = []
        const files = Array.from(e.dataTransfer.files)
        
        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          const name = file.name || 'unknown'
          const ext = name.split('.').pop()?.toLowerCase() || ''
          
          if (!imageExts.includes(ext)) continue
          
          let finalPath = null
          
          try {
            if (file.path) {
              const res = await window.api.invoke('cache:copy-file', {
                id: `ref_${Date.now()}_${i}`,
                sourcePath: file.path,
                category: 'gen_ref',
                type: 'image'
              })
              if (res?.success && res.path) finalPath = res.path
            }
            
            if (!finalPath) {
              const base64 = await new Promise((res, rej) => {
                const reader = new FileReader()
                reader.onload = (ev) => res(ev.target.result)
                reader.onerror = rej
                reader.readAsDataURL(file)
              })
              const res = await window.api.localCacheAPI.saveCache({
                id: `ref_${Date.now()}_${i}`,
                content: base64,
                category: 'gen_ref',
                ext: `.${ext}`,
                type: 'image'
              })
              if (res?.success && res.path) finalPath = res.path
            }
          } catch (err) {
            console.error('[GenMedia] 处理参考图异常:', name, err)
            continue
          }
          
          if (finalPath && !prev.includes(finalPath) && !newPaths.includes(finalPath)) {
            newPaths.push(finalPath)
          }
        }
        
        if (newPaths.length > 0) {
          updateNodeSettings(nodeId, { manualImages: [...prev, ...newPaths] })
        }
      }
    }
  }

  return (
    <>
      {/* 音频引用区域 (仅 gen-video) */}
      {nodeType === 'gen-video' && (
        <div
          className="nodrag flex items-center gap-1.5 px-3 pb-2 border-t border-[var(--border-color)] pt-2 flex-wrap"
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation() }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy' }}
          onDrop={async (e) => {
            e.preventDefault()
            e.stopPropagation()
            const assetPath = e.dataTransfer.getData('asset-path')
            const assetType = e.dataTransfer.getData('asset-type')
            
            // 资产库拖入
            if (assetPath && assetType?.startsWith('audio/')) {
              const prev = manualAudios || []
              if (!prev.includes(assetPath)) {
                updateNodeSettings(nodeId, { manualAudios: [...prev, assetPath] })
              }
              return
            }
            
            // OS 外部文件拖入
            if (e.dataTransfer.files?.length > 0) {
              const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a']
              const prev = manualAudios || []
              const newPaths = []
              const files = Array.from(e.dataTransfer.files)
              
              for (let i = 0; i < files.length; i++) {
                const file = files[i]
                const name = file.name || 'unknown'
                const ext = name.split('.').pop()?.toLowerCase() || ''
                
                if (!audioExts.includes(ext)) continue
                
                let finalPath = null
                try {
                  if (file.path) {
                    const res = await window.api.invoke('cache:copy-file', {
                      id: `ref_aud_${Date.now()}_${i}`,
                      sourcePath: file.path,
                      category: 'gen_ref',
                      type: 'audio'
                    })
                    if (res?.success && res.path) finalPath = res.path
                  }
                  if (!finalPath) {
                    const base64 = await new Promise((res, rej) => {
                      const reader = new FileReader()
                      reader.onload = (ev) => res(ev.target.result)
                      reader.onerror = rej
                      reader.readAsDataURL(file)
                    })
                    const res = await window.api.localCacheAPI.saveCache({
                      id: `ref_aud_${Date.now()}_${i}`,
                      content: base64,
                      category: 'gen_ref',
                      ext: `.${ext}`,
                      type: 'audio'
                    })
                    if (res?.success && res.path) finalPath = res.path
                  }
                } catch (err) {
                  console.error('[GenMedia] 处理参考音频异常:', name, err)
                  continue
                }
                
                if (finalPath && !prev.includes(finalPath) && !newPaths.includes(finalPath)) {
                  newPaths.push(finalPath)
                }
              }
              
              if (newPaths.length > 0) {
                updateNodeSettings(nodeId, { manualAudios: [...prev, ...newPaths] })
              }
            }
          }}
        >
          <Music size={10} className="text-emerald-400 shrink-0 opacity-60" />
          {(connectedAudios || []).map((_, idx) => (
            <div
              key={`ca-${idx}`}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[9px] text-emerald-400 pointer-events-none"
            >
              <Music size={8} />
              <span>音频{idx + 1}</span>
            </div>
          ))}
          {(manualAudios || []).map((audioPath, idx) => (
            <div
              key={`ma-${idx}`}
              className="relative flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[9px] text-emerald-400"
            >
              <Music size={8} />
              <span className="max-w-[60px] truncate">{audioPath.split(/[\\/]/).pop()}</span>
              <span
                className="ml-0.5 w-3 h-3 rounded-full bg-black/70 text-white flex items-center justify-center cursor-pointer hover:bg-red-500 transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  updateNodeSettings(nodeId, {
                    manualAudios: (manualAudios || []).filter((_, i) => i !== idx)
                  })
                }}
              >
                <X size={6} />
              </span>
            </div>
          ))}
          <div
            className="w-6 h-6 border border-dashed border-emerald-500/30 flex items-center justify-center shrink-0 rounded hover:border-emerald-500 hover:bg-emerald-500/5 transition-colors cursor-pointer pointer-events-auto"
            onClick={async (e) => {
              e.stopPropagation()
              const result = await window.api.localCacheAPI.openFiles({
                filters: [{ name: '音频', extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'] }],
                multiple: true
              })
              if (result.success && result.paths?.length) {
                const prev = manualAudios || []
                updateNodeSettings(nodeId, { manualAudios: [...prev, ...result.paths] })
              }
            }}
          >
            <Plus size={10} className="text-emerald-400/50 pointer-events-none" />
          </div>
        </div>
      )}

      {/* 参考图区域 */}
      <div
        className="nodrag flex items-center gap-1.5 px-3 pb-2 border-t border-[var(--border-color)] pt-2 flex-wrap"
        {...imageDropHandlers}
      >
        {(connectedImages || []).map((imgSrc, idx) => (
          <div
            key={`c-${idx}`}
            className="w-8 h-8 overflow-hidden border border-[var(--border-color)] shrink-0 shadow-sm relative pointer-events-auto cursor-pointer"
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (setLightboxItem) setLightboxItem({ type: 'image', url: getXingheMediaSrc(imgSrc) })
            }}
          >
            {nodeType === 'gen-image' && (
              <span
                className="absolute -top-1 -left-1 w-3.5 h-3.5 text-[8px] font-semibold rounded-full bg-[var(--bg-secondary)] text-[var(--text-primary)] select-none flex items-center justify-center border border-[var(--border-color)] shadow-sm leading-none pointer-events-none"
                style={{ zIndex: 30 }}
              >
                {idx + 1}
              </span>
            )}
            <img src={getXingheMediaSrc(imgSrc)} draggable={false} className="w-full h-full object-cover" />
          </div>
        ))}
        {(manualImages || []).map((imgPath, idx) => (
          <div
            key={`m-${idx}`}
            className="relative w-8 h-8 overflow-hidden border border-[var(--border-color)] shrink-0 shadow-sm pointer-events-auto cursor-pointer"
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (setLightboxItem) setLightboxItem({ type: 'image', url: getXingheMediaSrc(imgPath) })
            }}
          >
            <img src={getXingheMediaSrc(imgPath)} draggable={false} className="w-full h-full object-cover" />
            <span
              className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-black/70 text-white flex items-center justify-center cursor-pointer pointer-events-auto"
              onClick={(e) => {
                e.stopPropagation()
                updateNodeSettings(nodeId, {
                  manualImages: (manualImages || []).filter((_, i) => i !== idx)
                })
              }}
            >
              <X size={8} />
            </span>
          </div>
        ))}
        {/* 添加图片按钮 */}
        <div
          className="w-8 h-8 border border-dashed border-[var(--border-color)] flex items-center justify-center shrink-0 hover:border-[var(--primary-color)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer pointer-events-auto"
          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation() }}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy' }}
          onClick={async (e) => {
            e.stopPropagation()
            const result = await window.api.localCacheAPI.openFiles({
              filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
              multiple: true
            })
            if (result.success && result.paths?.length) {
              const prev = manualImages || []
              updateNodeSettings(nodeId, { manualImages: [...prev, ...result.paths] })
            }
          }}
        >
          <Plus size={14} className="text-[var(--text-muted)] pointer-events-none" />
        </div>
        {/* Asset ID 标签 */}
        {(assetIds || []).map((assetId, idx) => (
          <div
            key={`asset-${idx}`}
            className="relative flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-[9px] text-blue-400 max-w-[100px] pointer-events-auto"
            title={assetId}
          >
            <LinkIcon size={8} className="shrink-0" />
            <span className="truncate">{assetId.replace('asset-', '')}</span>
            <span
              className="ml-0.5 w-3 h-3 rounded-full bg-black/70 text-white flex items-center justify-center cursor-pointer hover:bg-red-500 transition-colors shrink-0"
              onClick={(e) => {
                e.stopPropagation()
                updateNodeSettings(nodeId, { assetIds: (assetIds || []).filter((_, i) => i !== idx) })
              }}
            >
              <X size={6} />
            </span>
          </div>
        ))}
        {/* 添加 Asset ID */}
        {assetIdInput !== null ? (
          <input
            autoFocus
            type="text"
            placeholder="asset-xxxxx"
            value={assetIdInput}
            onChange={(e) => setAssetIdInput(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') {
                const val = assetIdInput.trim()
                if (val) {
                  const id = val.startsWith('asset-') ? val : `asset-${val}`
                  const prev = assetIds || []
                  if (!prev.includes(id)) updateNodeSettings(nodeId, { assetIds: [...prev, id] })
                }
                setAssetIdInput(null)
              } else if (e.key === 'Escape') {
                setAssetIdInput(null)
              }
            }}
            onBlur={() => {
              const val = (assetIdInput || '').trim()
              if (val) {
                const id = val.startsWith('asset-') ? val : `asset-${val}`
                const prev = assetIds || []
                if (!prev.includes(id)) updateNodeSettings(nodeId, { assetIds: [...prev, id] })
              }
              setAssetIdInput(null)
            }}
            className="nodrag w-24 h-6 px-1.5 text-[9px] rounded border border-blue-500/40 bg-[var(--bg-secondary)] text-blue-400 outline-none focus:border-blue-500 pointer-events-auto"
          />
        ) : (
          <div
            className="w-8 h-8 border border-dashed border-blue-500/30 flex items-center justify-center shrink-0 hover:border-blue-500 hover:bg-blue-500/5 transition-colors cursor-pointer pointer-events-auto"
            title="添加素材 Asset ID"
            onClick={(e) => { e.stopPropagation(); setAssetIdInput('') }}
          >
            <LinkIcon size={12} className="text-blue-400/50 pointer-events-none" />
          </div>
        )}
      </div>

      {/* 首尾帧区域 (仅 gen-video + veo/seedance) */}
      {showFrames && (
        <FramesPanel
          nodeId={nodeId}
          startFrame={startFrame}
          endFrame={endFrame}
          updateNodeSettings={updateNodeSettings}
          setLightboxItem={setLightboxItem}
        />
      )}

      {/* Seedance 参考视频 URL */}
      {showSourceVideos && (
        <div className="px-3 pb-2">
          <input
            type="text"
            placeholder="参考视频 URL（换行分隔）"
            className="nodrag w-full bg-[var(--bg-panel)] text-[10px] font-mono outline-none text-[var(--text-primary)] placeholder-[var(--text-muted)] px-2 py-1.5 rounded border border-[var(--border-color)] focus:border-[var(--primary-color)]/50 transition-colors"
            value={localSourceVideos}
            onChange={(e) => {
              setLocalSourceVideos(e.target.value)
              updateNodeSettings(nodeId, { sourceVideosText: e.target.value })
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
})

/**
 * FramesPanel — 首帧/尾帧选择区域
 */
const FramesPanel = memo(function FramesPanel({
  nodeId,
  startFrame,
  endFrame,
  updateNodeSettings,
  setLightboxItem
}) {
  const frameDragHandlers = {
    onDragEnter: (e) => { e.preventDefault(); e.stopPropagation() },
    onDragOver: (e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy' }
  }

  const handleFrameDrop = (field) => async (e) => {
    e.preventDefault()
    e.stopPropagation()
    const assetPath = e.dataTransfer.getData('asset-path')
    if (assetPath) {
      updateNodeSettings(nodeId, { [field]: assetPath })
      return
    }
    
    // OS 外部文件拖入首尾帧
    if (e.dataTransfer.files?.length > 0) {
      const file = e.dataTransfer.files[0]
      if (!file) return
      
      const name = file.name || 'unknown'
      const ext = name.split('.').pop()?.toLowerCase() || ''
      const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']
      
      if (!imageExts.includes(ext)) return
      
      let finalPath = null
      try {
        if (file.path) {
          const res = await window.api.invoke('cache:copy-file', {
            id: `frame_${Date.now()}`,
            sourcePath: file.path,
            category: 'gen_frame',
            type: 'image'
          })
          if (res?.success && res.path) finalPath = res.path
        }
        
        if (!finalPath) {
          const base64 = await new Promise((res, rej) => {
            const reader = new FileReader()
            reader.onload = (ev) => res(ev.target.result)
            reader.onerror = rej
            reader.readAsDataURL(file)
          })
          const res = await window.api.localCacheAPI.saveCache({
            id: `frame_${Date.now()}`,
            content: base64,
            category: 'gen_frame',
            ext: `.${ext}`,
            type: 'image'
          })
          if (res?.success && res.path) finalPath = res.path
        }
      } catch (err) {
        console.error('[GenMedia] 处理首尾帧异常:', name, err)
      }
      
      if (finalPath) {
        updateNodeSettings(nodeId, { [field]: finalPath })
      }
    }
  }

  const handleFrameClick = (field, currentValue) => async (e) => {
    e.stopPropagation()
    if (currentValue) return
    const result = await window.api.localCacheAPI.openFiles({
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
      multiple: false
    })
    if (result.success && result.paths?.length) {
      updateNodeSettings(nodeId, { [field]: result.paths[0] })
    }
  }

  const renderFrame = (frame, field, label) => (
    <div className="flex-1">
      <div
        className={`h-14 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden cursor-pointer hover:border-[var(--primary-color)] transition-colors pointer-events-auto ${frame ? 'border-[var(--primary-color)]' : 'border-[var(--border-color)]'}`}
        {...frameDragHandlers}
        onDrop={handleFrameDrop(field)}
        onClick={handleFrameClick(field, frame)}
      >
        {frame ? (
          <div
            className="relative w-full h-full cursor-pointer"
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (setLightboxItem) setLightboxItem({ type: 'image', url: getXingheMediaSrc(frame) })
            }}
          >
            <img src={getXingheMediaSrc(frame)} draggable={false} className="w-full h-full object-cover" />
            <span
              className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-black/70 text-white flex items-center justify-center cursor-pointer pointer-events-auto hover:bg-red-500 transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                updateNodeSettings(nodeId, { [field]: undefined })
              }}
            >
              <X size={7} />
            </span>
          </div>
        ) : (
          <span className="text-[9px] text-[var(--text-muted)]">{label}</span>
        )}
      </div>
    </div>
  )

  return (
    <div
      className="nodrag px-3 pb-2 pt-2 border-t border-[var(--border-color)]"
      onMouseDown={(e) => e.stopPropagation()}
      {...frameDragHandlers}
    >
      <div className="text-[9px] text-[var(--text-muted)] font-medium mb-1.5">首帧 / 尾帧</div>
      <div className="flex gap-2">
        {renderFrame(startFrame, 'manualStartFrame', '首帧')}
        {renderFrame(endFrame, 'manualEndFrame', '尾帧')}
      </div>
    </div>
  )
})
