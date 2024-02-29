/* global SETTINGS, fetch */

import { respond } from '../util'

/**
 * It adds a member to the ZeroTier network.
 * @param address - The address of the ZeroTier member.
 * @param name - The name (holoport_id) of the ZeroTier member.
 * @param description - The description of the member.
 * @returns A promise that resolves to the response from the API call.
 */
const addZeroTierMember = async (address, name, description) => {
  const apiToken = await SETTINGS.get('zerotier_central_api_token')
  const networkId = await SETTINGS.get('zerotier_network_id')
  // deregister any old entries with the same name (holoport id) as the new entry, before creating new entries.
  await clearOldStaleEntries(name, apiToken, networkId)
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
 * It clears all the members that have the same name as the one that is being added.
 * @param name - The name (holoport_id) of the member you want to clear.
 * @param apiToken - The API token for the zerotier network
 * @param networkId - The ID of the network you want to join.
 */
const clearOldStaleEntries = async (name, apiToken, networkId) => {
  try {
    console.log(`Fetching all members with name ${name} in network-id: ${networkId}`)
    let response = await fetch(`https://my.zerotier.com/api/network/${networkId}/member`, {
      method: 'GET',
      headers: { authorization: `Bearer ${apiToken}` }
    })
    let all_members = await response.json()
    console.log(`Total number of members: ${all_members.length}`)
    let old_members = all_members.filter(m => m.name === name);
    console.log(`List of old members: ${JSON.stringify(old_members)}`)
    await Promise.all(old_members.map(async (e) => {
      await cleanUpMembers(e.nodeId, apiToken, networkId)
    }));
    console.log("Clean up completed.")
  } catch (e) {
    console.log("Error: ", e)
  }
}

/**
 * It deletes the old entries from the zerotier network.
 * @param address - The address of the member you want to delete.
 * @param apiToken - The API token for the ZeroTier network.
 * @param networkId - The network ID of the ZeroTier network you want to join.
 * @returns A promise.
 */
const cleanUpMembers = (address, apiToken, networkId) => {
  console.log(`Deleting member: ${address}`)
  return fetch(`https://my.zerotier.com/api/network/${networkId}/member/${address}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiToken}` },
    body: JSON.stringify({
      config: {
        authorized: false
      }
    })
  }).then((resp) => console.log("Old entries were deauthorized: ", resp))
    .catch((e) => console.log("Unable to deauthorize - Error: ", e))
}

/**
 * Check if a given user (identified by email) is alredy registered and if registration parameters are correct
 * @param email
 */
const isVerifiedUser = async (email) => {
  const mongodbApiKey = await SETTINGS.get('mongodb_api_key')
  const mongodbApiUrl = "https://eu-central-1.aws.data.mongodb-api.com/app/data-fcrur/endpoint/data/v1/action/findOne"

  let headers = new Headers()
  headers.append("Content-Type", "application/json")
  headers.append("api-key", mongodbApiKey)

  let filter = {
    "collection":"registrations",
    "database":"opsconsoledb",
    "dataSource":"Cluster0",
    "filter": {
      "email": email
    }
  }

  let resp = await fetch(mongodbApiUrl, {
    headers,
    method: "POST",
    body: JSON.stringify(filter)
  })

  let user = await resp.json()

  if (user.document && user.document.registrationCode.length > 0) {
    let host = user.document.registrationCode.find(el => el.role === "host")

    if (host.approved) return true
  }

  console.log(`user ${email} was not found in registration database`)
  return false
}

/**
 * It adds a new member to the ZeroTier network.
 * @returns A 200 status code and a message.
 */
const handle = async req => {
  try {
    const payload = await req.json();
    const { data } = payload
    const { email, holochain_agent_id, zerotier_address, holoport_url } = data

    if (await isVerifiedUser(email)) return addZeroTierMember(zerotier_address, holochain_agent_id, email)

    return respond(401)
  } catch (e) {
    console.log(e)
    return respond(401)
  }
}

export { handle }