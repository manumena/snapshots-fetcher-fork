// TODO: first download files to tmp folder, then validate CID and if valid, move to downloads folder

import future, { IFuture } from 'fp-future'
import * as path from 'path'
import { getCatalystSnapshot, saveContentFileToDisk } from './client'
import { checkFileExists, fetchJson, sleep } from './utils'
import PQueue from 'p-queue'
import { EntityHash, Path, Server } from './types'
import * as fs from 'fs'
import { IFetchComponent } from '@well-known-components/http-server'
import { SnapshotsFetcherComponents } from '.'

/**
 * @public
 */
export type ContentMapping = { file: string; hash: string }

/**
 * @public
 */
export type Entity = { id: string; content: undefined | ContentMapping[] }

const downloadJobQueue = new PQueue({
  concurrency: 10,
  autoStart: true,
  timeout: 60000,
})

const downloadFileJobsMap = new Map<Path, DownloadContentFileJob>()
const MAX_DOWNLOAD_RETRIES = 10
const MAX_DOWNLOAD_RETRIES_WAIT_TIME = 1000

type DownloadContentFileJob = {
  servers: Set<string>
  future: IFuture<any>
  retries: number
  fileName: string
}

export async function* getDeployedEntities(servers: string[], fetcher: IFetchComponent) {
  const allHashes: Map<string, string[]> = new Map()

  await Promise.allSettled(
    servers.map(async (server) => {
      console.time(server)
      try {
        // Get current snapshot
        const { snapshotData } = await getCatalystSnapshot(server, 'wearables', fetcher)

        snapshotData.forEach(([entityHash, _]) => {
          const entry = allHashes.get(entityHash)
          if (!entry) {
            allHashes.set(entityHash, [server])
          } else {
            entry.push(server)
          }
        })
      } catch (e: any) {
        console.error(`Error while loading snapshots from ${server}`)
        console.error(e)
      } finally {
        console.timeEnd(server)
      }
    })
  )

  for (const [entityId, servers] of allHashes) {
    yield { entityId, servers }
  }
}

function pickLeastRecentlyUsedServer(
  serversToPickFrom: Server[],
  _serverMap: Map<string, number /* timestamp */>
): string {
  let mostSuitableOption = serversToPickFrom[Math.floor(Math.random() * serversToPickFrom.length)]
  // TODO: implement load balancing strategy
  return mostSuitableOption
}

export async function getEntityById(entityId: string, server: string, fetcher: IFetchComponent): Promise<Entity> {
  const url = new URL(`/content/entities/wearable?id=${encodeURIComponent(entityId)}`, server)

  const response: Entity[] = await fetchJson(url.toString(), fetcher)
  return response[0]
}


export async function downloadEntityAndContentFiles(
  components: SnapshotsFetcherComponents,
  entityId: EntityHash,
  presentInServers: string[],
  serverMapLRU: Map<Server, number>,
  targetFolder: string
) {
  // download entity metadata +

  const serverToUse = pickLeastRecentlyUsedServer(presentInServers, serverMapLRU)
  const entityMetadata: Entity = await getEntityById(entityId, serverToUse, components.fetcher)

  // download entity file
  const downloadEntityFileJob = downloadFileWithRetries(entityId, targetFolder, presentInServers, serverMapLRU)
  await downloadEntityFileJob.future


  if (!entityMetadata.content) {
    throw new Error(`The entity ${entityId} does not contain .content`)
  }

  const contents = entityMetadata.content.map((content) => {
    const job = downloadFileWithRetries(content.hash, targetFolder, presentInServers, serverMapLRU)
    return job.future
  })

  await Promise.all(contents)

  return entityMetadata
}

const mapForTesting: Map<string, number> = new Map()

/**
 * Downloads a content file, reuses jobs if the file is already scheduled to be downloaded or it is
 * being downloaded
 */
function downloadFileWithRetries(
  hashToDownload: string,
  targetFolder: string,
  presentInServers: string[],
  serverMapLRU: Map<string, number>
): DownloadContentFileJob {
  const finalFileName = path.join(targetFolder, hashToDownload)

  if (!downloadFileJobsMap.has(finalFileName)) {
    const job: DownloadContentFileJob = {
      servers: new Set(presentInServers),
      future: future(),
      retries: 0,
      fileName: finalFileName,
    }

    job.future.finally(() => {
      downloadFileJobsMap.delete(finalFileName)
    })

    downloadFileJobsMap.set(finalFileName, job)

    downloadJobQueue.add(async () => {
      while (true) {
        try {
          // TODO: round robin servers when fails
          const serverToUse = pickLeastRecentlyUsedServer(presentInServers, serverMapLRU)
          if (mapForTesting.has(hashToDownload)) {
            throw new Error('CHAU')
          }
          mapForTesting.set(hashToDownload, 1)
          await downloadContentFile(hashToDownload, finalFileName, serverToUse)

          job.future.resolve(hashToDownload)
        } catch (e: any) {
          console.error(e)
          job.retries++
          console.log(`Retrying download of hash ${hashToDownload} ${job.retries}/${MAX_DOWNLOAD_RETRIES}`)
          if (job.retries < MAX_DOWNLOAD_RETRIES) {
            await sleep(MAX_DOWNLOAD_RETRIES_WAIT_TIME)
            continue
          } else {
            job.future.reject(e)
          }
        } finally {
          mapForTesting.delete(hashToDownload)
        }
        return
      }
    })
  }

  return downloadFileJobsMap.get(finalFileName)!
}

async function downloadContentFile(hash: string, finalFileName: string, serverToUse: string) {
  // download all entitie's files (if missing)
  if (!(await checkFileExists(finalFileName))) {
    await saveContentFileToDisk(serverToUse, hash, finalFileName)
  }
}

/*
  getDeployedEntities: -> downloadContent() -> deployLocally()
    - fetch all snapshots // and pointer-changes
    - dedup
*/
