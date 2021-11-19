import { IFetchComponent } from '@well-known-components/http-server'
import PQueue from 'p-queue'
import { downloadEntityAndContentFiles, Entity, getDeployedEntities } from './snapshot-fetcher'
import { Server, Timestamp } from './types'

/**
 * @public
 */
export type SnapshotsFetcherComponents = {
  fetcher: IFetchComponent
}

/**
 * @public
 */
export type EntityDeployment = {
  entityId: string
  entityType: string
  content: Array<{ key: string; hash: string }>
  auditInfo: any
}

/**
 * @public
 */
export type DownloadEntitiesOptions = {
  catalystServers: string[]
  deployAction: (entity: EntityDeployment) => Promise<any>
  concurrency: number
  jobTimeout: number
  isEntityPresentLocally: (entityId: string) => Promise<boolean>
  contentFolder: string
  components: SnapshotsFetcherComponents
  /**
   * Entity types to fetch
   */
  entityTypes: string[]
}

/**
 * @public
 */
export async function downloadEntities(options: DownloadEntitiesOptions): Promise<Map<Server, Timestamp>> {
  const serverMapLRU = new Map<string, number /* timestamp */>()
  const lastTimestampsMap = new Map()

  const downloadJobQueue = new PQueue({
    concurrency: options.concurrency,
    autoStart: true,
    timeout: options.jobTimeout,
  })

  for await (const { entityId, servers } of getDeployedEntities(
    options.entityTypes,
    options.catalystServers,
    options.components.fetcher,
    lastTimestampsMap
  )) {
    if (await options.isEntityPresentLocally(entityId)) continue

    function scheduleJob() {
      downloadJobQueue.add(async () => {
        try {
          const entityData = await downloadEntityAndContentFiles(
            options.components,
            entityId,
            servers,
            serverMapLRU,
            options.contentFolder
          )
          await options.deployAction(entityData)
        } catch {
          // TODO: Cancel job when fails forever
          scheduleJob()
        }
      })
    }

    scheduleJob()
  }

  await downloadJobQueue.onIdle()

  return lastTimestampsMap
}
