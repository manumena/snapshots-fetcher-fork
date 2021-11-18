import { downloadEntities } from '../src'
import * as path from 'path'
import { checkFileExists } from '../src/utils'

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

import { IFetchComponent } from '@well-known-components/http-server'
import * as nodeFetch from 'node-fetch'

export function createFetchComponent() {
  const fetch: IFetchComponent = {
    async fetch(url: nodeFetch.RequestInfo, init?: nodeFetch.RequestInit): Promise<nodeFetch.Response> {
      return nodeFetch.default(url, init)
    },
  }

  return fetch
}

downloadEntities({
  catalystServers: productiveServers,
  async deployAction(entity) {
    console.log('Deploying local entity ' + entity.id)
  },
  concurrency: 10,
  jobTimeout: 30000,
  async isEntityPresentLocally(entityId) {
    return checkFileExists(path.join(`downloads`, entityId))
  },
  contentFolder: downloadsFolder,
  components: {
    fetcher: createFetchComponent(),
  },
}).catch((err) => {
  console.log('ERROR', err)
})
