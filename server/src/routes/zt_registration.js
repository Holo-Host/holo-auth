/* global SETTINGS, fetch */

import * as hmac from '../hmac'
import { respond } from '../util'

const addZeroTierMember = async (address, name, description) => {
  const apiToken = await SETTINGS.get('zerotier_central_api_token')
  const networkId = await SETTINGS.get('zerotier_network_id')
  return fetch(`https://my.zerotier.com/api/network/${networkId}/member/${address}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiToken}` },
    body: JSON.stringify({
      config: { authorized: true },
      description: description,
      name: name
    })
  })
}

const handle = async req => {
  try {
    const payload = await req.json();
    const { data, signature } = payload
    // TODO: verify signature
    // if (!await hmac.verify(Buffer.from(signature, 'base64'), Buffer.from(data))) { return respond(401) }

    const { email, holochain_agent_id, zerotier_address } = data

    return addZeroTierMember(zerotier_address, holochain_agent_id, email)
  } catch (e) {
    respond(401)
  }
}

export { handle }