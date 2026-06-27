const managedBlobUrls = new Set<string>()

export function isBlobUrl(url: unknown): url is string {
  return typeof url === 'string' && url.startsWith('blob:')
}

export function registerManagedBlobUrl(url: unknown) {
  if (isBlobUrl(url)) {
    managedBlobUrls.add(url)
  }
  return url
}

export function revokeManagedBlobUrl(url: unknown) {
  if (!isBlobUrl(url)) return

  try {
    URL.revokeObjectURL(url)
  } catch (error) {
    console.warn('[blobUrlRegistry] revoke blob URL failed:', error)
  }

  managedBlobUrls.delete(url)
}

export function syncManagedBlobUrls(activeUrls: Iterable<unknown>) {
  const nextActive = new Set<string>()
  for (const url of activeUrls) {
    if (isBlobUrl(url)) {
      nextActive.add(url)
      managedBlobUrls.add(url)
    }
  }

  for (const url of Array.from(managedBlobUrls)) {
    if (!nextActive.has(url)) {
      revokeManagedBlobUrl(url)
    }
  }
}

export function revokeAllManagedBlobUrls() {
  for (const url of Array.from(managedBlobUrls)) {
    revokeManagedBlobUrl(url)
  }
}
