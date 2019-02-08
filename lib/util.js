const mkdirp = require('mkdirp');
const path = require('path');

function ensureFilePathExists(filePath) {
  const dirPath = path.dirname(filePath);
  if (dirPath === '.') {
    return;
  }
  mkdirp.sync(dirPath);
}

module.exports = {
  ensureFilePathExists,
};
