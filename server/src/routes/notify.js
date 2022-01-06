/* global SETTINGS, fetch */

const isInternal = email => email.endsWith('@holo.host')

const handle = async req => {
  const val = await req.json()
  return sendEmail(val)
}

const sendEmail = async (val) => {
  const serverToken = await SETTINGS.get('postmark_server_token')

  let { email, success, data } = val
  let alias = 'failed-registration'
  let templateModel = {
    error: data
  };

  if (success) {
    alias = 'successful-registration'
    templateModel = {
      holoport_url: data
    }
  }

  const group = isInternal(email) ? 'Internal' : 'External'

  const payload = {
    From: 'Holo <no-reply@holo.host>',
    Tag: `${group} ${alias}`,
    To: email,
    TemplateAlias: alias,
    TemplateModel: templateModel
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

export { handle, sendEmail }
