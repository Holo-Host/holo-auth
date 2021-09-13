/* global addEventListener */

import * as challenge from './routes/challenge'
import * as response from './routes/response'
import * as notify from './routes/notify'
import { respond } from './util'

const handle = async req => {
  const url = req.parsedURL = new URL(req.url)

  switch ((req.method, url.pathname)) {
    case ('POST', '/v1/challenge'):
      return challenge.handle(req)
    case ('POST', '/v1/notify'):
      return notify.handle(req)
    case ('GET', '/v1/response'):
      return response.handle(req)
    default:
      return respond(400)
  }
}

addEventListener('fetch', event => {
  event.respondWith(handle(event.request))
})
