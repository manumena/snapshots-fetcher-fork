import { metricsDefinitions } from './metrics'
import { EntityDeployment, RemoteEntityDeployment, SnapshotsFetcherComponents } from './types'
import { contentServerMetricLabels, fetchJson, saveToDisk } from './utils'

export async function getGlobalSnapshot(components: SnapshotsFetcherComponents, server: string, retries: number) {
  // TODO: validate response
  return await components.downloadQueue.scheduleJobWithRetries(
    () => fetchJson(`${server}/content/snapshot`, components.fetcher),
    retries
  )
}

export async function* fetchJsonPaginated<T>(
  components: Pick<SnapshotsFetcherComponents, 'fetcher' | 'metrics'>,
  url: string,
  selector: (responseBody: any) => T[],
  responseTimeMetric: keyof typeof metricsDefinitions
): AsyncIterable<T> {
  // Perform the different queries
  let currentUrl = url
  while (currentUrl) {
    const metricLabels = contentServerMetricLabels(currentUrl)
    const { end: stopTimer } = components.metrics.startTimer(responseTimeMetric)
    const partialHistory: any = await fetchJson(currentUrl, components.fetcher)
    stopTimer({ ...metricLabels })

    for (const elem of selector(partialHistory)) {
      yield elem
    }

    if (partialHistory.pagination) {
      const nextRelative: string | void = partialHistory.pagination.next
      if (!nextRelative) break
      currentUrl = new URL(nextRelative, currentUrl).toString()
    } else {
      break
    }
  }
}

export function fetchPointerChanges(
  components: Pick<SnapshotsFetcherComponents, 'fetcher' | 'metrics'>,
  server: string,
  fromTimestamp: number
): AsyncIterable<RemoteEntityDeployment> {
  const url = new URL(
    `/content/pointer-changes?sortingOrder=ASC&sortingField=local_timestamp&from=${encodeURIComponent(fromTimestamp)}`,
    server
  ).toString()
  return fetchJsonPaginated(components, url, ($) => $.deltas, 'dcl_catalysts_pointer_changes_response_time_seconds')
}

export async function saveContentFileToDisk(
  components: Pick<SnapshotsFetcherComponents, 'metrics'>,
  server: string,
  hash: string,
  destinationFilename: string
) {
  const url = new URL(`/content/contents/${hash}`, server).toString()

  return await saveToDisk(components, url, destinationFilename, hash)
}

export async function getEntityById(
  components: Pick<SnapshotsFetcherComponents, 'fetcher'>,
  entityId: string,
  server: string
): Promise<EntityDeployment> {
  const url = new URL(`/content/deployments/?entityId=${encodeURIComponent(entityId)}&fields=auditInfo,content`, server)

  const response = await fetchJson(url.toString(), components.fetcher)

  if (!response.deployments[0]) {
    throw new Error(`The entity ${entityId} could not be found in server ${server}`)
  }

  const deployment: EntityDeployment = response.deployments[0]

  if (!deployment.auditInfo || !Array.isArray(deployment.auditInfo.authChain)) {
    throw new Error(`The remote entity ${entityId} at ${server} does not contain .auditInfo.authChain`)
  }

  if (!deployment.entityId) {
    throw new Error(`The remote entity ${entityId} at ${server} does not contain .entityId`)
  }

  if (!deployment.entityType) {
    throw new Error(`The remote entity ${entityId} at ${server} does not contain .entityType`)
  }

  if (!deployment.content) {
    deployment.content = []
  }

  return deployment
}
