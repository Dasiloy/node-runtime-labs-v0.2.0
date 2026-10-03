exports.name = 'a-start';
const b = require('./b.cjs');
exports.bName = b.name;
exports.name = 'a-done';
