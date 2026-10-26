/** Pinata v3 uploads. The JWT never leaves the server. */
const PINATA_UPLOAD = 'https://uploads.pinata.cloud/v3/files'
const GATEWAY = 'https://ipfs.io/ipfs/'

export class UploadError extends Error {}

async function pin(jwt: string, file: Blob, filename: string): Promise<string> {
  const fd = new FormData()
  fd.append('network', 'public')
  fd.append('file', file, filename)
  const res = await fetch(PINATA_UPLOAD, { method: 'POST', headers: { Authorization: `Bearer ${jwt}` }, body: fd })
  const text = await res.text()
  if (!res.ok) throw new UploadError(`IPFS upload failed (${res.status}).`)
  const cid = (JSON.parse(text) as { data?: { cid?: string } }).data?.cid
  if (!cid) throw new UploadError('IPFS upload returned no CID.')
  return cid
}

export async function pinataUploadMetadata(
  jwt: string,
  m: { file: File; name: string; symbol: string; description: string; twitter: string; telegram: string; website: string },
): Promise<{ metadataUri: string; imageUri: string }> {
  const ext = m.file.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png'
  const imageUri = GATEWAY + (await pin(jwt, m.file, `${m.symbol}.${ext}`))
  const json: Record<string, unknown> = {
    name: m.name,
    symbol: m.symbol,
    description: m.description,
    image: imageUri,
    showName: true,
    createdOn: 'https://thecondom.fun',
  }
  if (m.twitter) json.twitter = m.twitter
  if (m.telegram) json.telegram = m.telegram
  if (m.website) json.website = m.website
  const blob = new Blob([JSON.stringify(json)], { type: 'application/json' })
  const metadataUri = GATEWAY + (await pin(jwt, blob, `${m.symbol}.json`))
  return { metadataUri, imageUri }
}
