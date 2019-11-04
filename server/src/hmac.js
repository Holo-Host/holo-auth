/* global crypto */

const key = async () => {
  let keyData = await SETTINGS.get('hmac_key', 'arrayBuffer')
  if (!keyData) {
    keyData = new Uint8Array(32)
    crypto.getRandomValues(keyData)
    await SETTINGS.put('hmac_key', keyData)
  }

  return crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-512' }, false, ['sign', 'verify']
  )
}

const sign = async body =>
  crypto.subtle.sign('HMAC', await key(), body)

const verify = async (hmac, body) =>
  crypto.subtle.verify('HMAC', await key(), hmac, body)

export { sign, verify }
