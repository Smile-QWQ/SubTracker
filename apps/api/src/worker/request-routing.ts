export function requiresWorkerRuntimeContext(pathname: string) {
  return pathname.startsWith('/api/') || pathname.startsWith('/static/logos/')
}
