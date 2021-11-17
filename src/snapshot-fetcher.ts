import { Entity } from 'dcl-catalyst-commons'
import future, { IFuture } from 'fp-future'
import * as path from 'path'
import { getCatalystSnapshot, getEntityById, saveContentFileToDisk } from './client'
import { checkFileExists, sleep } from './utils'
import PQueue from 'p-queue'
import { hash } from 'eth-crypto'

const downloadJobQueue = new PQueue({
  concurrency: 10,
  autoStart: true,
  timeout: 60000,
})
const downloadFileJobsMap = new Map<string /* path */, DownloadContentFileJob>()
const MAX_DOWNLOAD_RETRIES = 10
const MAX_DOWNLOAD_RETRIES_WAIT_TIME = 1000

type DownloadContentFileJob = {
  servers: Set<string>
  future: IFuture<any>
  retries: number
}


export async function* getDeployedEntities(servers: string[]) {
  const allHashes: Map<string, string[]> = new Map()

  await Promise.allSettled(
    servers.map(async (server) => {
      console.time(server)
      try {
        // Get current snapshot
        const { snapshotData } = await getCatalystSnapshot(server, 'wearables')

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
  serversToPickFrom: string[],
  _serverMap: Map<string, number /* timestamp */>
): string {
  let mostSuitableOption = serversToPickFrom[Math.floor(Math.random() * serversToPickFrom.length)]
  // TODO: implement load balancing strategy
  return mostSuitableOption
}

export async function downloadEntity(
  entityId: string,
  presentInServers: string[],
  serverMapLRU: Map<string, number /* timestamp */>,
  targetFolder: string
) {
  const serverToUse = pickLeastRecentlyUsedServer(presentInServers, serverMapLRU)

  // download entity json
  const entityData = await getEntityById(entityId, serverToUse)
  // const fileName = path.join(downloadsFolder, entityId)
  // await fs.promises.writeFile(fileName, entityData)

  await downloadContentFromEntity(entityData, targetFolder, presentInServers, serverMapLRU)

  return entityData[0]
}

async function downloadContentFromEntity(
  entityData: Entity[],
  targetFolder: string,
  presentInServers: string[],
  serverMapLRU: Map<string, number /* timestamp */>
) {
  const contents = entityData[0].content!.map(async (content) => {
    const job = await downloadFileWithRetries(content.hash, targetFolder, presentInServers, serverMapLRU)
    await job.future
  })
  await Promise.all(contents)
}

const mapForTesting: Map<string, number> = new Map()

/**
 * Downloads a content file, reuses jobs if the file is already scheduled to be downloaded or it is
 * being downloaded
 */
async function downloadFileWithRetries(
  hashToDownload: string,
  targetFolder: string,
  presentInServers: string[],
  serverMapLRU: Map<string, number>
): Promise<DownloadContentFileJob> {
  const finalFileName = path.join(targetFolder, hashToDownload)

  if (!downloadFileJobsMap.has(finalFileName)) {
    const job: DownloadContentFileJob = {
      servers: new Set(presentInServers),
      future: future(),
      retries: 0,
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
            throw new Error("CHAU" )
          }
          mapForTesting.set(hashToDownload, 1)
          await downloadContentFile(hashToDownload, finalFileName, serverToUse)
          mapForTesting.delete(hashToDownload)

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

export async function isEntityPresentLocally(entityId: string) {
  return false
}

/*
  getDeployedEntities: -> downloadContent() -> deployLocally()
    - fetch all snapshots // and pointer-changes
    - dedup
*/
