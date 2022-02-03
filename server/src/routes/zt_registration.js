/* global SETTINGS, fetch */

import { respond } from '../util'

const addZeroTierMember = async (address, name, description) => {
  const apiToken = await SETTINGS.get('zerotier_central_api_token')
  const networkId = await SETTINGS.get('zerotier_network_id')
  // deregister any old entries before creating new entries
  fetch(`https://my.zerotier.com/api/network/${networkId}/member/${address}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${apiToken}` }
  }).then(() => console.log("Old entries were deleted"))
    .catch((e) => console.log("No old entries found"))
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
    const { data } = payload
    const { email, holochain_agent_id, zerotier_address, holoport_url } = data

    return addZeroTierMember(zerotier_address, holochain_agent_id, email)
  } catch (e) {
    console.log(e)
    return respond(401)
  }
}

export { handle }