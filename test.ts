const repl = require('repl');
const Kodi = require('.').default;
var kodi = new Kodi({
  address: '192.168.0.170',
  mac: 'b8:27:eb:56:17:3c'
});

const r = repl.start('> ');
r.context.kodi = kodi;
