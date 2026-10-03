exports.name = 'b-start';
const a = require('./a.cjs');
exports.aName = a.name;
exports.name = 'b-done';
