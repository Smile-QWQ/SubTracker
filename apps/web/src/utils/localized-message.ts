import { useMessage, createDiscreteApi } from 'naive-ui'

type MaybeContent = string | (() => string)

function normalizeContent(content: MaybeContent) {
  return typeof content === 'function' ? content() : content
}

export function useLocalizedMessage() {
  const message = useMessage()

  return {
    ...message,
    success(content: MaybeContent, ...args: unknown[]) {
      return message.success(normalizeContent(content), ...(args as []))
    },
    error(content: MaybeContent, ...args: unknown[]) {
      return message.error(normalizeContent(content), ...(args as []))
    },
    warning(content: MaybeContent, ...args: unknown[]) {
      return message.warning(normalizeContent(content), ...(args as []))
    },
    info(content: MaybeContent, ...args: unknown[]) {
      return message.info(normalizeContent(content), ...(args as []))
    }
  }
}

export function createLocalizedDiscreteMessage() {
  const { message } = createDiscreteApi(['message'])

  return {
    success(content: string) {
      return message.success(content)
    },
    error(content: string) {
      return message.error(content)
    },
    warning(content: string) {
      return message.warning(content)
    },
    info(content: string) {
      return message.info(content)
    }
  }
}
