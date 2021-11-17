import { Entity } from 'dcl-catalyst-commons'
import future from 'fp-future'
import * as path from 'path'
import { getCatalystSnapshot, getEntityById, saveContentFileToDisk } from './client'
import { checkFileExists } from './utils'


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

async function downloadContentFromEntity(entityData: Entity[], targetFolder: string,
  presentInServers: string[],
  serverMapLRU: Map<string, number /* timestamp */>) {


  const contents = entityData[0].content!.map(content =>
    downloadFileWithRetries(content.hash, targetFolder, presentInServers, serverMapLRU)
  )
  await Promise.all(contents)

}


async function downloadFileWithRetries(hash: string, targetFolder: string, presentInServers: string[], serverMapLRU: Map<string, number>) {
  return downloadFileBla(hash, targetFolder, presentInServers, serverMapLRU )
}

async function downloadFileBla(hash: string, targetFolder: string, presentInServers: string[], serverMapLRU: Map<string, number>) {

  // download all entitie's files (if missing)
  const fileName = path.join(targetFolder, hash)
  if (!(await checkFileExists(fileName))) {
    const serverToUse = pickLeastRecentlyUsedServer(presentInServers, serverMapLRU)
    console.time(fileName)
    await saveContentFileToDisk(serverToUse, hash, fileName)
    console.timeEnd(fileName)
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
