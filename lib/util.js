const fs = require('fs');
const mkdirp = require('mkdirp');
const os = require('os');
const path = require('path');

function ensureFilePathExists(filePath) {
  const dirPath = path.dirname(filePath);
  if (dirPath === '.') {
    return;
  }
  mkdirp.sync(dirPath);
}

function detectFilePath(fileName) {
  if (fs.existsSync(fileName)) {
    return fileName;
  }

  return path.join(os.homedir(), '.config/bhd-burst-proxy', fileName);
}

module.exports = {
  ensureFilePathExists,
  detectFilePath,
};
