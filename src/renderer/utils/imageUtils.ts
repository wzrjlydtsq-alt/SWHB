export const convertToJpg = async (imgUrl) => {
  return new Promise((resolve) => {
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0)
        const jpgDataUrl = canvas.toDataURL('image/jpeg', 0.95)
        resolve(jpgDataUrl)
      }
      img.onerror = () => resolve(imgUrl)
      img.src = imgUrl
    } catch {
      resolve(imgUrl)
    }
  })
}
