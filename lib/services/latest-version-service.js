const semver = require('semver');
const superagent = require('superagent');

class LatestVersionService {
  constructor() {
    this.repo = 'felixbrucker/bhd-burst-proxy';
    this.latestVersion = null;
    this.changelog = null;
  }

  async init() {
    await this.updateLatestVersion();
    setInterval(this.updateLatestVersion.bind(this), 30 * 60 * 1000);
  }

  async updateLatestVersion() {
    try {
      const {body: data} = await superagent.get(`https://api.github.com/repos/${this.repo}/releases`);
      const versions = data.filter(release => semver.valid(release.tag_name)).sort((v1, v2) => semver.compare(v2.tag_name, v1.tag_name));

      if (this.latestVersion === versions[0].tag_name) {
        return;
      }

      this.latestVersion = versions[0].tag_name;
      this.changelog = versions[0].body.replace('Changelog:\n', '').split('\n');
    } catch (err) {}
  }

  getLatestVersion() {
    return this.latestVersion;
  }

  getChangelog() {
    return this.changelog;
  }
}

module.exports = new LatestVersionService();
