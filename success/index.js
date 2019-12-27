(async () => {
  /* Fetch and Parse Location */
  const currentQueryString = window.location.search.substr(1).split('&')
  const hpAdminUrl = ((hpAdminQueryString = currentQueryString) => {
    if (hpAdminQueryString === '') return {}
    const queryStringKv = {}
    for (let i = 0; i < hpAdminQueryString.length; ++i) {
      const queryStringParam = hpAdminQueryString[i].split('=')
      if (queryStringParam.length !== 2) continue
      queryStringKv[queryStringParam[0]] = decodeURIComponent(queryStringParam[1].replace(/\+/g, ' '))
    }
    return queryStringKv
  })()

  if (hpAdminUrl && !hpAdminUrl.url) {
    throw new Error('No HoloPort URL found in the query')
  }

  /* Global Variables */
  const HOST_HP_ADMIN_URL = 'http://' + hpAdminUrl.url.replace(/^https?:\/\//, '').replace(/\/$/, '') + '/'
  let stepTracker

  /* Parse HTML elements */
  const buttons = {
    goToHPAdmin: document.querySelector('#hp-admin-advance-button')
  }

  /** Actions to execute
  * ======================================
  */
  const actions = {
    onLoad: () => {
      if (!validateScreenSize()) {
        console.log('!validateScreenSize() :', !validateScreenSize())
        alert('Please visit this site on a desktop or laptop computer to continue.')
        return null
      }

      /* Set setTracker to default Page (page 5) */
      stepTracker = 5
      constantCheck()
    },
    countdownTimer: endtime => {
      // inlineVariables.timerMessage.style.display = 'none'
      const minutesSpan = document.getElementById('minutes')
      const secondsSpan = document.getElementById('seconds')

      function updateClock () {
        const t = getTimeRemaining(endtime)
        minutesSpan.innerHTML = ('0' + t.minutes).slice(-2)
        secondsSpan.innerHTML = ('0' + t.seconds).slice(-2)

        if (t.total <= 0) {
          clearInterval(timeinterval)

          // DEV HACK to test out Network Sucess Page :
          // delay(500)
          //   .then(() => {
          //     buttons.goToHPAdmin.href = HOST_HP_ADMIN_URL
          //     updateUiStep(6)
          //   })
        }
      }
      updateClock()
      const timeinterval = setInterval(updateClock, 1)
    },
    checkHpAdminState: async () => {
      try {
        // try calling HOST_HP_ADMIN_URL
        // polls every 2 seconds for up to 30 minutes
        await checkHpAdminUrl(HOST_HP_ADMIN_URL, 2 * 1000, 30 * 60 * 1000)
      } catch (e) {
        console.log('Error connecting to Host HP Admin URL :', e)
        return null
      }
      // Once Host HP Admin URL returns status 200, progress to final page.
      updateUiStep(6)
    },
    goToHPAdmin: () => {
      /* Communicate visually that something is happening in the bkgd */
      buttons.goToHPAdmin.disabled = true
      setTimeout(() => {
        /* Clean State */
        buttons.goToHPAdmin.disabled = false
      }, 500)
    }
  }

  // /* Bind actions to buttons */
  buttons.goToHPAdmin.onclick = actions.goToHPAdmin

  /** Helper Functions :
  * =============================
  *
  */
  const validation = { 5: !0, 6: !0 }

  const addMinutesToDateTime = (dt, minutes) => new Date(dt.getTime() + minutes * 60000)

  /**
  * Listen to stepTracker to initiate step specific actions
  */
  const constantCheck = () => {
    if (stepTracker === 5) {
      /* Start Timer */
      const deadline = addMinutesToDateTime(new Date(), 30)

      /* DEV HACK: exchange 30min for 10 sec timer during dev mode: */
      // const deadline = addMinutesToDateTime(new Date(), 0.1)

      console.log('Network Setup Deadline : ', deadline)
      actions.countdownTimer(deadline)
      actions.checkHpAdminState()
    }
  }

  /**
  * Resolve promise after specified time delay (in ms)
  */
  const delay = time => {
    return new Promise(resolve => {
      setTimeout(resolve, time)
    })
  }

  /**
   * Validate device by size of screen
   */
  const validateScreenSize = () => {
    /* Detect whether on laptop or desktop */
    return (window.screen.availWidth >= 1024 && window.screen.availHeight >= 768)
  }

  /**
   * Poll for Host's HP Admin Domain to determine network status
   *
   * @param {String} url
   * @param {Int} interval (ie: Polling frequency (in ms). NB: 0 means try continuously.)
   * @param {Int} timeout (ie: Polling duration (in ms).)
   */
  const checkHpAdminUrl = (url, interval, timeout) => {
    const start = Date.now()
    // const data = {}

    const fetchOptions = {
      method: 'GET', // POST
      cache: 'no-cache',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json '
      },
      referrerPolicy: 'no-referrer' //
      // body: JSON.stringify(data) // body data type must match "Content-Type" header
    }

    if (timeout !== 0 && Date.now() - start > timeout) {
      throw new Error('Timeout calculation error.')
    }

    return new Promise(resolve => {
      const success = r => {
        // NOTE: DEV/TEST MODE. Below line is for test fetch call. :
        // if (r.status === 200) {

        // NOTE: When HPOS GET result.status === 401, HPOS is reachible.
        if (r.status === 401) {
          console.log('HP Admin Data Result : ', r)
          // Once Host HP Admin URL returns correct status, setup link and progress to final page.
          buttons.goToHPAdmin.href = HOST_HP_ADMIN_URL
          console.log(`Polling: Host's HP Admin URL at ${HOST_HP_ADMIN_URL} is ready and served.`)
          resolve(r)
        } else {
          console.log(`Polling: Host's HP Admin URL at ${HOST_HP_ADMIN_URL} is not yet served. Re-fetching...`)
          console.log(`Domain Status : `, r.status)
          delay(interval)
            .then(fetchUrl)
        }
      }

      const failure = e => {
        console.log(`Error : `, e)
        console.log(`Polling: Encountered error when calling Host's HP Admin URL at ${HOST_HP_ADMIN_URL}. Re-fetching...`)
        delay(interval)
          .then(fetchUrl)
      }

      const fetchUrl = () => {
        // NOTE: DEV/TEST MODE. Below line is a test. - Server must have 'Access-Control' type headers set to be successful.:
        // return fetch('https://api.github.com/', fetchOptions)
        return fetch(url + 'api/v1', fetchOptions)
          .then(success)
          .catch(failure)
      }
      fetchUrl()
    })
  }

  /**
   * Update UI to the `step` step
   *
   * @param {int} step
   */
  const updateUiStep = step => {
    if (!validation[step]) {
      console.log(`Wrong parameter ${step} in updateUiStep()`)
      return null
    }
    stepTracker = step
    constantCheck()
    const stepClass = document.body.className = 'step' + step
    return stepClass
  }

  /**
   * Countdown Timer in MM:ss:mmm
   *
   * @param {String} endtime
  */
  const getTimeRemaining = endtime => {
    const now = new Date()
    const time = Date.parse(endtime) - Date.parse(now)

    const minutes = Math.floor((time / 1000 / 60) % 60)
    const seconds = Math.floor((time / 1000) % 60)
    const milliseconds = 1000 - now.getMilliseconds()

    return {
      total: time,
      minutes: minutes,
      seconds: seconds,
      milliseconds: milliseconds
    }
  }

  /* Initate timer countdown and set stepTracker */
  actions.onLoad()
})()
