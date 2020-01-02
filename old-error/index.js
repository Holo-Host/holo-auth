(() => {
  const errorTable = {
    400: 'Bad Request',
    401: 'Unauthorized',
    402: 'Payment Required',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    406: 'Not Acceptable',
    407: 'Proxy Authentication Required',
    408: 'Request Timeout',
    409: 'Conflict',
    410: 'Gone',
    411: 'Length Required',
    415: 'Unsupported Media Type',
    500: 'Internal Server Error',
    501: 'Not Implemented'
  }

  // Parse query string from URL
  const qs = ((a) => {
    if (a === '') return {}
    var b = {}
    for (var i = 0; i < a.length; ++i) {
      var p = a[i].split('=')
      if (p.length !== 2) continue
      b[p[0]] = decodeURIComponent(p[1].replace(/\+/g, ' '))
    }
    return b
  })(window.location.search.substr(1).split('&'))

  const err = {
    'code': ((typeof qs.err !== undefined & typeof errorTable[qs.err] !== undefined ) ? qs.err : 501),
    get text() {
      return errorTable[this.code]
    }
  }

  const domEl = {
    'errCode': document.querySelector('#error_code'),
    'errText': document.querySelector('#error_text')
  }

  // Update DOM with error code and description
  domEl.errCode.innerHTML = err.code
  domEl.errText.innerHTML = err.text
})()
