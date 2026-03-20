/**
 * videoProcessingService.js
 * 提供视频场景检测、关键帧提取等功能。
 */

/**
 * 智能抽帧：场景检测算法
 */
export const detectScenesAndCapture = async (videoUrl, threshold = 30) => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.src = videoUrl
    video.muted = true

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    const keyframes = []
    let prevData = null

    video.onloadeddata = async () => {
      canvas.width = 320
      canvas.height = Math.floor(320 * (video.videoHeight / video.videoWidth))

      const duration = video.duration
      video.currentTime = 0

      const scan = async () => {
        const currentTime = video.currentTime
        if (currentTime >= duration || Math.abs(currentTime - duration) < 0.01) {
          if (
            keyframes.length === 0 ||
            parseFloat(keyframes[keyframes.length - 1].time) < duration - 0.5
          ) {
            const hdCanvas = document.createElement('canvas')
            hdCanvas.width = video.videoWidth
            hdCanvas.height = video.videoHeight
            const hdCtx = hdCanvas.getContext('2d')
            video.currentTime = Math.max(0, duration - 0.1)
            await new Promise((r) => {
              const timeout = setTimeout(() => r(), 200)
              video.onseeked = () => {
                clearTimeout(timeout)
                hdCtx.drawImage(video, 0, 0)
                const lastTime = Math.max(0, duration - 0.1)
                keyframes.push({
                  time: lastTime.toFixed(2),
                  image: hdCanvas.toDataURL('image/jpeg', 0.8)
                })
                r()
              }
            })
          }
          resolve(keyframes.map((kf) => ({ time: parseFloat(kf.time), url: kf.image })))
          return
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height).data

        if (prevData) {
          let diff = 0
          for (let i = 0; i < frameData.length; i += 4) {
            diff +=
              Math.abs(frameData[i] - prevData[i]) +
              Math.abs(frameData[i + 1] - prevData[i + 1]) +
              Math.abs(frameData[i + 2] - prevData[i + 2])
          }
          const avgDiff = diff / ((frameData.length / 4) * 3)

          if (avgDiff > threshold) {
            const hdCanvas = document.createElement('canvas')
            hdCanvas.width = video.videoWidth
            hdCanvas.height = video.videoHeight
            const hdCtx = hdCanvas.getContext('2d')
            hdCtx.drawImage(video, 0, 0)
            keyframes.push({
              time: currentTime.toFixed(2),
              image: hdCanvas.toDataURL('image/jpeg', 0.8)
            })
          }
        }

        prevData = new Uint8ClampedArray(frameData)
        video.currentTime += 0.5
      }

      video.onseeked = scan
      scan()
    }

    video.onerror = () => reject(new Error('视频加载失败'))
  })
}

/**
 * 分组关键帧
 */
export const groupKeyframesByTime = (keyframes, segmentDuration) => {
  if (!keyframes || keyframes.length === 0) return []
  const sorted = [...keyframes].sort((a, b) => a.time - b.time)
  const groups = []
  let currentGroup = []
  let currentGroupStart = sorted[0].time

  sorted.forEach((frame) => {
    if (frame.time - currentGroupStart >= segmentDuration && currentGroup.length > 0) {
      groups.push([...currentGroup])
      currentGroup = [frame]
      currentGroupStart = frame.time
    } else {
      currentGroup.push(frame)
    }
  })

  if (currentGroup.length > 0) {
    groups.push(currentGroup)
  }

  return groups
}
