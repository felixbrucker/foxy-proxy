const semver = require('semver');
const superagent = require('superagent');

class LatestVersionService {
  constructor() {
    this.repo = 'felixbrucker/bhd-burst-proxy';
    this.latestVersion = null;
  }

  async init() {
    await this.updateLatestVersion();
    setInterval(this.updateLatestVersion.bind(this), 30 * 60 * 1000);
  }

  async updateLatestVersion() {
    try {
      const {body: data} = await superagent.get(`https://api.github.com/repos/${this.repo}/tags`);
      const versions = data.filter(ver => semver.valid(ver.name)).sort((v1, v2) => semver.compare(v2.name, v1.name));

      if (this.latestVersion === versions[0].name) {
        return;
      }

      this.latestVersion = versions[0].name;
    } catch (err) {}
  }

  getLatestVersion() {
    return this.latestVersion;
  }
}

module.exports = new LatestVersionService();
