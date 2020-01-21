const authUrl = new URL('https://auth-server.holo.host/v1/response')
authUrl.search = window.location.search

const authData = JSON.parse(authUrl.searchParams.get('data'))
const agentUrl = `https://${authData.holochain_agent_id}.holohost.net`

const redirectIfOnline = async url => {
  try {
    const res = await fetch(url)
    window.location = url
  } catch(err) {
  }
}

const $minutes = document.getElementById('minutes')
const $seconds = document.getElementById('seconds')

const clockPad = n => n.toString().padStart(2, '0')

const updateCountdown = estimate => {
  const delta = new Date(Math.max(0, estimate - Date.now()))
  $minutes.textContent = clockPad(delta.getMinutes())
  $seconds.textContent = clockPad(delta.getSeconds())
}

(async () => {
  await redirectIfOnline(agentUrl)
  await fetch(authUrl)

  const estimate = new Date()
  estimate.setMinutes(estimate.getMinutes() + 2)

  setInterval(updateCountdown, 500, estimate)
  setInterval(redirectIfOnline, 5000, agentUrl)
})()
