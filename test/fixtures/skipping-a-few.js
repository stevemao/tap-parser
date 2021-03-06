module.exports =
[ [ 'version', '13' ],
  [ 'plan', { start: 1, end: 5 } ],
  [ 'comment', '# $^0 is solaris\n' ],
  [ 'assert',
    { ok: true, id: 1, name: 'approved operating system' } ],
  [ 'assert', { ok: true, id: 2, skip: 'no /sys directory' } ],
  [ 'assert', { ok: true, id: 3, skip: 'no /sys directory' } ],
  [ 'assert', { ok: true, id: 4, skip: 'no /sys directory' } ],
  [ 'assert', { ok: true, id: 5, skip: 'no /sys directory' } ],
  [ 'complete',
    { ok: true,
      count: 5,
      pass: 5,
      skip: 4,
      plan: { start: 1, end: 5 } } ] ]
