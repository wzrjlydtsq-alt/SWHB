import path from 'path'
import fs from 'fs'
import { app } from 'electron'

export class TaskExecutor {
  static async getBase64FromLocalAsync(filePath) {
    if (!filePath) return filePath
    // const fs = require('fs') // Removed as fs is now imported
    // const path = require('path') // Removed as path is now imported

    if (typeof filePath !== 'string') return filePath
    if (
      filePath.startsWith('http://') ||
      filePath.startsWith('https://') ||
      filePath.startsWith('data:')
    ) {
      return filePath
    }

    try {
      let absolutePath = filePath
      if (absolutePath.startsWith('xinghe://local/?path=')) {
        absolutePath = decodeURIComponent(absolutePath.replace('xinghe://local/?path=', ''))
      } else if (absolutePath.startsWith('file://')) {
        absolutePath = decodeURIComponent(absolutePath.replace('file://', ''))
      }
      if (process.platform === 'win32' && absolutePath.match(/^\/[A-Za-z]:\//)) {
        absolutePath = absolutePath.slice(1)
      }

      if (fs.existsSync(absolutePath)) {
        const stat = fs.statSync(absolutePath)
        if (stat.size > 20 * 1024 * 1024) {
          console.warn(
            `[TaskExecutor] 文件过大(${(stat.size / 1024 / 1024).toFixed(1)}MB)跳过base64:`,
            absolutePath
          )
          return filePath
        }
        const buffer = await fs.promises.readFile(absolutePath)
        const ext = path.extname(absolutePath).toLowerCase().slice(1) || 'png'
        let mimeType = 'image/png'
        if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg'
        if (ext === 'webp') mimeType = 'image/webp'
        if (ext === 'gif') mimeType = 'image/gif'
        if (ext === 'mp4') mimeType = 'video/mp4'
        if (ext === 'mp3') mimeType = 'audio/mpeg'
        if (ext === 'wav') mimeType = 'audio/wav'

        return `data:${mimeType};base64,${buffer.toString('base64')}`
      }
    } catch (e) {
      console.warn('[TaskExecutor] Failed to read local file to base64:', e)
    }
    return filePath
  }
  /**
   * This is where the heavy lifting occurs.
   * Based on the node type (e.g. video generation, image generation), we make the HTTP API requests here from Node.js rather than the Chrome Renderer.
   *
   * @param {Object} task The task definition from TaskQueue
   * @param {Object} apiConfigs Pass in the validated global apis
   * @param {Function} updateCallback Call this to stream progress (e.g. video % done)
   */
  static async execute(task, apiConfigs, updateCallback) {
    const { payload } = task
    const {
      baseUrl,
      apiKey,
      modelId,
      type,
      prompt,
      sizeStr,
      sourceImages,
      sourceVideos,
      sourceAudios,
      imageRoles,
      duration,
      ratio,
      resolution,
      configName,
      enableWebSearch,
      generateAudio
    } = payload

    const targetModel = configName || modelId

    let cleanApiKey = apiKey
    if (typeof cleanApiKey === 'string') {
      cleanApiKey = cleanApiKey.replace(
        /^(?:export\s+)?(?:[A-Za-z0-9_]+=)?["']?([^"'\s]+)["']?$/,
        '$1'
      )
    }

    // Normalize URL
    let rootUrl = baseUrl.replace(/\/+$/, '')

    // URL 重写规则（lingjingxinghe.cn 的 SSL 证书仅覆盖 www 子域名）
    const URL_REWRITES = {
      'https://lingjingxinghe.cn': 'https://www.lingjingxinghe.cn'
    }
    if (URL_REWRITES[rootUrl]) {
      rootUrl = URL_REWRITES[rootUrl]
    }

    // AbortController signal（取消任务时中止 HTTP 请求）
    const signal = task.abortController?.signal

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cleanApiKey}`
    }

    try {
      updateCallback(5, `初始化任务: ${modelId}...`)

      // ============================================
      // 1. 图像生成 (同步 或 异步 Banana 轮询)
      // ============================================
      if (type === 'image' && !modelId.includes('mj')) {
        updateCallback(20, '发送图像生成请求...')

        let submitEndpoint = `${rootUrl}/v1/images/generations`
        let submitMethod = 'POST'
        let submitHeaders = { ...headers }
        let submitBody

        const isBananaLike =
          modelId.includes('banana') || modelId.includes('dall-e') || modelId.includes('gpt')
        const isNanoBanana = modelId.includes('nano-banana')
        const isGeminiChat =
          modelId.includes('gemini-3-pro-image-preview') ||
          modelId.includes('gemini-2.5-flash-image')
        const isJimeng = modelId.includes('jimeng')

        // 绑定参考图 (Img2Img)
        if (sourceImages && sourceImages.length > 0) {
          const imgSrc = sourceImages[0]

          if (isGeminiChat) {
            // Gemini APIs use chat completions format with image messages
            submitEndpoint = `${rootUrl}/v1/chat/completions`

            let imgPayload = imgSrc.trim()
            if (!imgPayload.startsWith('http') && !imgPayload.startsWith('data:')) {
              imgPayload = await this.getBase64FromLocalAsync(imgPayload)
              if (!imgPayload.startsWith('data:') && !imgPayload.startsWith('http')) {
                imgPayload = `data:image/png;base64,${imgPayload}`
              }
            }

            submitBody = JSON.stringify({
              model: targetModel,
              stream: false,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: prompt || 'enhance' },
                    { type: 'image_url', image_url: { url: imgPayload } }
                  ]
                }
              ],
              generationConfig: {
                responseModalities: ['IMAGE'],
                imageConfig: {
                  aspectRatio: ratio || '1:1',
                  imageSize: sizeStr || '1K'
                }
              }
            })
          } else if (isBananaLike) {
            if (isNanoBanana) {
              // Nano Banana uses ?async=true and JSON array for image
              submitEndpoint = `${rootUrl}/v1/images/generations?async=true`

              const trimmedImg = imgSrc.trim()
              let finalImg = await this.getBase64FromLocalAsync(trimmedImg)
              if (!finalImg.startsWith('http') && !finalImg.startsWith('data:')) {
                finalImg = `data:image/png;base64,${finalImg}`
              }

              submitBody = JSON.stringify({
                model: targetModel,
                prompt: prompt || 'enhance',
                image: [finalImg],
                response_format: 'url',
                image_size: sizeStr || '1K',
                aspect_ratio: ratio || '1:1'
              })
            } else {
              // DALL-E / GPT uses multipart FormData for edits
              submitEndpoint = `${rootUrl}/v1/images/edits`
              delete submitHeaders['Content-Type'] // Let native fetch set boundary

              const formData = new FormData()
              formData.append('model', targetModel)
              formData.append('prompt', prompt || 'enhance')
              formData.append('n', '1')
              formData.append('size', sizeStr || '1024x1024')

              let blob
              const finalImgSrc = await this.getBase64FromLocalAsync(imgSrc)
              if (finalImgSrc.startsWith('data:')) {
                const arr = finalImgSrc.split(',')
                const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png'
                const bstr = atob(arr[1])
                let n = bstr.length
                const u8arr = new Uint8Array(n)
                while (n--) {
                  u8arr[n] = bstr.charCodeAt(n)
                }
                blob = new Blob([u8arr], { type: mime })
              } else {
                // Try fetching and resolving as a blob if it's an HTTP URL
                const fetchRes = await fetch(finalImgSrc)
                blob = await fetchRes.blob()
              }
              formData.append('image', blob, 'input.png')
              submitBody = formData
            }
          } else if (isJimeng) {
            // Jimeng uses compositions array
            submitEndpoint = `${rootUrl}/v1/images/compositions`
            submitBody = JSON.stringify({
              model: targetModel,
              prompt: prompt || 'enhance',
              images: [await this.getBase64FromLocalAsync(imgSrc)],
              response_format: 'url'
            })
          } else {
            // Default generic image generation block (fallback)
            const reqBody = {
              model: targetModel,
              prompt: prompt || '',
              n: 1,
              size: sizeStr || '1024x1024'
            }
            const finalImgSrc = await this.getBase64FromLocalAsync(imgSrc)
            if (finalImgSrc.startsWith('http') || finalImgSrc.length < 5 * 1024 * 1024) {
              reqBody.image_url = finalImgSrc
            } else {
              console.warn(
                '[TaskExecutor] Base64 image is too large (>5MB) for JSON body. Dropping.'
              )
            }
            submitBody = JSON.stringify(reqBody)
          }
        } else {
          // 文生图 (Text2Img) Default Fallback
          if (isNanoBanana) {
            submitEndpoint = `${rootUrl}/v1/images/generations?async=true`
          }
          const reqBody = {
            model: targetModel,
            prompt: prompt || '',
            n: 1,
            ...(isNanoBanana
              ? { image_size: sizeStr || '1K', aspect_ratio: ratio || '1:1', response_format: 'url' }
              : { size: sizeStr || '1024x1024' })
          }
          submitBody = JSON.stringify(reqBody)
        }

        const res = await fetch(submitEndpoint, {
          method: submitMethod,
          headers: submitHeaders,
          body: submitBody,
          signal
        })

        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error?.message || data.message || `API 请求失败: ${res.status}`)
        }

        // 解析直接响应的图片连接
        let imageUrl =
          data?.data?.[0]?.url || data?.images?.[0] || data?.url || data?.data?.[0]?.image_url

        // Nano Bananna API 响应解析
        if (!imageUrl && data?.choices?.[0]?.message?.content) {
          const content = data.choices[0].message.content
          const base64Match =
            content.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/) ||
            content.match(/([A-Za-z0-9+/=]{100,})/)
          const markdownImgMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/)
          const rawUrlMatch = content.match(/(https?:\/\/[^\s)]+\.(?:jpg|jpeg|png|gif|webp))/i)

          if (base64Match) {
            imageUrl = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/)
              ? content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/)[0]
              : `data:image/png;base64,${base64Match[1]}`
          } else if (markdownImgMatch) {
            imageUrl = markdownImgMatch[1]
          } else if (rawUrlMatch) {
            imageUrl = rawUrlMatch[1]
          }
        }

        if (imageUrl) {
          updateCallback(100, '生成成功')
          return { success: true, resultUrl: imageUrl }
        } else {
          // 如果返回的是 Async Task ID (例如 Banana API)
          const taskIdForPoll = data?.id || data?.task_id
          if (taskIdForPoll) {
            updateCallback(30, `任务已提交, 排队中 (ID: ${taskIdForPoll})`)
            return await this.pollBananaImage(
              rootUrl,
              headers,
              taskIdForPoll,
              updateCallback,
              signal
            )
          }
          throw new Error('云端未返回任何有效图像连接或任务ID')
        }
      }

      // ============================================
      // 2. 视频生成 (Sora / Grok / Veo 等轮询制 API)
      // ============================================
      if (type === 'video') {
        updateCallback(10, '提交视频生成任务...')

        let submitEndpoint = `${rootUrl}/v1/video/generations`
        let reqBody = {}

        if (
          modelId.includes('seedance') ||
          targetModel.includes('seedance') ||
          targetModel.includes('doubao')
        ) {
          submitEndpoint = `${rootUrl}/v1/video/generations`

          reqBody = {
            model: targetModel,
            prompt: prompt || '请根据提供的参考内容生成视频',
            metadata: {
              content: [],
              generate_audio: generateAudio !== undefined ? generateAudio : true,
              ratio: ratio || sizeStr || '16:9',
              duration: duration ? parseInt(String(duration).replace('s', ''), 10) : 5,
              resolution:
                resolution === '720P' || resolution === '480P' ? resolution.toLowerCase() : '720p'
            }
          }

          if (enableWebSearch) {
            reqBody.metadata.tools = [{ type: 'web_search' }]
          }

          if (prompt) {
            reqBody.metadata.content.push({ type: 'text', text: prompt })
          }

          if (sourceImages && sourceImages.length > 0) {
            for (let index = 0; index < sourceImages.length; index++) {
              const imgSrc = sourceImages[index]
              const role = (imageRoles && imageRoles[index]) || 'reference_image'
              // Asset ID 直接使用 asset:// 协议
              if (imgSrc.startsWith('asset-')) {
                reqBody.metadata.content.push({
                  type: 'image_url',
                  image_url: { url: `asset://${imgSrc}` },
                  role: role
                })
              } else {
                const finalImgSrc = await this.getBase64FromLocalAsync(imgSrc)
                reqBody.metadata.content.push({
                  type: 'image_url',
                  image_url: { url: finalImgSrc },
                  role: role
                })
              }
            }
          }

          if (sourceVideos && sourceVideos.length > 0) {
            for (let i = 0; i < sourceVideos.length; i++) {
              let videoSrc = sourceVideos[i]

              if (
                videoSrc.startsWith('file://') ||
                videoSrc.startsWith('/') ||
                videoSrc.match(/^[a-zA-Z]:\\/) ||
                videoSrc.includes('localhost') ||
                videoSrc.includes('127.0.0.1') ||
                videoSrc.startsWith('blob:')
              ) {
                try {
                  console.log(
                    `[TaskExecutor] Intercepted local video reference. Creating Volcano Files API upload task:`,
                    videoSrc
                  )
                  let absolutePath = videoSrc
                  let buffer = null
                  let ext = videoSrc.split('.').pop().toLowerCase()
                  if (!['mp4', 'mov', 'avi'].includes(ext)) ext = 'mp4'

                  if (
                    videoSrc.startsWith('http://localhost') ||
                    videoSrc.startsWith('http://127.0.0.1') ||
                    videoSrc.startsWith('blob:')
                  ) {
                    const res = await fetch(videoSrc)
                    const arrayBuffer = await res.arrayBuffer()
                    buffer = Buffer.from(arrayBuffer)
                    absolutePath = null
                  }

                  if (absolutePath) {
                    if (absolutePath.startsWith('file://')) {
                      absolutePath = decodeURIComponent(absolutePath.replace('file://', ''))
                    }
                    // const fs = require('fs') // Removed as fs is now imported
                    if (fs.existsSync(absolutePath)) {
                      buffer = await fs.promises.readFile(absolutePath)
                    }
                  }

                  if (buffer) {
                    const blob = new Blob([buffer], { type: `video/${ext}` })
                    const formData = new FormData()
                    formData.append('purpose', 'user_data')
                    // Note: Volcano files API looks for the 'file' param as a multipart upload
                    formData.append('file', blob, `upload_video_ref_${Date.now()}.${ext}`)

                    // Omit 'Content-Type' header from `headers` intentionally so fetch can auto-inject mutipart/form-data boundary
                    const uploadHeaders = { ...headers }
                    delete uploadHeaders['Content-Type']
                    delete uploadHeaders['content-type']

                    updateCallback(20, `正在上传视频参考到云端素材库...`)
                    const uploadRes = await fetch(
                      'https://ark.cn-beijing.volces.com/api/v3/files',
                      {
                        method: 'POST',
                        headers: uploadHeaders,
                        body: formData,
                        signal
                      }
                    )

                    if (!uploadRes.ok) {
                      const errData = await uploadRes.text()
                      throw new Error(`HTTP ${uploadRes.status}: ${errData}`)
                    }

                    const uploadData = await uploadRes.json()
                    if (uploadData.id) {
                      videoSrc = uploadData.id
                      console.log(
                        `[TaskExecutor] Upload successful. Replaced reference with ASSET_ID:`,
                        videoSrc
                      )
                    }
                  }
                } catch (e) {
                  console.error(`[TaskExecutor] Volcano Files upload blocked/failed:`, e)
                  throw new Error(`火山素材库视频上传失败: ${e.message}`)
                }
              }

              reqBody.metadata.content.push({
                type: 'video_url',
                video_url: { url: videoSrc },
                role: 'reference_video'
              })
            }
          }

          if (sourceAudios && sourceAudios.length > 0) {
            for (const audioSrc of sourceAudios) {
              const base64Audio = await this.getBase64FromLocalAsync(audioSrc)
              reqBody.metadata.content.push({
                type: 'audio_url',
                audio_url: { url: base64Audio },
                role: 'reference_audio'
              })
            }
          }
        } else {
          if (
            modelId.includes('grok') ||
            modelId.includes('veo') ||
            targetModel.includes('grok') ||
            targetModel.includes('veo')
          ) {
            submitEndpoint = `${rootUrl}/v2/videos/generations`
          }

          reqBody = {
            model: targetModel,
            prompt: prompt || ''
          }

          if (sourceImages && sourceImages.length > 0) {
            reqBody.image_url = await this.getBase64FromLocalAsync(sourceImages[0])
          }
        }

        console.log(`[TaskExecutor] Preparing to fetch: ${submitEndpoint}`)
        console.log(`[TaskExecutor] Headers:`, {
          ...headers,
          Authorization: headers.Authorization ? 'Bearer ***' : undefined
        })
        console.log(`[TaskExecutor] Body:`, JSON.stringify(reqBody, null, 2))

        let res
        try {
          res = await fetch(submitEndpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(reqBody),
            signal
          })
        } catch (error) {
          console.error(`[TaskExecutor] fetch failed catastrophically:`, error)
          let errorDetails = error.message
          if (error.cause) {
            errorDetails += ` | Cause: ${error.cause.message || error.cause}`
          }
          throw new Error(
            `网络请求核心报错: ${errorDetails} ; 尝试访问了 -> ${submitEndpoint} (诊断: targetModel=${targetModel}, modelId=${modelId}, configName=${configName})`
          )
        }

        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error?.message || data.message || `API 请求失败: ${res.status}`)
        }

        let jobId = data?.id || data?.data?.id || data?.task_id
        if (typeof jobId === 'string') {
          jobId = jobId.replace(/\/fetch$/, '')
        }
        if (!jobId) {
          // 检查是否瞬间执行完成 (某些Mock或快照接口)
          const vidUrl = data?.data?.url || data?.url
          if (vidUrl) {
            updateCallback(100, '生成成功')
            return { success: true, resultUrl: vidUrl }
          }
          throw new Error('无法从响应中提取任务 Job ID')
        }

        updateCallback(30, `任务已推入云端队列 (Job: ${jobId})`)

        return await this.pollVideoTask(
          rootUrl,
          headers,
          jobId,
          targetModel,
          updateCallback,
          signal
        )
      }

      throw new Error(`仅支持标准图像或视频, 当前请求异常: ${modelId} (${type})`)
    } catch (err) {
      throw new Error(err.message)
    }
  }

  static async pollVideoTask(rootUrl, headers, jobId, targetModel, updateCallback, signal) {
    return new Promise((resolve, reject) => {
      let attempts = 0
      const maxAttempts = 300 // 最长等待25分钟左右
      let progress = 30

      let pollEndpoint = `${rootUrl}/v1/videos/${jobId}`
      if (targetModel.includes('seedance') || targetModel.includes('doubao')) {
        pollEndpoint = `${rootUrl}/v1/videos/${jobId}`
      } else if (targetModel.includes('grok') || targetModel.includes('veo')) {
        pollEndpoint = `${rootUrl}/v2/videos/generations/${jobId}`
      }

      const timer = setInterval(async () => {
        try {
          attempts++
          if (attempts > maxAttempts) {
            clearInterval(timer)
            return reject(new Error('视频生成超时'))
          }

          const res = await fetch(pollEndpoint, {
            method: 'GET',
            headers,
            signal
          })

          // 非 200 响应跳过本轮（502/503 网关错误返回 HTML 会导致 json() 解析失败）
          if (!res.ok) {
            console.warn(`[TaskExecutor] [Video Poll ${attempts}] HTTP ${res.status}, 跳过本轮`)
            return
          }

          let data
          try {
            data = await res.json()
          } catch {
            console.warn(`[TaskExecutor] [Video Poll ${attempts}] 响应非 JSON, 跳过本轮`)
            return
          }
          console.log(`[TaskExecutor] [Video Poll ${attempts}]`, JSON.stringify(data))

          const status = (
            data?.data?.status ||
            data?.status ||
            data?.task_status ||
            ''
          ).toUpperCase()

          if (
            status === 'SUCCESS' ||
            status === 'SUCCEEDED' ||
            status === 'COMPLETED' ||
            status === 'FINISHED'
          ) {
            clearInterval(timer)
            const finalUrl =
              data?.metadata?.url ||
              data?.content?.video_url ||
              data?.data?.video_url ||
              data?.data?.url ||
              data?.data?.output?.video_url ||
              data?.data?.output ||
              data?.result?.video_url ||
              data?.video_url ||
              data?.url ||
              data?.output ||
              data?.data?.videos?.[0]?.url ||
              data?.data?.videos?.[0]

            console.log('[TaskExecutor] Task completed:', {
              status,
              finalUrl: finalUrl?.substring(0, 100),
              rawData: JSON.stringify(data).substring(0, 200)
            })

            if (finalUrl) {
              updateCallback(100, '视频生成完毕')
              resolve({ success: true, resultUrl: finalUrl })
            } else {
              const debugPayload = JSON.stringify(data).substring(0, 300)
              console.error(
                '[TaskExecutor] No video URL found in response:',
                JSON.stringify(data, null, 2)
              )
              reject(new Error(`云端任务完成, 但提取流地址失败! 请将此行截图反馈: ${debugPayload}`))
            }
          } else if (status === 'FAILED' || status === 'ERROR' || status === 'CANCELLED') {
            clearInterval(timer)
            const errorStr =
              data?.data?.fail_reason ||
              data?.fail_reason ||
              data?.error?.message ||
              '服务侧发生未知错误'
            reject(new Error(errorStr))
          } else {
            // Pending...
            progress = Math.min(95, progress + 1)
            let hint = '构架场景中...'
            if (progress > 50) hint = '正在渲染帧序列...'
            if (progress > 85) hint = '打包流媒体中...'
            updateCallback(progress, hint)
          }
        } catch (err) {
          if (err.name === 'AbortError') {
            clearInterval(timer)
            return reject(new Error('Task Cancelled locally'))
          }
          console.error('[Engine] Video Poll Network Error:', err)
          // 网络抖动忽略，继续轮询
        }
      }, 30000)

      // 监听 abort 事件，确保定时器被清理
      if (signal) {
        signal.addEventListener('abort', () => clearInterval(timer), { once: true })
      }
    })
  }

  static async pollBananaImage(rootUrl, headers, taskId, updateCallback, signal) {
    return new Promise((resolve, reject) => {
      let attempts = 0
      let progress = 30

      const timer = setInterval(async () => {
        try {
          attempts++
          if (attempts > 120) {
            clearInterval(timer)
            return reject(new Error('图像轮询超时'))
          }

          const res = await fetch(`${rootUrl}/v1/images/tasks/${taskId}`, { headers, signal })
          const data = await res.json()
          console.log(`[TaskExecutor] [Image Poll ${attempts}]`, JSON.stringify(data))

          const status = (data?.data?.status || data?.status || '').toUpperCase()

          if (status === 'SUCCESS' || status === 'SUCCEEDED' || status === 'COMPLETED') {
            clearInterval(timer)
            const imageUrl =
              data?.data?.url ||
              data?.url ||
              data?.data?.[0]?.url ||
              data?.data?.[0]?.image_url ||
              data?.image_url ||
              data?.data?.image_url ||
              data?.images?.[0]?.url ||
              data?.images?.[0] ||
              data?.data?.images?.[0]?.url ||
              data?.data?.images?.[0] ||
              data?.output ||
              data?.data?.output ||
              data?.data?.result?.url ||
              data?.data?.data?.data?.[0]?.url ||
              data?.data?.data?.[0]?.url ||
              data?.data?.data?.images?.[0]?.url

            try {
              fs.writeFileSync(
                path.join(app.getPath('userData'), 'banana_debug.json'),
                JSON.stringify(data, null, 2)
              )
            } catch (e) {
              console.error('Failed to write banana_debug.json', e)
            }

            if (imageUrl) {
              updateCallback(100, '生成成功')
              resolve({ success: true, resultUrl: imageUrl })
            } else {
              console.error(
                '[TaskExecutor] No image URL found in response:',
                JSON.stringify(data, null, 2)
              )
              reject(new Error('图像任务完成但未返回URL'))
            }
          } else if (status === 'FAILED' || status === 'ERROR') {
            clearInterval(timer)
            reject(new Error(data?.error?.message || '图像生成失败'))
          } else {
            progress = Math.min(95, progress + 1)
            updateCallback(progress, '生成中...')
          }
        } catch (err) {
          if (err.name === 'AbortError') {
            clearInterval(timer)
            return reject(new Error('Task Cancelled locally'))
          }
          console.error('[Engine] Image Poll Network Error:', err)
        }
      }, 10000)

      // 监听 abort 事件，确保定时器被清理
      if (signal) {
        signal.addEventListener('abort', () => clearInterval(timer), { once: true })
      }
    })
  }
}
