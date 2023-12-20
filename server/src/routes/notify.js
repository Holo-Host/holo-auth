/* global SETTINGS, fetch */

const isInternal = email => email.endsWith('@holo.host')

const handle = async req => {
  const val = await req.json()
  return sendEmail(val)
}

const sendEmail = async (val) => {
  const serverToken = await SETTINGS.get('postmark_server_token')

  let { email, success, data } = val
  let alias = 'error-generic'
  let templateModel
  if (success) {
    alias = 'successful-registration'
    templateModel = {
      holoport_url: data
    }
  } else {
    alias = chooseErrorTemplateAlias(data)
    templateModel = {
      error: data,
      email: email
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
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'x-postmark-server-token': serverToken
    },
    body: JSON.stringify(payload)
  })
}

const chooseErrorTemplateAlias = (data) => {
  if (data.toLowerCase().includes("invalid registration code")) {
    return "error-invalid-rc"
  } else if (data.toLowerCase().includes("registration code deleted")) {
    return "error-deleted-rc"
  } else if (data.toLowerCase().includes("invalid config version used")) {
    return "error-invalid-config"
  } else if (data.toLowerCase().includes("Could not generate mem-proof") || data.toLowerCase().includes("not able to retrieve proof")) {
    return "error-mem-proof-generation"
  } else {
    return "error-generic"
  }
}

export { handle, sendEmail }
