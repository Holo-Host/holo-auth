/* global SETTINGS, fetch */

import * as hmac from '../hmac'
import { respond } from '../util'

const VALIDITY_PERIOD = 7 * 24 * 60 * 60 * 1000 // 7 days

const isWhitelisted = async email => {
  const apiKey = await SETTINGS.get('freshdesk_api_key')
  const credentials = Buffer.from(`${apiKey}:x`).toString('base64')
  const url = new URL('https://holo.freshdesk.com/api/v2/contacts')

  url.searchParams.set('email', email)

  const response = await fetch(url.toString(), {
    headers: { authorization: `Basic ${credentials}` }
  })

  return response.status === 200
}

const sendEmail = async (email, url) => {
  const apiKey = await SETTINGS.get('sendgrid_api_key')
  const payload = {
    from: 'no-reply@holo.host',
    personalizations: { to: { email: email } },
    substitutions: { '{{url}}': url },
    template_id: await SETTINGS.get('sendgrid_template_id')
  }

  return fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}` },
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
  return sendEmail(payload.email, await responseUrl(baseUrl, payload))
}

export { handle }
