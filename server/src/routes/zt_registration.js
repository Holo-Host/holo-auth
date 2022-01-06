/* global SETTINGS, fetch */

import { respond, sleep } from '../util'
import { sendEmail } from './notify'

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

/**
 * Checks if holoport's admin console is accessible. Returns success once it is, otherwise keeps
 * trying for TIMEOUT seconds, then throws an error
 * @param {*} holoport_url
 * @returns
 */
const connectToHoloport = async (holoport_url) => {
  const BACKOFF = 5
  const TIMEOUT = 30 * 60
  let counter = 0

  do {
    try {
      res = await fetch(holoport_url)
      if (res.ok) return res
    } catch (e) {
      // do nothing with error
    }
    await sleep(BACKOFF)
    counter++
  } while (counter * BACKOFF <= TIMEOUT)

  throw new Error(`Holoport ${holoport_url} was never reached within ${TIMEOUT} seconds`)
}

const handle = async req => {
  try {
    const payload = await req.json();
    const { data } = payload
    const { email, holochain_agent_id, zerotier_address, holoport_url } = data

    let res = await addZeroTierMember(zerotier_address, holochain_agent_id, email)

    if (res.ok)
      await connectToHoloport(holoport_url)
    else
      return res

    return sendEmail({ email, success: true, data: holoport_url })
  } catch (e) {
    console.log(e)
    return respond(401)
  }
}

export { handle }