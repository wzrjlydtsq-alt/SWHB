import { useState, useRef, useEffect } from 'react'

export const LazyBase64Image = ({ src, className, alt, onError, onLoad, ...props }) => {
  const [blobUrl, setBlobUrl] = useState(null)
  const [error, setError] = useState(false)
  const blobUrlRef = useRef(null)

  useEffect(() => {
    // 如果已经是 Blob URL 或 HTTP URL 或 xinghe URL，直接使用
    if (
      !src ||
      src.startsWith('blob:') ||
      src.startsWith('http://') ||
      src.startsWith('https://') ||
      src.startsWith('xinghe://')
    ) {
      setBlobUrl(src)
      return
    }

    // 如果是 Base64 Data URL，转换为 Blob URL
    if (src.startsWith('data:')) {
      const convertToBlobUrl = async () => {
        try {
          const res = await fetch(src)
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          blobUrlRef.current = url
          setBlobUrl(url)
        } catch (err) {
          console.error('Base64转Blob失败', err)
          setError(true)
          setBlobUrl(src) // 失败时使用原始数据
        }
      }
      convertToBlobUrl()
    } else {
      setBlobUrl(src)
    }

    // 清理函数：组件卸载时释放 Blob URL
    return () => {
      if (blobUrlRef.current && blobUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [src])

  if (error && !blobUrl) {
    return null
  }

  return (
    <img
      src={blobUrl || src}
      className={className}
      alt={alt}
      onError={onError}
      onLoad={onLoad}
      {...props}
    />
  )
}
