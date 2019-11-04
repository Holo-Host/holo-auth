/* global SETTINGS, fetch */

import * as hmac from '../hmac'
import { respond } from '../util'

const addZeroTierMember = async address => {
  const apiToken = await SETTINGS.get('zerotier_central_api_token')
  const networkId = await SETTINGS.get('zerotier_network_id')

  return fetch(`https://my.zerotier.com/api/network/${networkId}/member/${address}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiToken}` }
  })
}

const handle = async req => {
  const { data, signature } = Object.fromEntries(req.parsedURL.searchParams)
  if (!await hmac.verify(Buffer.from(signature, 'base64'), Buffer.from(data))) { return respond(401) }

  const payload = JSON.parse(data)
  if (payload.valid_until < Date.now()) { return respond(401) }

  return addZeroTierMember(payload.zerotier_address)
}

export { handle }
