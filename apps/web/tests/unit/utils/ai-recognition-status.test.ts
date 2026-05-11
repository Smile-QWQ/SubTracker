import { describe, expect, it } from 'vitest'
import { getAiRecognitionStatusText } from '@/utils/ai-recognition-status'

describe('getAiRecognitionStatusText', () => {
  it('returns fast guidance for text-only recognition', () => {
    expect(getAiRecognitionStatusText({ hasImage: false, elapsedMs: 0 })).toBe('识别中，通常几秒内完成，请勿重复点击。')
    expect(getAiRecognitionStatusText({ hasImage: false, elapsedMs: 6_000 })).toBe('仍在识别中，模型响应可能稍慢，请继续稍候。')
  })

  it('returns longer guidance for image recognition', () => {
    expect(getAiRecognitionStatusText({ hasImage: true, elapsedMs: 0 })).toBe('正在识别图片与文本，通常需要 5-10 秒，请勿关闭窗口。')
    expect(getAiRecognitionStatusText({ hasImage: true, elapsedMs: 12_000 })).toBe('图片识别仍在进行中，外部模型响应较慢，请再稍候片刻。')
  })
})
