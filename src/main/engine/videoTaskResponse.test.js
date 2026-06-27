import { describe, expect, it } from 'vitest'

import {
  extractVideoTaskError,
  extractVideoResultUrl,
  extractVideoTaskStatus,
  isFatalVideoTaskErrorMessage,
  isVideoTaskFailure,
  isVideoTaskSuccess
} from './videoTaskResponse.js'

describe('video task response parsing', () => {
  it('recognizes wrapped Seedance success responses', () => {
    const response = {
      code: 'success',
      data: {
        task_id: 'cgt-1',
        status: 'SUCCESS',
        data: {
          content: {
            video_url: 'https://example.com/result.mp4'
          }
        }
      }
    }

    const status = extractVideoTaskStatus(response)

    expect(isVideoTaskSuccess(status)).toBe(true)
    expect(extractVideoResultUrl(response)).toBe('https://example.com/result.mp4')
  })

  it('supports OpenAI-style completed responses', () => {
    const response = {
      id: 'video-1',
      status: 'completed',
      metadata: {
        url: 'https://example.com/openai-style.mp4'
      }
    }

    const status = extractVideoTaskStatus(response)

    expect(isVideoTaskSuccess(status)).toBe(true)
    expect(extractVideoResultUrl(response)).toBe('https://example.com/openai-style.mp4')
  })

  it('supports legacy proxy records that keep the URL in fail_reason on success', () => {
    const response = {
      status: 'SUCCESS',
      fail_reason: 'https://example.com/legacy.mp4'
    }

    expect(extractVideoResultUrl(response)).toBe('https://example.com/legacy.mp4')
  })

  it('recognizes failure aliases', () => {
    expect(isVideoTaskFailure('canceled')).toBe(true)
    expect(isVideoTaskFailure('FAILURE')).toBe(true)
  })

  it('extracts quota errors from wrapped poll responses', () => {
    const response = {
      data: {
        status: 'FAILURE',
        error: {
          message: 'Token quota exhausted'
        }
      }
    }

    expect(extractVideoTaskError(response)).toBe('Token quota exhausted')
    expect(isFatalVideoTaskErrorMessage(extractVideoTaskError(response))).toBe(true)
  })

  it('treats fatal error messages as terminal even without a failure status', () => {
    const response = {
      status: 'IN_PROGRESS',
      message: 'Token quota exhausted'
    }

    expect(extractVideoTaskStatus(response)).toBe('IN_PROGRESS')
    expect(isFatalVideoTaskErrorMessage(extractVideoTaskError(response))).toBe(true)
  })
})
