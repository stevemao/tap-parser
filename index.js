// Transforms a stream of TAP into a stream of result objects
// and string comments.  Emits "results" event with summary.
var Writable = require('stream').Writable
var yaml = require('js-yaml')
var util = require('util')
var assert = require('assert')

util.inherits(Parser, Writable)

module.exports = Parser

var testPointRE = /^(not )?ok(?: ([0-9]+))?(?:(?: - )?(.*))?\n$/
function createResult (line, count) {
  if (!testPointRE.test(line))
    return null

  return new Result(line, count)
}

function parseDirective (line) {
  line = line.trim()
  var re = /^(todo|skip)\b/i
  var type = line.match(re)
  if (!type)
    return false

  return [ type[0].toLowerCase(), line.replace(re, '').trim() || true ]
}

function Result (line, count) {
  var parsed = line.match(testPointRE)
  assert(parsed, 'invalid line to Result')

  var ok = !parsed[1]
  var id = +(parsed[2] || count + 1)
  this.ok = ok
  this.id = id

  var src = line
  Object.defineProperty(this, 'src', {
    value: line,
    writable: true,
    enumerable: false,
    configurable: false
  })

  this.src = line

  var rest = parsed[3] || ''
  var name
  rest = rest.replace(/([^\\]|^)((?:\\\\)*)#/g, '$1\n$2').split('\n')
  name = rest.shift()
  rest = rest.filter(function (r) { return r.trim() }).join('#')

  // now, let's see if there's a directive in there.
  var dir = parseDirective(rest.trim())
  if (!dir)
    name += rest ? '#' + rest : ''
  else
    this[dir[0]] = dir[1]

  if (name)
    this.name = name.trim()

  return this
}

Object.defineProperty(Result.prototype, 'toString', {
  value: function () {
    return this.src
  },
  enumerable: false,
  writable: true,
  configurable: true
})

function Parser (options, onComplete) {
  if (typeof options === 'function') {
    onComplete = options
    options = {}
  }

  if (!(this instanceof Parser))
    return new Parser(options, onComplete)

  options = options || {}
  if (onComplete)
    this.on('complete', onComplete)

  this.indent = options.indent || ''
  this.level = options.level || 0
  Writable.call(this)
  this.buffer = ''
  this.bailedOut = false
  this.planStart = -1
  this.planEnd = -1
  this.planComment = ''
  this.yamlish = ''
  this.yind = ''
  this.child = null
  this.current = null

  this.count = 0
  this.pass = 0
  this.fail = 0
  this.todo = 0
  this.skip = 0
  this.ok = true

  this.postPlan = false
}

Parser.prototype.processYamlish = function () {
  var yamlish = this.yamlish
  this.yamlish = ''
  this.yind = ''

  if (!this.current) {
    this.emit('extra', yamlish)
    return
  }

  try {
    var diags = yaml.safeLoad(yamlish)
  } catch (er) {
    this.emit('extra', yamlish)
    return
  }

  this.current.src += yamlish
  this.current.diag = diags
  this.emitResult()
}

Parser.prototype.write = function (chunk, encoding, cb) {
  if (typeof encoding === 'string' && encoding !== 'utf8')
    chunk = new Buffer(chunk, encoding)

  if (Buffer.isBuffer(chunk))
    chunk += ''

  if (typeof encoding === 'function') {
    cb = encoding
    encoding = null
  }

  if (this.bailedOut) {
    if (cb)
      process.nextTick(cb)
    return true
  }

  this.buffer += chunk
  do {
    var match = this.buffer.match(/^.*\r?\n/)
    if (!match || this.bailedOut)
      break

    this.buffer = this.buffer.substr(match[0].length)
    this._parse(match[0])
  } while (this.buffer.length)

  if (cb)
    process.nextTick(cb)
  return true
}

Parser.prototype.end = function (chunk, encoding, cb) {
  if (chunk) {
    if (typeof encoding === 'function') {
      cb = encoding
      encoding = null
    }
    this.write(chunk, encoding)
  }

  if (this.buffer)
    this.write('\n')

  // if we have yamlish, means we didn't finish with a ...
  if (this.yamlish)
    this.emit('extra', this.yamlish)

  this.emitResult()

  var skipAll

  if (this.planEnd === 0 && this.planStart === 1) {
    this.ok = true
    skipAll = true
  } else if (this.count !== (this.planEnd - this.planStart + 1))
    this.ok = false


  if (this.ok && !skipAll && this.first !== this.planStart)
    this.ok = false


  if (this.ok && !skipAll && this.last !== this.planEnd)
    this.ok = false

  var final = {
    ok: this.ok,
    count: this.count,
    pass: this.pass
  }

  if (this.fail)
    final.fail = this.fail

  if (this.bailedOut)
    final.bailout = this.bailedOut

  if (this.todo)
    final.todo = this.todo

  if (this.skip)
    final.skip = this.skip

  if (this.planStart !== -1) {
    final.plan = { start: this.planStart, end: this.planEnd }
    if (skipAll) {
      final.plan.skipAll = true
      if (this.planComment)
        final.plan.skipReason = this.planComment
    }
  }

  this.emit('complete', final)

  Writable.prototype.end.call(this, null, null, cb)
}

Parser.prototype.bailout = function (reason) {
  this.bailedOut = reason || true
  this.ok = false
  this.emit('bailout', reason)
}

Parser.prototype.emitResult = function () {
  if (this.child) {
    this.child.end()
    this.child = null
  }

  this.yamlish = ''
  this.yind = ''

  if (!this.current)
    return

  var res = this.current
  this.current = null

  this.count++
  if (res.ok) {
    this.pass++
  } else {
    this.fail++
    if (!res.todo)
      this.ok = false
  }

  if (res.skip)
    this.skip++

  if (res.todo)
    this.todo++

  this.emit('assert', res)
}

Parser.prototype.startChild = function (indent, line) {
  this.emitResult()

  this.child = new Parser({
    indent: indent,
    parent: this,
    level: this.level + 1
  })

  this.emit('child', this.child)
  this.child.on('bailout', this.bailout.bind(this))
  var self = this
  this.child.on('complete', function (results) {
    if (!results.ok)
      self.ok = false
  })
  this.child.write(line.substr(indent.length))
}

Parser.prototype._parse = function (line) {
  // normalize line endings
  line = line.replace(/\r\n$/, '\n')

  // ignore empty lines
  if (line === '\n')
    return

  // After a bailout, everything is ignored
  if (this.bailedOut)
    return

  // comment
  if (line.match(/^\s*#/)) {
    this.emit('comment', line)
    return
  }

  var bailout = line.match(/^bail out!(.*)\n$/i)
  if (bailout) {
    var reason = bailout[1].trim()
    this.bailout(reason)
    return
  }

  // If version is specified, must be at the very beginning.
  var version = line.match(/^TAP Version ([0-9]+)\n$/i)
  if (version) {
    if (this.planStart === -1 && this.count === 0)
      this.emit('version', version[1])
    else
      this.emit('extra', line)
    return
  }

  // if we got a plan at the end, or a 1..0 plan, then we can't
  // have any more results, yamlish, or child sets.
  if (this.postPlan) {
    this.emit('extra', line)
    return
  }

  // still belongs to the child.
  if (this.child && line.indexOf(this.child.indent) === 0) {
    line = line.substr(this.child.indent.length)
    this.child.write(line)
    return
  }

  var indent = line.match(/^[ \t]+/)
  if (indent) {
    indent = indent[0]

    // if we don't have a current res, then it can't be yamlish,
    // must be a child result set
    if (!this.current) {
      this.startChild(indent, line)
      return
    }

    // if we are not currently processing yamlish, then it has to
    // be either the start of a child, or the start of yamlish.
    if (!this.yind) {
      // either this starts yamlish, or it is a child.
      if (line === indent + '---\n')
        this.yind = indent
      else
        this.startChild(indent, line)
      return
    }

    // now we know it is yamlish

    // if it's not as indented, then it's broken.
    // The whole yamlish chunk is garbage.
    if (indent.indexOf(this.yind) !== 0) {
      // oops!  was not actually yamlish, I guess.
      // treat as garbage
      this.emit('extra', this.yamlish + line)
      this.emitResult()
      return
    }

    // yamlish ends with "...\n"
    if (line === this.yind + '...\n') {
      this.processYamlish()
      return
    }

    // ok!  it is valid yamlish indentation, and not the ...
    // save it to parse later.
    this.yamlish += line
    return
  }

  // not indented.  if we were doing yamlish, then it didn't go good
  if (this.yind) {
    this.emit('extra', this.yamlish)
    this.yamlish = ''
    this.yind = ''
  }

  this.emitResult()

  var plan = line.match(/^([0-9]+)\.\.([0-9]+)(?:\s+(?:#\s*(.*)))?\n$/)
  if (plan) {
    if (this.planStart !== -1) {
      // this is not valid tap, just garbage
      this.emit('extra', line)
      return
    }

    var start = +(plan[1])
    var end = +(plan[2])
    var comment = plan[3]
    this.planStart = start
    this.planEnd = end
    var p = { start: start, end: end }
    if (comment)
      this.planComment = p.comment = comment

    this.emit('plan', p)

    // This means that the plan is coming at the END of all the tests
    // Plans MUST be either at the beginning or the very end.  We treat
    // plans like '1..0' the same, since they indicate that no tests
    // will be coming.
    if (this.count !== 0 || this.planEnd === 0)
      this.postPlan = true

    return
  }

  var res = createResult(line, this.count)
  if (!res) {
    this.emit('extra', line)
    return
  }

  if (res.id) {
    if (!this.first || res.id < this.first)
      this.first = res.id
    else if (!this.last || res.id > this.last)
      this.last = res.id
  }

  // hold onto it, because we might get yamlish diagnostics
  this.current = res
}
