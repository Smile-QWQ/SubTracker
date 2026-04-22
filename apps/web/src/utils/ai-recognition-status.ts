export function getAiRecognitionStatusText(input: { hasImage: boolean; elapsedMs: number }) {
  if (input.hasImage) {
    if (input.elapsedMs >= 12_000) {
      return '图片识别仍在进行中，外部模型响应较慢，请再稍候片刻。'
    }
    return '正在识别图片与文本，通常需要 5-10 秒，请勿关闭窗口。'
  }

  if (input.elapsedMs >= 6_000) {
    return '仍在识别中，模型响应可能稍慢，请继续稍候。'
  }

  return '识别中，通常几秒内完成，请勿重复点击。'
}
