const { CatalystClient } = require('dcl-catalyst-client');
import * as fs from 'fs';


// const productiveServers = []
const productiveServers = [
  'https://peer.decentraland.org',           // DCL
  'https://peer-ec1.decentraland.org',       // DCL - US East
  'https://peer-wc1.decentraland.org',       // DCL - US West
  'https://peer-eu1.decentraland.org',       // DCL - EU
  'https://peer-ap1.decentraland.org',       // DCL - AP1
  'https://interconnected.online',           // Esteban
  'https://peer.decentral.games',            // Baus
  'https://peer.melonwave.com',              // Ari
  'https://peer.kyllian.me',                 // Kyllian
  'https://peer.uadevops.com',               // SFox
  'https://peer.dclnodes.io',                // DSM
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


async function main() {

  const allHashes: Map<string, string[]> = new Map()


  await Promise.allSettled(productiveServers.map(async server => {

  console.time(server)
   // Get current snapshot
   const { snapshotData } = await getCatalystSnapshot(server, 'profiles')

   snapshotData.forEach( ([entityHash, _]) => {
     const entry = allHashes.get(entityHash)
     if (!entry) {
       allHashes.set(entityHash, [server])
     } else {
       entry.push(server)
     }
   })

  console.timeEnd(server)
  }))


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
  return prev;
}



export async function fetchJson(url: string) {
  const request = await fetch(url)
  if (!request.ok){
    throw new Error()
  }
  const body = await request.json()
  return body
}


export async function getCatalystSnapshot(server: string, entityType: string): Promise<{ snapshotData: SnapshotData; timestamp: number }> {
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
  console.log('ERROR', err);
});
