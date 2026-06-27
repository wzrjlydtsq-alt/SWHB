export const ArtisticProgress = ({ visible, progress, status, type }) => {
  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-300 pointer-events-none select-none">
      <div className="relative bg-[#09090b]/90 border border-white/10 rounded-2xl p-8 shadow-2xl flex flex-col items-center min-w-[300px] backdrop-blur-xl">
        {/* 装饰性光晕 */}
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-20 h-20 bg-blue-500/20 blur-[50px] rounded-full pointer-events-none" />

        {/* 标题与百分比 */}
        <div className="flex flex-col items-center gap-1 mb-6 z-10">
          <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-zinc-500">
            {type === 'import' ? 'DATA INGESTION' : 'SYSTEM ARCHIVING'}
          </span>
          <div className="text-4xl font-bold text-zinc-200 tracking-tighter font-sans">
            {progress.toFixed(0)}
            <span className="text-sm text-zinc-500 ml-1">%</span>
          </div>
        </div>

        {/* 进度条轨道 */}
        <div className="relative w-full h-[2px] bg-zinc-800 rounded-full overflow-hidden mb-4">
          <div
            className="absolute top-0 left-0 h-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)] transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* 状态文本 */}
        <span className="text-[10px] font-mono text-zinc-400 tracking-widest uppercase animate-pulse">
          {status}
        </span>
      </div>
    </div>
  )
}
