const authUrl = new URL('https://auth-server.holo.host/v1/response')
authUrl.search = window.location.search

const authData = JSON.parse(authUrl.searchParams.get('data'))
const agentUrl = `https://${authData.holochain_agent_id}.holohost.net`

const redirectIfOnline = async url => {
  try {
    await fetch(url, { mode: 'no-cors' })
    window.location = url
  } catch(err) {
  }
}

const $minutes = document.getElementById('minutes')
const $seconds = document.getElementById('seconds')
const $stepBox = document.getElementById('stepBox')

const clockPad = n => n.toString().padStart(2, '0')

const updateCountdown = estimate => {
  const delta = new Date(Math.max(0, estimate - Date.now()))
  const minutes = delta.getMinutes()
  const seconds = delta.getSeconds()
  $minutes.textContent = clockPad(minutes)
  $seconds.textContent = clockPad(seconds)
  if (minutes === 0 && seconds === 0) {
    $stepBox.innerHTML = `
      <div class="stepLabel step5">
        <p class="subheader-text-bookend text-white">
          Hmm. This is taking longer than normal. Please leave this window open for another few minutes and check back later. 
          If you're still not re-directed to your HoloPort admin panel by then, please contact <a href="https://forum.holo.host" target="_blank" class="text-white underline">customer service</a>.
        </p>
      </div>
    `
  }
}

(async () => {
  await redirectIfOnline(agentUrl)
  await fetch(authUrl)

  const estimate = new Date()
  estimate.setMinutes(estimate.getMinutes() + 10)

  setInterval(updateCountdown, 500, estimate)
  setInterval(redirectIfOnline, 5000, agentUrl)
})()
