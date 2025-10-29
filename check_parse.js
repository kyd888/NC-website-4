const fs = require('fs');
const vm = require('vm');
const script = fs.readFileSync('temp_script.js', 'utf8');
try {
  new vm.Script(script);
  console.log('parse ok');
} catch (err) {
  console.error('parse error:', err.message);
  console.error('line', err.lineNumber, 'column', err.columnNumber);
}
