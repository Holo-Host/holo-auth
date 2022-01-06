/* global addEventListener */

import * as notify from './routes/notify'
import * as zt_registration from './routes/zt_registration'
import { respond } from './util'

const handle = async req => {
  const url = req.parsedURL = new URL(req.url)

  switch ((req.method, url.pathname)) {
    case ('POST', '/v1/zt_registration'):
      return zt_registration.handle(req)
    case ('POST', '/v1/notify'):
      return notify.handle(req)
    default:
      return respond(400)
  }
}

addEventListener('fetch', event => {
  event.respondWith(handle(event.request))
})
