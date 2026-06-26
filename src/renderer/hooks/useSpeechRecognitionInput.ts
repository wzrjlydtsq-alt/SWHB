import { useCallback, useEffect, useRef, useState } from 'react'

import { useAppStore } from '../store/useAppStore'
import { DEFAULT_BASE_URL } from '../utils/constants'
import toast from '../utils/toast'

const MAX_RECORDING_MS = 8000
const NO_VOICE_STOP_MS = 4200
const SILENCE_AFTER_VOICE_MS = 900
const AUDIO_LEVEL_THRESHOLD = 0.018

function mergeRecognizedText(currentValue: string, nextSpeech: string) {
  const current = String(currentValue || '').trimEnd()
  const speech = String(nextSpeech || '').trim()
  if (!speech) return current
  if (!current) return speech
  const needsSpace = /[A-Za-z0-9)]$/.test(current) && /^[A-Za-z0-9(]/.test(speech)
  return `${current}${needsSpace ? ' ' : ''}${speech}`
}

function buildTranscriptionUrl(baseUrl: string) {
  return `${String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')}/v1/audio/transcriptions`
}

function getTranscriptionRuntime() {
  const state = useAppStore.getState()
  const apiKey = state.groupApiKeys?.Chat || state.globalApiKey || ''
  const baseUrl = state.groupApiUrls?.Chat || state.globalApiUrl || DEFAULT_BASE_URL
  return { apiKey, baseUrl }
}

function mergeFloat32Chunks(chunks: Float32Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const merged = new Float32Array(totalLength)
  let offset = 0
  chunks.forEach((chunk) => {
    merged.set(chunk, offset)
    offset += chunk.length
  })
  return merged
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index))
  }
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const bytesPerSample = 2
  const channelCount = 1
  const dataSize = samples.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channelCount, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true)
  view.setUint16(32, channelCount * bytesPerSample, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let index = 0; index < samples.length; index += 1, offset += 2) {
    const sample = Math.max(-1, Math.min(1, samples[index]))
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

async function transcribeAudio(blob: Blob) {
  const { apiKey, baseUrl } = getTranscriptionRuntime()
  if (!apiKey) {
    const error = new Error('speech-api-missing')
    ;(error as any).code = 'speech-api-missing'
    throw error
  }

  const form = new FormData()
  form.append('file', blob, 'speech.wav')
  form.append('model', 'whisper-1')
  form.append('language', 'zh')
  form.append('response_format', 'json')

  const response = await fetch(buildTranscriptionUrl(baseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: form
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    const error = new Error(detail || `speech-api-${response.status}`)
    ;(error as any).status = response.status
    throw error
  }

  const data = await response.json()
  return String(data?.text || data?.data?.text || '').trim()
}

export function useSpeechRecognitionInput({
  value,
  onChange,
  disabled = false
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  lang?: string
}) {
  const valueRef = useRef(value)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const chunksRef = useRef<Float32Array[]>([])
  const sampleRateRef = useRef(44100)
  const autoStopTimerRef = useRef<number | null>(null)
  const noVoiceTimerRef = useRef<number | null>(null)
  const voiceStartedRef = useRef(false)
  const lastVoiceAtRef = useRef(0)
  const stoppingRef = useRef(false)
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')
  const [supported, setSupported] = useState(() =>
    Boolean(typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia && typeof AudioContext !== 'undefined')
  )

  useEffect(() => {
    valueRef.current = value
  }, [value])

  useEffect(() => {
    setSupported(
      Boolean(typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia && typeof AudioContext !== 'undefined')
    )
  }, [])

  const clearTimers = useCallback(() => {
    if (autoStopTimerRef.current) {
      window.clearTimeout(autoStopTimerRef.current)
      autoStopTimerRef.current = null
    }
    if (noVoiceTimerRef.current) {
      window.clearTimeout(noVoiceTimerRef.current)
      noVoiceTimerRef.current = null
    }
  }, [])

  const cleanupAudio = useCallback(() => {
    clearTimers()
    processorRef.current?.disconnect()
    sourceRef.current?.disconnect()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    audioContextRef.current?.close().catch(() => {})
    processorRef.current = null
    sourceRef.current = null
    streamRef.current = null
    audioContextRef.current = null
    voiceStartedRef.current = false
    lastVoiceAtRef.current = 0
  }, [clearTimers])

  const processRecording = useCallback(async () => {
    const chunks = chunksRef.current
    chunksRef.current = []
    const samples = mergeFloat32Chunks(chunks)

    if (samples.length < sampleRateRef.current * 0.25) {
      setError('speech-empty')
      toast.warn('录音太短，靠近麦克风再说一次')
      return
    }

    try {
      setIsProcessing(true)
      toast.info('正在识别语音...')
      const wavBlob = encodeWav(samples, sampleRateRef.current)
      const text = await transcribeAudio(wavBlob)
      if (!text) {
        setError('speech-empty-result')
        toast.warn('没识别到文字，靠近麦克风再试一次')
        return
      }
      const nextValue = mergeRecognizedText(valueRef.current, text)
      valueRef.current = nextValue
      onChange(nextValue)
      setError('')
      toast.success('语音已填入输入框')
    } catch (err: any) {
      console.error('Failed to transcribe speech', err)
      setError(err?.code || err?.message || 'speech-transcribe-failed')
      if (err?.code === 'speech-api-missing') {
        toast.error('语音识别需要先配置文本组 API Key')
      } else {
        toast.error(`语音识别失败：${String(err?.message || err?.status || '请检查接口是否支持转写').slice(0, 100)}`)
      }
    } finally {
      setIsProcessing(false)
    }
  }, [onChange])

  const stop = useCallback(() => {
    if (stoppingRef.current) return
    stoppingRef.current = true
    cleanupAudio()
    setIsListening(false)
    void processRecording().finally(() => {
      stoppingRef.current = false
    })
  }, [cleanupAudio, processRecording])

  const start = useCallback(async () => {
    if (disabled || isListening || isProcessing) return
    if (!supported) {
      setError('speech-unsupported')
      toast.error('当前环境不支持麦克风录音')
      return
    }

    try {
      setError('')
      stoppingRef.current = false
      chunksRef.current = []
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      const audioContext = new AudioContextClass()
      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)

      sampleRateRef.current = audioContext.sampleRate || 44100
      streamRef.current = stream
      audioContextRef.current = audioContext
      sourceRef.current = source
      processorRef.current = processor
      voiceStartedRef.current = false
      lastVoiceAtRef.current = 0

      processor.onaudioprocess = (event) => {
        if (stoppingRef.current) return
        const input = event.inputBuffer.getChannelData(0)
        const chunk = new Float32Array(input)
        chunksRef.current.push(chunk)

        let sum = 0
        for (let index = 0; index < input.length; index += 1) {
          sum += input[index] * input[index]
        }
        const level = Math.sqrt(sum / input.length)
        const now = Date.now()
        if (level > AUDIO_LEVEL_THRESHOLD) {
          voiceStartedRef.current = true
          lastVoiceAtRef.current = now
          return
        }
        if (
          voiceStartedRef.current &&
          lastVoiceAtRef.current &&
          now - lastVoiceAtRef.current > SILENCE_AFTER_VOICE_MS
        ) {
          stop()
        }
      }

      source.connect(processor)
      processor.connect(audioContext.destination)

      setIsListening(true)
      toast.info('正在录音，说完会自动识别，也可以再点一次结束')
      autoStopTimerRef.current = window.setTimeout(() => stop(), MAX_RECORDING_MS)
      noVoiceTimerRef.current = window.setTimeout(() => {
        if (!voiceStartedRef.current) {
          setError('speech-no-voice')
          toast.warn('还没听到明显声音，已自动结束录音')
          stop()
        }
      }, NO_VOICE_STOP_MS)
    } catch (err: any) {
      console.error('Failed to start microphone recording', err)
      cleanupAudio()
      setError(err?.name === 'NotAllowedError' ? 'speech-permission-denied' : 'speech-start-failed')
      toast.error(err?.name === 'NotAllowedError' ? '麦克风权限被拒绝' : '麦克风启动失败')
      setIsListening(false)
      setIsProcessing(false)
    }
  }, [cleanupAudio, disabled, isListening, isProcessing, stop, supported])

  const toggle = useCallback(() => {
    if (isProcessing) return
    if (isListening) {
      stop()
      return
    }
    void start()
  }, [isListening, isProcessing, start, stop])

  useEffect(() => {
    return () => {
      cleanupAudio()
      chunksRef.current = []
    }
  }, [cleanupAudio])

  return {
    error,
    isListening,
    isProcessing,
    start,
    stop,
    supported,
    toggle
  }
}
