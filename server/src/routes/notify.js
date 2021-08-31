/* global SETTINGS, WHITELIST, fetch */

import * as hmac from '../hmac'
const isInternal = email => email.endsWith('@holo.host')

const handle = async req => {
  const serverToken = await SETTINGS.get('postmark_server_token')
  const payload = await req.json()
  let { email, alias } = payload
  // TEMP setting alias
  alias = 'not-whitelisted'
  
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

export { handle }
