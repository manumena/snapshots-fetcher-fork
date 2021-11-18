import { IFetchComponent } from '@well-known-components/http-server'
import { SnapshotData } from './types'
import { fetchJson, saveToDisk } from './utils'

export async function getCatalystSnapshot(
  server: string,
  entityType: string,
  fetcher: IFetchComponent
): Promise<{ snapshotData: SnapshotData; timestamp: number }> {
  const snapshot = await fetchJson(`${server}/content/snapshot/${entityType}`, fetcher)
  const hash: string = snapshot['hash']
  const timestamp: number = snapshot['lastIncludedDeploymentTimestamp']
  if (!hash || !timestamp) {
    throw new Error(`Invalid response from server: ${JSON.stringify(snapshot)}`)
  }
  const snapshotData: SnapshotData = await fetchJson(`${server}/content/contents/${hash}`, fetcher)
  return { snapshotData, timestamp }
}

export async function saveContentFileToDisk(server: string, hash: string, dest: string) {
  const url = new URL(`/content/contents/${hash}`, server)

  // if (Math.random() > 0.8) throw new Error('SYNTHETIC NETWORK ERROR')

  await saveToDisk(url.toString(), dest)
  // TODO: Check Hash or throw
  return
}
