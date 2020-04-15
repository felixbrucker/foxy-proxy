const ua = require('universal-analytics');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
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
  }

  sendKeepalive() {
    this.client.event('util', 'keepalive').send();
  }
}

module.exports = new UsageStatisticsService();
