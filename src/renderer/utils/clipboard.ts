export async function copyTextToClipboard(text: string): Promise<void> {
  const api = (window as any).api
  const value = String(text || '')
  const writers = [
    () => api?.invoke?.('system:clipboard-write-text', value),
    () => api?.localCacheAPI?.writeClipboardText?.(value),
    () => api?.windowAPI?.writeClipboardText?.(value)
  ]

  let lastError: unknown = null
  for (const write of writers) {
    try {
      const result = await write()
      if (result?.success) return
      if (result?.error) lastError = new Error(result.error)
    } catch (error) {
      lastError = error
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch (error) {
      lastError = error
    }
  }

  const message =
    lastError instanceof Error
      ? lastError.message
      : lastError
        ? String(lastError)
        : 'clipboard write unavailable'
  throw new Error(`复制到剪贴板失败：${message}`)
}
