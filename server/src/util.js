/* global Response */

const respond = status =>
  new Response(null, { status: status })

const sleep = s =>
  new Promise(resolve => setTimeout(resolve, s * 1000))

export { respond, sleep }
