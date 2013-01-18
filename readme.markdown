# tap-parser

parse the [test anything protocol](http://testanything.org/)

# example

``` js
var parser = require('tap-parser');
var p = parser(function (results) {
    console.dir(results);
});

process.stdin.pipe(p);
process.stdin.resume();
```

given some [TAP](http://testanything.org/)-formatted input:

```
$ node test.js
TAP version 13
# beep
ok 1 should be equal
ok 2 should be equivalent
# boop
ok 3 should be equal
ok 4 (unnamed assert)

1..4
# tests 4
# pass  4

# ok
```

parse the output:

```
$ node test.js | node parse.js
{ ok: true,
  asserts: 
   [ { ok: true, number: 1, name: 'should be equal' },
     { ok: true, number: 2, name: 'should be equivalent' },
     { ok: true, number: 3, name: 'should be equal' },
     { ok: true, number: 4, name: '(unnamed assert)' } ],
  pass: 
   [ { ok: true, number: 1, name: 'should be equal' },
     { ok: true, number: 2, name: 'should be equivalent' },
     { ok: true, number: 3, name: 'should be equal' },
     { ok: true, number: 4, name: '(unnamed assert)' } ],
  fail: [],
  errors: [],
  plan: { start: 1, end: 4 } }
```

# methods

``` js
var parser = require('tap-parser')
```

## var p = parser(cb)

Return a writable stream `p` that emits parse events.

If `cb` is given it will listen for the `'results'` event.

# events

## p.on('results', function (results) {})

`results.errors` is an array containing any parse errors, such as out of order
assertions or missing plans.

## p.on('assert', function (assert) {})

Every `/^(not )?ok\b/` line will emit an `'assert'` event.

Every `assert` object has these keys:

`assert.ok` - true if the assertion succeeded, false if failed
`assert.number` - the assertion number
`assert.name` - optional short description of the assertion

## p.on('comment', function (comment) {})

Every `/^# (.+)/` line will emit the string contents of `comment`.

## p.on('plan', function (plan) {})

Every `/^\d+\.\.\d+/` line emits a `'plan'` event for the test numbers
`plan.start` through `plan.end`, inclusive.

## p.on('version', function (version) {})

A `/^TAP version (\d+)/` line emits a `'version'` event with a version number or
string.

# install

With [npm](https://npmjs.org) do:

```
npm install tap-parser
```

You can use [browserify](http://browserify.org) to `require('tap-parser')` in
the browser.

# license

MIT