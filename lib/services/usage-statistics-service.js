const ua = require('universal-analytics');
const os = require('os');
const uuidv4 = require('uuid/v4');
const runningVersion = require('../version');
const database = require('../../models');

class UsageStatisticsService {
  static async getUUID() {
    const [config] = await database().config.findOrCreate({
      where: {
        id: 1,
      },
      defaults: {
        id: 1,
        uuid: uuidv4(),
      },
    });

    return config.uuid;
  }

  async init() {
    const uuid = await UsageStatisticsService.getUUID();
    this.client = ua('UA-119575195-14', uuid);
    this.keepaliveInterval = setInterval(this.sendKeepalive.bind(this), 30 * 1000);
    this.sendSystemStats();
  }

  sendSystemStats() {
    this.client.pageview(`stats/os/arch/${os.arch()}`).send();
    this.client.pageview(`stats/os/platform/${os.platform()}`).send();
    this.client.pageview(`stats/os/release/${os.release()}`).send();
    this.client.pageview(`stats/os/cores/${os.cpus().length}`).send();
    this.client.pageview(`stats/os/mem/${(os.totalmem() / Math.pow(1024, 3)).toFixed(0)}`).send();
    this.client.pageview(`stats/node/version/${process.version}`).send();
    this.client.pageview(`stats/app/version/${runningVersion}`).send();
  }

  sendKeepalive() {
    this.client.event('util', 'keepalive').send();
  }

}

module.exports = new UsageStatisticsService();
