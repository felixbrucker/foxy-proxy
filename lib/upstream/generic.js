const superagent = require('superagent');
const { hostname } = require('os');
const database = require('../../models');
const eventBus = require('../event-bus');
const MiningInfo = require('../miningInfo');
const util = require('./util');
const version = require('../version');

class GenericUpstream {
  constructor(upstreamConfig) {
    this.upstreamConfig = upstreamConfig;
    this.isBHD = upstreamConfig.isBHD || upstreamConfig.name.toLowerCase().indexOf('bhd') !== -1;
    this.historicalRoundsToKeep = upstreamConfig.historicalRoundsToKeep ? upstreamConfig.historicalRoundsToKeep : 720;
    this.miningInfo = {height: 0};
    this.deadlines = {};
    this.miners = {};
    this.roundStart = new Date();
  }

  async init() {
    await this.updateMiningInfo();
    const interval = this.upstreamConfig.updateMiningInfoInterval ? this.upstreamConfig.updateMiningInfoInterval : 1000;
    setInterval(this.updateMiningInfo.bind(this), interval);
  }

  async updateMiningInfo() {
    const endpoint = this.upstreamConfig.customEndpoint ? this.upstreamConfig.customEndpoint : 'burst';

    try {
      let request;
      const isBHDSolo = this.isBHD && this.upstreamConfig.mode === 'solo';
      if (isBHDSolo) {
        request = superagent.post(`${this.upstreamConfig.url}/${endpoint}`).unset('User-Agent');
      } else {
        request = superagent.get(`${this.upstreamConfig.url}/${endpoint}`).set('User-Agent', `BHD-Burst-Proxy ${version}`);
      }

      if (this.upstreamConfig.accountKey) {
        request = request.set('X-Account', this.upstreamConfig.accountKey).set('X-MinerName', `BHD-Burst-Proxy ${version}/${hostname()}`);
      }

      let {text: result} = await request.query({requestType: 'getMiningInfo'});
      result = JSON.parse(result);
      const miningInfo = new MiningInfo(result.height, result.baseTarget, result.generationSignature, result.targetDeadline);
      if (miningInfo.height <= this.miningInfo.height) {
        return;
      }

      // save some stats for later
      const lastBlockHeight = this.miningInfo.height;
      const lastNetDiff = this.miningInfo.netDiff;
      const bestDL = util.getBestDL(this.deadlines);
      const bestDLSubmitted = bestDL ? (bestDL.isLessThanOrEqualTo(this.upstreamConfig.targetDL)) ? bestDL : null : null;
      const accountIds = Object.keys(this.deadlines);

      this.roundStart = new Date();
      this.miningInfo = miningInfo;
      this.deadlines = {};
      let newBlockLine = `${this.upstreamConfig.name} | New block ${miningInfo.height}, baseTarget ${miningInfo.baseTarget}, netDiff ${miningInfo.netDiff.toFixed(0)} TB`;
      if (miningInfo.targetDeadline) {
        newBlockLine += `, targetDeadline: ${miningInfo.targetDeadline}`;
      }
      console.log(`${new Date().toISOString()} | ${newBlockLine}`);

      // Remove stale miners
      Object.keys(this.miners).forEach(key => {
        if (this.miners[key].lastBlockActive > miningInfo.height - 10) {
          return;
        }
        delete this.miners[key];
      });

      if (lastBlockHeight !== 0) {
        // Add historical, but wait some time till the wallet has caught up
        await new Promise(resolve => setTimeout(resolve, 5 * 1000));
        const lastBlockWinner = await this.getBlockWinnerAccountId(lastBlockHeight);
        const roundWon = accountIds.some(accountId => accountId === lastBlockWinner);

        await database().round.create({
          upstream: this.upstreamConfig.name,
          blockHeight: lastBlockHeight,
          netDiff: lastNetDiff,
          bestDL: bestDL ? bestDL.toString() : null,
          bestDLSubmitted: bestDLSubmitted ? bestDLSubmitted.toString() : null,
          roundWon,
        });
      }

      // Remove old historical
      await database().round.destroy({
        where: {
          upstream: this.upstreamConfig.name,
          blockHeight: {
            [database().Op.lt]: this.miningInfo.height - this.historicalRoundsToKeep,
          },
        },
      });

      eventBus.publish('stats/new');
    } catch (err) {
      console.error(`${new Date().toISOString()} | ${this.upstreamConfig.name} | Error: ${err.message}`);
    }
  }

  async getBlockWinnerAccountId(height) {
    if (this.upstreamConfig.mode === 'pool' && !this.upstreamConfig.walletUrl) {
      return -1;
    }

    const url = this.upstreamConfig.walletUrl ? this.upstreamConfig.walletUrl : this.upstreamConfig.url;

    return util.getBlockWinnerAccountId(url, this.isBHD, height);
  }

  async submitNonce(minerRound, ctx) {
    const queryParams = {
      requestType: 'submitNonce',
      accountId: minerRound.accountId,
      nonce: minerRound.nonce.toString(),
      blockheight: minerRound.height,
    };
    if (this.upstreamConfig.mode === 'pool') {
      queryParams.deadline = minerRound.deadline.toString();
    } else {
      const passphrase = this.upstreamConfig.passphrase ? this.upstreamConfig.passphrase : this.upstreamConfig.passphrases[minerRound.accountId];
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

    const overrideUrlExists = this.upstreamConfig.accountIdToUrl && this.upstreamConfig.accountIdToUrl[minerRound.accountId];
    const url = overrideUrlExists ? this.upstreamConfig.accountIdToUrl[minerRound.accountId] : this.upstreamConfig.url;
    const endpoint = this.upstreamConfig.customEndpoint ? this.upstreamConfig.customEndpoint : 'burst';
    const userAgent = `BHD-Burst-Proxy ${version}`;

    try {
      let request = superagent.post(`${url}/${endpoint}`)
        .query(queryParams)
        .set('User-Agent', userAgent)
        .set('X-Capacity', this.getTotalCapacity())
        .set('X-Miner', userAgent)
        .set('X-MinerName', `${userAgent}/${hostname()}`)
        .set('X-Plotfile', `${userAgent}/${hostname()}`);

      // Work around BHD wallet bug
      if (this.isBHD && this.upstreamConfig.mode === 'solo') {
        request = request.unset('User-Agent');
      }

      if (this.upstreamConfig.accountKey) {
        request = request.set('X-Account', this.upstreamConfig.accountKey);
      }
      // Miner can supply his own account key
      if (ctx.req.headers['x-account']) {
        request = request.set('X-Account', ctx.req.headers['X-Account']);
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

  getBestDL() {
    return util.getBestDL(this.deadlines);
  }

  getTotalCapacity() {
    if (this.upstreamConfig.capacity !== undefined) {
      return this.upstreamConfig.capacity;
    }

    return util.convertCapacityToGB(util.getTotalMinerCapacity(this.miners));
  }
}

module.exports = GenericUpstream;
