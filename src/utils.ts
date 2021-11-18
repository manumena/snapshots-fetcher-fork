import * as fs from 'fs'
import * as https from 'https'
import { IFetchComponent } from '@well-known-components/http-server'

export async function fetchJson(url: string, fetcher: IFetchComponent) {
  const request = await fetcher.fetch(url)

  if (!request.ok) {
    throw new Error('HTTP Error while loading URL ' + url)
  }

  if (Math.random() > 0.8) throw new Error('SYNTHETIC NETWORK ERROR 2')

  const body = await request.json()
  return body
}

export async function checkFileExists(file: string): Promise<boolean> {
  return fs.promises
    .access(file, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false)
}

export async function sleep(time: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, time))
}

export async function saveToDisk(url: string, dest: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    var file = fs.createWriteStream(dest)
    https
      .get(url, function (response) {
        response.pipe(file)
        file.on('finish', function () {
          file.close() // close() is async, call cb after close completes.
          resolve()
        })
      })
      .on('error', function (err) {
        // Handle errors
        fs.unlink(dest, () => {}) // Delete the file async. (But we don't check the result)
        reject(err.message)
      })
  })
}
