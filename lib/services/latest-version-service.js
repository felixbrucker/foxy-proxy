const semver = require('semver');
const superagent = require('superagent');
const runningVersion = require('../version');
const eventBus = require('./event-bus');

class LatestVersionService {
  constructor() {
    this.repo = 'felixbrucker/foxy-proxy';
    this.latestVersion = null;
    this.changelog = null;
  }

  async init() {
    await this.updateLatestVersion();
    setInterval(this.updateLatestVersion.bind(this), 30 * 60 * 1000);
  }

  async updateLatestVersion() {
    try {
      const {body: data} = await superagent.get(`https://api.github.com/repos/${this.repo}/releases`).set('User-Agent', `Foxy-Proxy ${runningVersion}`);
      const validReleases = data.filter(release => semver.valid(release.tag_name)).sort((v1, v2) => semver.compare(v2.tag_name, v1.tag_name));
      const newReleases = validReleases.filter(release => semver.gt(release.tag_name, runningVersion));

      if (this.latestVersion === validReleases[0].tag_name) {
        return;
      }

      this.latestVersion = validReleases[0].tag_name;
      this.changelog = validReleases[0].body.replace('Changelog:\n', '').split('\n');
      if (newReleases.length > 0) {
        this.changelog = newReleases.reduce((acc, curr) => acc.concat(curr.body.replace('Changelog:\n', '').split('\n')), []);
      }
      if (this.latestVersion === runningVersion) {
        return;
      }
      eventBus.publish('version/new', this.latestVersion);
    } catch (err) {
      const errorText = err.response ? err.response.error ? err.response.error.text : '' : '';
      eventBus.publish('log/debug', `Latest-Version-Service | Failed checking for latest version: ${errorText}${err.stack}`);
    }
  }

  getLatestVersion() {
    return this.latestVersion;
  }

  getChangelog() {
    return this.changelog;
  }
}

module.exports = new LatestVersionService();
