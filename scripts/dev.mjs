import { spawn } from 'node:child_process'

const npmExecPath = process.env.npm_execpath

if (!npmExecPath) {
  console.error('未找到 npm_execpath，无法启动 workspace dev 脚本。')
  process.exit(1)
}

const children = []
let shuttingDown = false

function startWorkspace(name, color, args) {
  const child = spawn(process.execPath, [npmExecPath, ...args], {
    cwd: process.cwd(),
    stdio: ['inherit', 'pipe', 'pipe'],
    env: {
      ...process.env,
      FORCE_COLOR: '1'
    }
  })

  child.stdout?.on('data', (chunk) => {
    process.stdout.write(`${color}[${name}]\x1b[0m ${chunk}`)
  })

  child.stderr?.on('data', (chunk) => {
    process.stderr.write(`${color}[${name}]\x1b[0m ${chunk}`)
  })

  child.on('exit', (code, signal) => {
    if (!shuttingDown) {
      if (signal) {
        console.log(`[${name}] 已退出，signal=${signal}`)
      } else {
        console.log(`[${name}] 已退出，code=${code}`)
      }
      shutdown(code ?? 0)
    }
  })

  children.push(child)
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true

  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGINT')
    }
  }

  setTimeout(() => {
    for (const child of children) {
      if (!child.killed) {
        child.kill('SIGTERM')
      }
    }
  }, 1200)

  setTimeout(() => {
    process.exit(exitCode)
  }, 1800)
}

process.on('SIGINT', () => {
  console.log('\n正在关闭开发服务...')
  shutdown(0)
})

process.on('SIGTERM', () => {
  shutdown(0)
})

startWorkspace('api', '\x1b[36m', ['run', 'dev', '-w', 'apps/api'])
startWorkspace('web', '\x1b[35m', ['run', 'dev', '-w', 'apps/web'])
