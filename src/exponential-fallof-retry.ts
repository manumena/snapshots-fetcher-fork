import { ILoggerComponent } from '@well-known-components/interfaces'
import { IJobWithLifecycle } from './job-lifecycle-manager'
import { sleep } from './utils'

/**
 * @public
 */
export type ExponentialFallofRetryComponent = IJobWithLifecycle & {
  getRetryCount(): number
  isStopped(): boolean
}

/**
 * @public
 */
export type ExponentialFallofRetryOptions = {
  retryTime: number
  /**
   * @default 1.1
   */
  retryTimeExponent?: number
  action: () => Promise<void>
}

/**
 * Creates a component that executes an action over and over until it is stopped.
 * Retries are exponential.
 * @public
 */
export function createExponentialFallofRetry(
  logs: ILoggerComponent.ILogger,
  options: ExponentialFallofRetryOptions
): ExponentialFallofRetryComponent {
  let started: boolean = false

  let reconnectionCount = 0

  async function start() {
    // reset reconnection time
    let reconnectionTime = options.retryTime

    while (true) {
      logs.info('Starting...')
      reconnectionCount++

      try {
        await options.action()
      } catch (e: any) {
        logs.error(e)
        // increment reconnection time
        reconnectionTime = reconnectionTime * (options.retryTimeExponent ?? 1.1)
      }

      if (!started) {
        // break iterator if closed
        logs.info('Breaking iteration, started == false')
        return
      }

      if (!options.retryTime) {
        // break iterator if no retryTime was set
        logs.info('Not iterating due to missing or zero options.retryTime')
        return
      }

      reconnectionTime = Math.min(reconnectionTime, 86_400_000 /* one day */)

      logs.info('Retrying in ' + reconnectionTime.toFixed(1) + 'ms')
      await sleep(reconnectionTime)
    }
  }

  return {
    getRetryCount() {
      return reconnectionCount
    },
    isStopped() {
      return started != true
    },
    async start() {
      if (started === true) return
      started = true
      await start()
    },
    async stop() {
      started = false
    },
  }
}
