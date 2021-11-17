import * as path from 'path'
import PQueue from 'p-queue'
import { downloadEntity, getDeployedEntities, isEntityPresentLocally } from './snapshot-fetcher'
import { Entity, EntityMetadata } from 'dcl-catalyst-commons'

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

type DownloadEntitiesOptions = {
  catalystServers: string[]
  deployAction: (entity: Entity) => Promise<any>
  concurrency: number
  jobTimeout: number
}

async function downloadEntities(options: DownloadEntitiesOptions) {
  const serverMapLRU = new Map<string, number /* timestamp */>()

  const downloadJobQueue = new PQueue({
    concurrency: options.concurrency,
    autoStart: true,
    timeout: options.jobTimeout,
  })

  for await (const { entityId, servers } of getDeployedEntities(options.catalystServers)) {
    if (await isEntityPresentLocally(entityId)) continue

    downloadJobQueue.add(async () => {
      const entityData = await downloadEntity(entityId, servers, serverMapLRU, downloadsFolder)
      await options.deployAction(entityData)
    })
  }

  await downloadJobQueue.onIdle()
}

downloadEntities({
  catalystServers: productiveServers,
  async deployAction(entity) {
    console.log('Deploying local entity ' + entity.id)
  },
  concurrency: 10,
  jobTimeout: 30000,
}).catch((err) => {
  console.log('ERROR', err)
})
