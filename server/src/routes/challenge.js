/* global SETTINGS, WHITELIST, fetch */

import * as hmac from '../hmac'
import { respond } from '../util'

const VALIDITY_PERIOD = 7 * 24 * 60 * 60 * 1000 // 7 days

const isInternal = email => email.endsWith('@holo.host')

const isWhitelisted = async email => {
  if (isInternal(email)) { return true }
  return await WHITELIST.get(email) !== null
}

const emailChallenge = async (email, model) => {
  const serverToken = await SETTINGS.get('postmark_server_token')
  const payload = {
    From: 'Holo <no-reply@holo.host>',
    Tag: isInternal(email) ? 'Internal' : 'External',
    To: email,
    TemplateAlias: 'challenge',
    TemplateModel: model
  }

  return fetch('https://api.postmarkapp.com/email/withTemplate', {
    method: 'POST',
    headers: {
     accept: 'application/json',
     'x-postmark-server-token': serverToken
    },
    body: JSON.stringify(payload)
  })
}

const responseUrl = async (baseUrl, payload) => {
  const data = JSON.stringify({
    ...payload,
    valid_until: Date.now() + VALIDITY_PERIOD
  })
  const signature = await hmac.sign(Buffer.from(data))
  const url = new URL(baseUrl)

  url.searchParams.set('data', data)
  url.searchParams.set('signature', Buffer.from(signature).toString('base64'))

  return url.toString()
}

const handle = async req => {
  const baseUrl = await SETTINGS.get('response_base_url') || new URL('/v1/response', req.parsedURL.origin)
  const payload = await req.json()

  if (!await isWhitelisted(payload.email)) { return respond(401) }

  return emailChallenge(payload.email, {
    ...payload,
    response_url: await responseUrl(baseUrl, payload)
  })
}

export { handle }
