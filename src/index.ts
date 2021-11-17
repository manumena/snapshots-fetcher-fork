import { CatalystClient } from 'dcl-catalyst-client'
import * as fs from 'fs'

// const productiveServers = []
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

// const snapshotsResponse = await fetch(
//   server + '/content/snapshot/wearables'
// );
// const snapshotJson = await snapshotsResponse.json();
// const entityHash = snapshotJson.hash;
// const client = new CatalystClient({ catalystUrl });
// const content = await client.downloadContent(entityHash, {
//   attempts: 3,
//   waitTime: '0.5s',
// });
// const s = fs.createWriteStream('./wearables_peer_2.json');
// await client.pipeContent(entityHash, s);

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

  console.log(entityData)

  // const s = fs.createWriteStream(`./content/${hash}`);
  // await client.pipeContent(hash, s);

  // downlaod all entitie's files (if missing)

  // mark local entity as present
}

async function isEntityPresentLocally(entityId: string) {
  return false
}

async function main() {
  const serverMapLRU = new Map<string, number /* timestamp */>()

  for await (const { entityId, servers } of getDeployedEntities()) {
    await downloadEntityIfMissing(entityId, servers, serverMapLRU)
  }

  // console.log(`Wearables Hashes: ${Array.from(allHashes.keys())}`)

  // // TODO: Only get from the peer that contained the file
  // const client = new CatalystClient({ catalystUrl: `${productiveServers[0]}` });
  // allHashes.forEach( async (hash: string) => {
  //   const s = fs.createWriteStream(`./content/${hash}`);
  //   await client.pipeContent(hash, s);
  // })
}

export type Pointer = string
export type Pointers = Pointer[]

export function extractSceneHashesFromSnapshotData(prev: Set<EntityHash>, next: [EntityHash, Pointers]) {
  const currentHash = next[0]
  prev.add(currentHash)
  return prev
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

export type SnapshotData = [EntityHash, LocationPointer[]][]

export type LocationPointer = string
export type EntityHash = string

main().catch((err) => {
  console.log('ERROR', err)
})
