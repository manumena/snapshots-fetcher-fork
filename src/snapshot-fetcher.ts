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
  targetForlder: string
) {
  const serverToUse = pickLeastRecentlyUsedServer(presentInServers, serverMapLRU)

  // download entity json
  const entityData = await getEntityById(entityId, serverToUse)
  // const fileName = path.join(downloadsFolder, entityId)
  // await fs.promises.writeFile(fileName, entityData)

  const contents = entityData[0].content

  for (const { hash } of contents) {
    // download all entitie's files (if missing)
    const fileName = path.join(targetForlder, hash)
    if (!(await checkFileExists(fileName))) {
      console.time(fileName)
      await saveContentFileToDisk(serverToUse, hash, fileName)
      console.timeEnd(fileName)
    }
  }

  return entityData[0]
}

export async function isEntityPresentLocally(entityId: string) {
  return false
}

/*
  getDeployedEntities: -> downloadContent() -> deployLocally()
    - fetch all snapshots // and pointer-changes
    - dedup
*/
