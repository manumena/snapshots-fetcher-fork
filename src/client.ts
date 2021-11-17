import { SnapshotData } from './types'
import { fetchJson, saveToDisk } from './utils'

export async function getEntityById(entityId: string, server: string) {
  const url = new URL(`/content/entities/wearable?id=${encodeURIComponent(entityId)}`, server)
  return fetchJson(url.toString())
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

export async function saveContentFileToDisk(server: string, hash: string, dest: string) {
  const url = new URL(`/content/contents/${hash}`, server)

  if (Math.random() > 0.8) throw new Error('SYNTHETIC NETWORK ERROR')

  await saveToDisk(url.toString(), dest)
  // Check Hash or throw
  return
}
