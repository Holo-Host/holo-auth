/* global Response */

const respond = status =>
  new Response(null, { status: status })

export { respond }
