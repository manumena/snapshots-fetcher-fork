import { IFetchComponent } from '@well-known-components/http-server'
import PQueue from 'p-queue'
import { downloadEntityAndContentFiles, Entity, getDeployedEntities } from './snapshot-fetcher'

/**
 * @public
 */
export type DownloadEntitiesOptions = {
  catalystServers: string[]
  deployAction: (entity: Entity) => Promise<any>
  concurrency: number
  jobTimeout: number
  isEntityPresentLocally: (entityId: string) => Promise<boolean>
  contentFolder: string
  components: {
    fetcher: IFetchComponent
  }
}

/**
 * @public
 */
export async function downloadEntities(options: DownloadEntitiesOptions) {
  const serverMapLRU = new Map<string, number /* timestamp */>()

  const downloadJobQueue = new PQueue({
    concurrency: options.concurrency,
    autoStart: true,
    timeout: options.jobTimeout,
  })

  for await (const { entityId, servers } of getDeployedEntities(options.catalystServers, options.components.fetcher)) {
    if (await options.isEntityPresentLocally(entityId)) continue

    function scheduleJob() {
      downloadJobQueue.add(async () => {
        try {
          const entityData = await downloadEntityAndContentFiles(entityId, servers, serverMapLRU, options.contentFolder)
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
}
