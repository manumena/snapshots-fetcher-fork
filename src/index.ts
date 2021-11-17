import { CatalystClient } from 'dcl-catalyst-client'
import * as fs from 'fs'
import * as https from 'https'
import * as path from 'path'

const productiveServers = [
  'https://peer.decentraland.org', // DCL
  'https://peer-ec1.decentraland.org', // DCL - US East
  'https://peer-wc1.decentraland.org', // DCL - US West
  'https://peer-eu1.decentraland.org', // DCL - EU
  'https://peer-ap1.decentraland.org', // DCL - AP1
  'https://interconnected.online', // Esteban
  'https://peer.decentral.games', // Baus
  'https://peer.melonwave.com', // Ari
  'https://peer.kyllian.me', // Kyllian
  'https://peer.uadevops.com', // SFox
  'https://peer.dclnodes.io', // DSM
]
const downloadsFolder = path.resolve('downloads')

export type SnapshotData = [EntityHash, Pointers][]
export type Pointer = string
export type Pointers = Pointer[]
export type EntityHash = string
export type Server = string

async function* getDeployedEntities() {
  const allHashes: Map<string, string[]> = new Map()

  await Promise.allSettled(
    productiveServers.map(async (server) => {
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

async function getEntityById(entityId: string, server: string) {
  const url = new URL(`/content/entities/wearable?id=${encodeURIComponent(entityId)}`, server)
  return fetchJson(url.toString())
}


async function downloadEntityIfMissing(
  entityId: string,
  presentInServers: string[],
  serverMapLRU: Map<string, number /* timestamp */>
) {
  if (await isEntityPresentLocally(entityId)) return

  const serverToUse = pickLeastRecentlyUsedServer(presentInServers, serverMapLRU)

  // download entity

  // download entity json
  const client = new CatalystClient({ catalystUrl: serverToUse })

  const entityData = await getEntityById(entityId, serverToUse)


  const contents = entityData[0].content

  for (const {hash} of contents) {
    // download all entitie's files (if missing)
    const fileName = path.join(downloadsFolder, hash)
    if (! await checkFileExists(fileName)) {
      console.time(fileName)
      await saveContentFileToDisk(serverToUse, hash, fileName)
      console.timeEnd(fileName)
    }
  }


  // mark local entity as present
}


async function checkFileExists(file: string): Promise<boolean> {
  return fs.promises
    .access(file, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false)
}

async function saveContentFileToDisk(server: string, hash: string, dest: string) {
  const url = new URL(`/content/contents/${hash}`, server)
  await saveToDisk(url.toString(), dest)
  // Check Hash or throw
  return
}

async function saveToDisk(url: string, dest: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {

    var file = fs.createWriteStream(dest);
    var request = https.get(url, function(response) {
      response.pipe(file);
      file.on('finish', function() {
        file.close();  // close() is async, call cb after close completes.
        resolve()
      });
    }).on('error', function(err) { // Handle errors
      fs.unlink(dest, () => {}); // Delete the file async. (But we don't check the result)
      reject(err.message);
    })
  })
};



async function isEntityPresentLocally(entityId: string) {
  return false
}


export async function fetchJson(url: string) {
  const request = await fetch(url)
  if (!request.ok) {
    throw new Error('HTTP Error while loading URL ' + url)
  }
  const body = await request.json()
  return body
}

export async function getCatalystSnapshot(
  server: string,
  entityType: string
): Promise<{ snapshotData: SnapshotData; timestamp: number }> {
  const snapshot = await fetchJson(`${server}/content/snapshot/${entityType}`)
  const hash: string = snapshot['hash']
  const timestamp: number = snapshot['lastIncludedDeploymentTimestamp']
  if (!hash || !timestamp) {
    throw new Error(`Invalid response from server: ${JSON.stringify(snapshot)}`)
  }
  const snapshotData: SnapshotData = await fetchJson(`${server}/content/contents/${hash}`)
  return { snapshotData, timestamp }
}

async function main() {
  const serverMapLRU = new Map<string, number /* timestamp */>()

  for await (const { entityId, servers } of getDeployedEntities()) {
    await downloadEntityIfMissing(entityId, servers, serverMapLRU)
  }

}


main().catch((err) => {
  console.log('ERROR', err)
})
