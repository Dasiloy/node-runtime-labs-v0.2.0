exports.count = 0;
exports.next = () => {
  exports.count += 1;
  return exports.count;
};
