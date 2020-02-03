/* global SETTINGS, WHITELIST, fetch */

import * as hmac from '../hmac'
import { respond } from '../util'

const VALIDITY_PERIOD = 7 * 24 * 60 * 60 * 1000 // 7 days

const isInternal = email => email.endsWith('@holo.host')

const isWhitelisted = async email => {
  if (isInternal(email)) { return true }
  return await WHITELIST.get(email) !== null
}

const sendEmail = async (email, alias, model) => {
  const serverToken = await SETTINGS.get('postmark_server_token')
  const group = isInternal(email) ? 'Internal' : 'External'
  const payload = {
    From: 'Holo <no-reply@holo.host>',
    Tag: `${group} ${alias}`,
    To: email,
    TemplateAlias: alias,
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
  const { email } = payload

  if (!await isWhitelisted(email)) {
    return sendEmail(email, 'not-whitelisted', {})
  }

  return sendEmail(email, 'challenge', {
    ...payload,
    response_url: await responseUrl(baseUrl, payload)
  })
}

export { handle }
