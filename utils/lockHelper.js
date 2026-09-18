const activeLocks = new Set();

exports.acquireLock = (key) => {
  if (activeLocks.has(key)) {
    return false; // Lock already held
  }
  activeLocks.add(key);
  return true; // Lock acquired
};

exports.releaseLock = (key) => {
  activeLocks.delete(key);
};