import file from "@system.file"
import storage from "@system.storage"

var FILE_URI = 'internal://files/records.dat'

function blank() {
  return {
    bestBrTime: 0,
    bestExtTime: 0,
    bestHp: 0,
    bestWild: 0,
    totalSwings: 0,
    totalPlay: 0,
    totalCal: 0
  }
}

function parse(text) {
  var s = blank()
  var lines = String(text || '').split('\n')
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/\r/g, '')
    var p = line.indexOf('=')
    if (p <= 0) continue
    var k = line.substring(0, p).trim()
    var v = parseFloat(line.substring(p + 1))
    if (s.hasOwnProperty(k) && !isNaN(v)) s[k] = v
  }
  return s
}

function write(s) {
  try {
    file.writeText({
      uri: FILE_URI,
      text: 'bestBrTime=' + s.bestBrTime + '\nbestExtTime=' + s.bestExtTime + '\nbestHp=' + s.bestHp +
            '\nbestWild=' + s.bestWild + '\ntotalSwings=' + s.totalSwings +
            '\ntotalPlay=' + s.totalPlay + '\ntotalCal=' + s.totalCal,
      append: false,
      fail: function() {},
      complete: function() {}
    })
  } catch (e) {}
  storage.set({ key: 'bestBrTime', data: String(s.bestBrTime) })
  storage.set({ key: 'bestExtTime', data: String(s.bestExtTime) })
  storage.set({ key: 'bestHp', data: String(s.bestHp) })
  storage.set({ key: 'bestWild', data: String(s.bestWild) })
  storage.set({ key: 'totalSwings', data: String(s.totalSwings) })
  storage.set({ key: 'totalPlay', data: String(s.totalPlay) })
  storage.set({ key: 'totalCal', data: String(s.totalCal) })
}

var cache = null
var loading = false
var waiting = []

function done() {
  loading = false
  var q = waiting
  waiting = []
  for (var i = 0; i < q.length; i++) {
    q[i](cache)
  }
}

function loadFromStorage() {
  var keys = ['bestBrTime', 'bestExtTime', 'bestHp', 'bestWild', 'totalSwings', 'totalPlay', 'totalCal']
  var n = 0
  function one() {
    n++
    if (n >= keys.length) {
      write(cache)
      done()
    }
  }
  for (var i = 0; i < keys.length; i++) {
    (function(k) {
      storage.get({
        key: k,
        success: function(d) {
          var v = parseFloat(d)
          if (!isNaN(v)) cache[k] = v
          one()
        },
        fail: function() { one() }
      })
    })(keys[i])
  }
}

export function loadStats(cb) {
  if (cache) { cb(cache); return }
  waiting.push(cb)
  if (loading) return
  loading = true
  try {
    file.readText({
      uri: FILE_URI,
      success: function(data) {
        cache = parse(data && data.text ? data.text : '')
        done()
      },
      fail: function() {
        cache = blank()
        loadFromStorage()
      }
    })
  } catch (e) {
    cache = blank()
    loadFromStorage()
  }
}

export function updateBest(key, value, lowerBetter) {
  loadStats(function(s) {
    var cur = s[key]
    if (lowerBetter) {
      if (cur === 0 || value < cur) {
        s[key] = value
        write(s)
      }
    } else {
      if (value > cur) {
        s[key] = value
        write(s)
      }
    }
  })
}

export function addRun(gameTime, calories, swings) {
  loadStats(function(s) {
    s.totalSwings += swings
    s.totalPlay += gameTime
    s.totalCal = Math.round((s.totalCal + calories) * 10) / 10
    write(s)
  })
}