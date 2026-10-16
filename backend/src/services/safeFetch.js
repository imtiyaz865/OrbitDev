import dns from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { Transform } from 'node:stream'
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib'
import ipaddr from 'ipaddr.js'
import { HttpError } from '../utils/httpError.js'

const MAX_BYTES = 2 * 1024 * 1024
const MAX_REDIRECTS = 4
const TIMEOUT_MS = 10_000
const DNS_TIMEOUT_MS = 5_000

function isPublicAddress(address) {
  if (!ipaddr.isValid(address)) return false
  const parsed = ipaddr.parse(address)
  return parsed.range() === 'unicast'
}

async function resolvePublicHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new HttpError(400, 'Local and internal URLs are not allowed.')
  }
  if (host === 'metadata.google.internal' || host === 'metadata.google' || host === '169.254.169.254') {
    throw new HttpError(400, 'Cloud metadata URLs are not allowed.')
  }
  if (net.isIP(host)) {
    if (!isPublicAddress(host)) throw new HttpError(400, 'Private and reserved IP addresses are not allowed.')
    return { address: host, family: net.isIP(host) }
  }

  let addresses
  let timeout
  try {
    addresses = await Promise.race([
      dns.lookup(host, { all: true, verbatim: true }),
      new Promise((_resolve, reject) => {
        timeout = setTimeout(() => reject(new HttpError(408, 'The URL host took too long to resolve.')), DNS_TIMEOUT_MS)
      }),
    ])
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(400, 'The URL host could not be resolved.')
  } finally {
    clearTimeout(timeout)
  }
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new HttpError(400, 'The URL resolves to a private or reserved address.')
  }
  return addresses[0]
}

function requestPage(url, resolvedAddress) {
  const isHttps = url.protocol === 'https:'
  const requestModule = isHttps ? https : http
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  const request = requestModule.request({
    protocol: url.protocol,
    hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: `${url.pathname}${url.search}`,
    method: 'GET',
    agent: false,
    servername: isHttps && !net.isIP(hostname) ? hostname : undefined,
    lookup: (_hostname, options, callback) => {
      if (options?.all) callback(null, [resolvedAddress])
      else callback(null, resolvedAddress.address, resolvedAddress.family)
    },
    headers: {
      'User-Agent': 'TheOrbitEventIndexer/1.0 (+public event metadata retrieval)',
      Accept: 'text/html,application/xhtml+xml;q=0.9',
      'Accept-Encoding': 'identity',
      Host: url.host,
    },
  })

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      const error = new Error('Source page timed out.')
      error.code = 'ETIMEDOUT'
      request.destroy(error)
    }, TIMEOUT_MS)
    request.once('response', (response) => resolve({ request, response, timeout }))
    request.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    request.end()
  })
}

function decoderFor(encoding) {
  switch (encoding.toLowerCase()) {
    case '':
    case 'identity':
      return null
    case 'gzip':
    case 'x-gzip':
      return createGunzip()
    case 'deflate':
      return createInflate()
    case 'br':
      return createBrotliDecompress()
    default:
      throw new HttpError(422, 'The source page uses an unsupported content encoding.')
  }
}

async function readHtml(response) {
  const contentType = response.headers['content-type'] || ''
  if (!contentType.toLowerCase().includes('text/html')) {
    throw new HttpError(422, 'The source URL did not return an HTML page.')
  }
  const declaredLength = Number(response.headers['content-length'] || 0)
  if (declaredLength > MAX_BYTES) throw new HttpError(413, 'The source page is larger than the supported limit.')
  const decoder = decoderFor(response.headers['content-encoding'] || '')
  let rawSize = 0
  const rawLimit = new Transform({
    transform(chunk, _encoding, callback) {
      rawSize += chunk.length
      if (rawSize > MAX_BYTES) callback(new HttpError(413, 'The source page is larger than the supported limit.'))
      else callback(null, chunk)
    },
  })
  const content = decoder ? response.pipe(rawLimit).pipe(decoder) : response.pipe(rawLimit)
  const chunks = []
  let decodedSize = 0
  try {
    for await (const chunk of content) {
      decodedSize += chunk.length
      if (decodedSize > MAX_BYTES) {
        content.destroy()
        throw new HttpError(413, 'The source page is larger than the supported limit.')
      }
      chunks.push(chunk)
    }
  } catch (error) {
    content.destroy()
    if (error instanceof HttpError) throw error
    if (error.code === 'ETIMEDOUT') throw error
    throw new HttpError(422, 'The source page could not be decoded.')
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function safeFetchPage(input) {
  let current
  try {
    current = new URL(input)
  } catch {
    throw new HttpError(400, 'Enter a valid event page URL.')
  }
  if (!['http:', 'https:'].includes(current.protocol) || current.username || current.password) {
    throw new HttpError(400, 'Only public HTTP or HTTPS URLs are supported.')
  }

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const resolvedAddress = await resolvePublicHost(current.hostname)
    let activeRequest
    try {
      const { request, response, timeout } = await requestPage(current, resolvedAddress)
      activeRequest = request
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        const location = response.headers.location
        response.destroy()
        clearTimeout(timeout)
        if (!location || redirect === MAX_REDIRECTS) throw new HttpError(422, 'The source redirected too many times.')
        current = new URL(location, current)
        if (!['http:', 'https:'].includes(current.protocol) || current.username || current.password) {
          throw new HttpError(400, 'Redirects to unsupported URLs are not allowed.')
        }
        continue
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.destroy()
        clearTimeout(timeout)
        throw new HttpError(422, `The source page returned HTTP ${response.statusCode}.`)
      }
      if (!response.readable) {
        clearTimeout(timeout)
        throw new HttpError(422, 'The source page did not include readable content.')
      }
      try {
        const html = await readHtml(response)
        clearTimeout(timeout)
        return { html, finalUrl: current.href }
      } finally {
        clearTimeout(timeout)
      }
    } catch (error) {
      activeRequest?.destroy()
      if (error instanceof HttpError) throw error
      if (error.code === 'ETIMEDOUT') throw new HttpError(408, 'The source page took too long to respond.')
      throw new HttpError(422, 'The source page could not be retrieved.')
    }
  }
  throw new HttpError(422, 'The source page could not be retrieved.')
}
