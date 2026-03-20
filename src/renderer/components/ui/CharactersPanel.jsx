import { User, X } from '../../utils/icons.jsx'
import { DEFAULT_BASE_URL } from '../../utils/constants.js'

/**
 * CharactersPanel — Sora 角色库侧边栏
 * 从 main.jsx 提取的内联 JSX
 */
export function CharactersPanel({
  charactersOpen,
  setCharactersOpen,
  characterLibrary,
  apiConfigs,
  setCreateCharacterEndpoint,
  setCreateCharacterOpen
}) {
  if (!charactersOpen) return null

  return (
    <div
      className={`w-72 z-30 flex flex-col animate-in slide-in-from-left border-r transition-colors duration-300 bg-[var(--bg-secondary)] border-[var(--border-color)]`}
    >
      <div
        className={`p-3 border-b flex justify-between items-center border-[var(--border-color)]`}
      >
        <h3 className={`font-bold text-xs text-[var(--text-primary)]`}>Sora 角色库</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const soraConfig = apiConfigs.find(
                (c) => c.type === 'Video' && (c.id === 'sora-2' || c.id === 'sora-2-pro')
              )
              if (soraConfig) {
                const baseUrl = (soraConfig.url || DEFAULT_BASE_URL).replace(/\/+$/, '')
                setCreateCharacterEndpoint(`${baseUrl}/sora/v1/characters`)
              } else {
                const baseUrl = DEFAULT_BASE_URL.replace(/\/+$/, '')
                setCreateCharacterEndpoint(`${baseUrl}/sora/v1/characters`)
              }
              setCreateCharacterOpen(true)
            }}
            className={`px-2 py-1 text-[10px] rounded transition-colors bg-blue-600 hover:bg-blue-500 text-white`}
          >
            新建角色
          </button>
          <button onClick={() => setCharactersOpen(false)}>
            <X size={12} className={'text-[var(--text-secondary)]'} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
        {characterLibrary.length === 0 ? (
          <div className={`text-center py-8 text-sm text-[var(--text-muted)]`}>
            {'暂无角色，点击"新建角色"开始创建'}
          </div>
        ) : (
          <div className="space-y-2">
            {characterLibrary.map((char) => (
              <div
                key={char.id}
                className={`p-2 rounded cursor-pointer transition-colors bg-[var(--bg-base)] hover:bg-[var(--border-color)]`}
                onClick={() => {
                  console.log('Selected character:', char.id)
                }}
              >
                <div className="flex items-center gap-2">
                  {char.profile_picture_url ? (
                    <img
                      src={char.profile_picture_url}
                      alt={char.username}
                      className="w-8 h-8 rounded shrink-0 object-cover"
                    />
                  ) : (
                    <div
                      className={`w-8 h-8 rounded shrink-0 flex items-center justify-center bg-[var(--bg-secondary)] text-[var(--text-muted)]`}
                    >
                      <User size={14} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className={`text-xs font-medium truncate text-[var(--text-primary)]`}>
                      {char.username}
                    </div>
                    <div className={`text-[10px] truncate text-[var(--text-muted)]`}>
                      ID: {char.id}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
