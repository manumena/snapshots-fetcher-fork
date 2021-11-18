// This file is the "test-environment" analogous for src/components.ts
// Here we define the test components to be used in the testing environment

import { createRunner } from '@well-known-components/test-helpers'
import { SnapshotsFetcherComponents } from '../src'
import { createFetchComponent } from './test-component'

/**
 * Behaves like Jest "describe" function, used to describe a test for a
 * use case, it creates a whole new program and components to run an
 * isolated test.
 *
 * State is persistent within the steps of the test.
 */
export const test = createRunner<SnapshotsFetcherComponents>({
  async main({ startComponents }) {
    await startComponents()
  },
  async initComponents() {
    return {
      fetcher: createFetchComponent(),
    }
  },
})
