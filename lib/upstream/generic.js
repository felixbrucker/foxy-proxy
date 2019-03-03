const superagent = require('superagent');
const { hostname } = require('os');
const EventEmitter = require('events');
const database = require('../../models');
const eventBus = require('../services/event-bus');
const MiningInfo = require('../miningInfo');
const util = require('./util');
const version = require('../version');
const estimatedCapacityMixin = require('./estimated-capacity-mixin');
const statsMixin = require('./stats-mixin');

class GenericUpstream extends statsMixin(estimatedCapacityMixin(EventEmitter)) {
  constructor(upstreamConfig, miners, proxyName) {
    super();
    this.fullUpstreamName = `${proxyName}/${upstreamConfig.name}`;
    this.fullUpstreamNameLogs = `${proxyName} | ${upstreamConfig.name}`;
    this.upstreamConfig = upstreamConfig;
    this.isBHD = upstreamConfig.isBHD || upstreamConfig.name.toLowerCase().indexOf('bhd') !== -1;
    this.historicalRoundsToKeep = upstreamConfig.historicalRoundsToKeep ? upstreamConfig.historicalRoundsToKeep : 720;
    this.defaultMinerName = `BHD-Burst-Proxy ${version}/${hostname()}`;
    this.miningInfo = {height: 0};
    this.deadlines = {};
    this.roundStart = new Date();
    this.miners = miners;
  }

  async init() {
    await super.init();
    await this.updateMiningInfo();
    const interval = this.upstreamConfig.updateMiningInfoInterval ? this.upstreamConfig.updateMiningInfoInterval : 1000;
    setInterval(this.updateMiningInfo.bind(this), interval);
  }

  async updateMiningInfo() {
    const endpoint = this.upstreamConfig.customEndpoint ? this.upstreamConfig.customEndpoint : 'burst';

    try {
      let request = superagent.get(`${this.upstreamConfig.url}/${endpoint}`).set('User-Agent', `BHD-Burst-Proxy ${version}`);

      if (this.upstreamConfig.accountKey) {
        request = request.set('X-Account', this.upstreamConfig.accountKey).set('X-MinerName', this.upstreamConfig.minerName || this.defaultMinerName);
      }

      let {text: result} = await request.query({requestType: 'getMiningInfo'});
      result = JSON.parse(result);
      if (this.upstreamConfig.sendTargetDL) {
        result.targetDeadline = this.upstreamConfig.sendTargetDL;
      }
      const miningInfo = new MiningInfo(result.height, result.baseTarget, result.generationSignature, result.targetDeadline);
      if (miningInfo.height <= this.miningInfo.height) {
        return;
      }

      // save some stats for later
      const lastBlockHeight = this.miningInfo.height;
      const lastBaseTarget = this.miningInfo.baseTarget;
      const lastNetDiff = this.miningInfo.netDiff;
      const bestDL = this.getBestDL();
      const bestDLSubmitted = bestDL ? (bestDL.isLessThanOrEqualTo(this.upstreamConfig.targetDL)) ? bestDL : null : null;
      const accountIds = Object.keys(this.deadlines);

      this.roundStart = new Date();
      this.miningInfo = miningInfo;
      this.emit('new-round', miningInfo);
      this.deadlines = {};
      eventBus.publish('stats/current-round', this.fullUpstreamName, this.getCurrentRoundStats());
      let newBlockLine = `${this.fullUpstreamNameLogs} | New block ${miningInfo.height}, baseTarget ${miningInfo.baseTarget}, netDiff ${miningInfo.netDiff.toFixed(0)} TB`;
      if (miningInfo.targetDeadline) {
        newBlockLine += `, targetDeadline: ${miningInfo.targetDeadline}`;
      }
      eventBus.publish('log/info', newBlockLine);

      if (lastBlockHeight !== 0) {
        // Add historical, but wait some time till the wallet has caught up
        await new Promise(resolve => setTimeout(resolve, 5 * 1000));
        const lastBlockWinner = await this.getBlockWinnerAccountId(lastBlockHeight);
        const roundWon = accountIds.some(accountId => accountId === lastBlockWinner);

        await database().round.create({
          upstream: this.fullUpstreamName,
          blockHeight: lastBlockHeight,
          baseTarget: lastBaseTarget,
          netDiff: lastNetDiff,
          bestDL: bestDL ? bestDL.toString() : null,
          bestDLSubmitted: bestDLSubmitted ? bestDLSubmitted.toString() : null,
          roundWon,
        });
      }

      // Remove old historical
      const toDestroy = await database().round.findAll({
        where: {
          upstream: this.fullUpstreamName,
        },
        order: [
          ['blockHeight', 'DESC'],
        ],
        offset: this.historicalRoundsToKeep,
      });
      await Promise.all(toDestroy.map(row => row.destroy()));

      eventBus.publish('stats/historical', this.fullUpstreamName, await this.getHistoricalStats());
    } catch (err) {
      eventBus.publish('log/error', `${this.fullUpstreamNameLogs} | Error: ${err.message}`);
    }
  }

  async getBlockWinnerAccountId(height) {
    if (this.upstreamConfig.mode === 'pool' && !this.upstreamConfig.walletUrl) {
      return -1;
    }

    const url = this.upstreamConfig.walletUrl ? this.upstreamConfig.walletUrl : this.upstreamConfig.url;

    return util.getBlockWinnerAccountId(url, this.isBHD, height);
  }

  async submitNonce(submission, minerSoftware, options) {
    const queryParams = {
      requestType: 'submitNonce',
      accountId: submission.accountId,
      nonce: submission.nonce.toString(),
      blockheight: submission.height,
    };

    const isBHDSolo = this.isBHD && this.upstreamConfig.mode === 'solo';
    if (this.upstreamConfig.mode === 'pool' || isBHDSolo) {
      queryParams.deadline = submission.deadline.toString();
    } else {
      const passphrase = this.upstreamConfig.passphrases && this.upstreamConfig.passphrases[submission.accountId] || this.upstreamConfig.passphrase;
      if (!passphrase) {
        return {
          error: {
            message: 'no passphrase configured for this accountId',
            code: 2,
          },
        };
      }
      queryParams.secretPhrase = passphrase;
    }

    const overrideUrlExists = this.upstreamConfig.accountIdToUrl && this.upstreamConfig.accountIdToUrl[submission.accountId];
    const url = overrideUrlExists ? this.upstreamConfig.accountIdToUrl[submission.accountId] : this.upstreamConfig.url;
    const endpoint = this.upstreamConfig.customEndpoint ? this.upstreamConfig.customEndpoint : 'burst';
    const userAgent = `BHD-Burst-Proxy ${version}`;
    let minerSoftwareName = userAgent;
    if (this.upstreamConfig.sendMiningSoftwareName) {
      minerSoftwareName += ` | ${minerSoftware}`;
    }

    try {
      let request = superagent.post(`${url}/${endpoint}`)
        .query(queryParams)
        .set('User-Agent', minerSoftwareName)
        .set('X-Capacity', this.totalCapacity)
        .set('X-Miner', minerSoftwareName)
        .set('X-MinerName', this.upstreamConfig.minerName || this.defaultMinerName)
        .set('X-Plotfile', `${userAgent}/${hostname()}`);

      if (this.upstreamConfig.accountKey) {
        request = request.set('X-Account', this.upstreamConfig.accountKey);
      }
      // Miner can supply his own account key
      if (options && options.accountKey) {
        request = request.set('X-Account', options.accountKey);
      }

      let {text: result} = await request.retry(5);
      result = JSON.parse(result);

      return {
        error: null,
        result,
      };
    } catch (err) {
      return {
        error: {
          message: 'error reaching upstream',
          code: 3,
        },
      };
    }
  }

  getMiningInfo() {
    return this.miningInfo.toObject();
  }
}

module.exports = GenericUpstream;
