const superagent = require('superagent');
const JSONbig = require('json-bigint');
const bytes = require('bytes');
const BigNumber = require('bignumber.js');
const { hostname } = require('os');
const eventBus = require('./event-bus');
const database = require('../models');
const MinerRound = require('./minerRound');
const MiningInfo = require('./miningInfo');
const version = require('./version');

const historicalRoundsToKeep = 720;

class Upstream {
  constructor(upstream) {
    this.upstream = upstream;
    this.isBHD = upstream.name.toLowerCase().indexOf('bhd') !== -1;
  }

  async init() {
    await this.updateMiningInfo();
    const interval = this.upstream.updateMiningInfoInterval ? this.upstream.updateMiningInfoInterval : 1000;
    setInterval(this.updateMiningInfo.bind(this), interval);
  }

  async updateMiningInfo() {
    const endpoint = this.upstream.customEndpoint ? this.upstream.customEndpoint : 'burst';

    try {
      let request;
      const isBHDSolo = this.isBHD && this.upstream.mode === 'solo';
      if (isBHDSolo) {
        request = superagent.post(`${this.upstream.url}/${endpoint}`).unset('User-Agent');
      } else {
        request = superagent.get(`${this.upstream.url}/${endpoint}`).set('User-Agent', `Burst-BHD-Proxy ${version}`);
      }

      if (this.upstream.accountKey) {
        request = request.set('X-Account', this.upstream.accountKey);
      }

      let {text: result} = await request.query({requestType: 'getMiningInfo'});
      result = JSON.parse(result);
      const miningInfo = new MiningInfo(result.height, result.baseTarget, result.generationSignature, result.targetDeadline);
      if (miningInfo.height > this.upstream.miningInfo.height) {
        // save some stats for later
        const lastBlockHeight = this.upstream.miningInfo.height;
        const lastNetDiff = this.upstream.miningInfo.netDiff;
        const bestDL = this.getBestDL();
        const bestDLSubmitted = bestDL ? (bestDL.isLessThanOrEqualTo(this.upstream.targetDL)) ? bestDL : null : null;
        const accountIds = Object.keys(this.upstream.deadlines);

        this.upstream.roundStart = new Date();
        this.upstream.miningInfo = miningInfo;
        this.upstream.deadlines = {};
        let newBlockLine = `${this.upstream.name} | New block ${miningInfo.height}, baseTarget ${miningInfo.baseTarget}, netDiff ${miningInfo.netDiff.toFixed(0)} TB`;
        if (miningInfo.targetDeadline) {
          newBlockLine += `, targetDeadline: ${miningInfo.targetDeadline}`;
        }
        console.log(`${new Date().toISOString()} | ${newBlockLine}`);

        // Remove stale miners
        Object.keys(this.upstream.miners).forEach(key => {
          if (this.upstream.miners[key].lastBlockActive > miningInfo.height - 10) {
            return;
          }
          delete this.upstream.miners[key];
        });

        if (lastBlockHeight !== 0) {
          // Add historical
          const lastBlockWinner = await this.getBlockWinnerAccountId(lastBlockHeight);
          const roundWon = accountIds.some(accountId => accountId === lastBlockWinner);

          await database().round.create({
            upstream: this.upstream.name,
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
            upstream: this.upstream.name,
            blockHeight: {
              [database().Op.lt]: this.upstream.miningInfo.height - historicalRoundsToKeep,
            },
          },
        });

        eventBus.publish('stats/new');
      }
    } catch (err) {
      console.error(err.message);
    }
  }

  getBestDL() {
    return Object.keys(this.upstream.deadlines).reduce((acc, accountId) => {
      const dl = this.upstream.deadlines[accountId];
      if (!acc) {
        return dl;
      }
      if (acc.isGreaterThan(dl)) {
        return dl;
      }

      return acc;
    }, null);
  }

  async doBitcoinApiCal(method, params = []) {
    const url = this.upstream.walletUrl ? this.upstream.walletUrl : this.upstream.url;
    const res = await superagent.post(url).unset('User-Agent').send({
      jsonrpc: '2.0',
      id: 0,
      method,
      params,
    });

    return JSONbig.parse(res.res.text).result;
  }

  async doBurstApiCall(method, params = {}) {
    const queryParams = {
      requestType: method,
    };
    Object.keys(params).forEach(key => {
      queryParams[key] = params[key];
    });
    const url = this.upstream.walletUrl ? this.upstream.walletUrl : this.upstream.url;
    const {text: result} = await superagent.get(`${url}/burst`).query(queryParams).unset('User-Agent');

    return JSON.parse(result);
  }

  async getBlockWinnerAccountId(height) {
    if (this.upstream.mode === 'pool' && !this.upstream.walletUrl) {
      return -1;
    }
    if (this.isBHD) {
      const blockHash = await this.doBitcoinApiCal('getblockhash', [height]);
      const block = await this.doBitcoinApiCal('getblock', [blockHash], true);

      return block.plotterId.toString();
    } else {
      const block = await this.doBurstApiCall('getBlock', {height});

      return block.generator;
    }
  }

  getMiningInfo() {
    return this.upstream.miningInfo.toObject();
  }

  async handleSubmitNonce(ctx) {
    // blago does not submit the blockheight
    const blockheight = ctx.query.blockheight ? ctx.query.blockheight : this.upstream.miningInfo.height;
    const minerRound = new MinerRound(
      ctx.query.accountId,
      blockheight,
      ctx.query.nonce,
      ctx.query.deadline
    );
    const minerId = `${ctx.request.ip}/${ctx.req.headers['x-minername']}`;
    if (!this.upstream.miners[minerId]) {
      this.upstream.miners[minerId] = {};
    }
    this.upstream.miners[minerId].lastBlockActive = minerRound.height;
    this.upstream.miners[minerId].capacity = bytes(`${ctx.req.headers['x-capacity']}GB`);

    if (!minerRound.isValid()) {
      ctx.status = 400;
      ctx.body = {
        error: {
          message: 'submission has wrong format',
          code: 1,
        },
      };
      return;
    }
    if (minerRound.height !== this.upstream.miningInfo.height) {
      ctx.status = 400;
      ctx.body = {
        error: {
          message: 'submission is for different round',
          code: 2,
        },
      };
      return;
    }

    const adjustedDL = minerRound.deadline.dividedBy(this.upstream.miningInfo.baseTarget).integerValue(BigNumber.ROUND_FLOOR);

    const bestDLForAcc = this.upstream.deadlines[minerRound.accountId];

    // Do not submit worse DLs than already submitted
    if (bestDLForAcc && bestDLForAcc.isLessThanOrEqualTo(adjustedDL)) {
      ctx.body = {
        result: 'success',
        deadline: adjustedDL.toNumber(),
      };
      return;
    }

    this.upstream.deadlines[minerRound.accountId] = adjustedDL;
    eventBus.publish('stats/new');

    // DL too high to submit
    if (adjustedDL.isGreaterThan(this.upstream.targetDL)) {
      ctx.body = {
        result: 'success',
        deadline: adjustedDL.toNumber(),
      };
      return;
    }
    if (this.upstream.miningInfo.targetDeadline && adjustedDL.isGreaterThan(this.upstream.miningInfo.targetDeadline)) {
      ctx.body = {
        result: 'success',
        deadline: adjustedDL.toNumber(),
      };
      return;
    }

    const queryParams = {
      requestType: 'submitNonce',
      accountId: minerRound.accountId,
      nonce: minerRound.nonce.toString(),
      blockheight: minerRound.height,
    };
    if (this.upstream.mode === 'pool') {
      queryParams.deadline = minerRound.deadline.toString();
    } else {
      const passphrase = this.upstream.passphrase ? this.upstream.passphrase : this.upstream.passphrases[minerRound.accountId];
      if (!passphrase) {
        ctx.status = 400;
        ctx.body = {
          error: {
            message: 'no passphrase configured for this accountId',
            code: 2,
          },
        };
        return;
      }
      queryParams.secretPhrase = passphrase;
    }

    const overrideUrlExists = this.upstream.accountIdToUrl && this.upstream.accountIdToUrl[minerRound.accountId];
    const url = overrideUrlExists ? this.upstream.accountIdToUrl[minerRound.accountId] : this.upstream.url;
    const endpoint = this.upstream.customEndpoint ? this.upstream.customEndpoint : 'burst';
    const userAgent = `Burst-BHD-Proxy ${version}`;

    try {
      let request = superagent.post(`${url}/${endpoint}`)
        .query(queryParams)
        .set('User-Agent', userAgent)
        .set('X-Capacity', bytes(this.getTotalMinerCapacity(), {unit: 'GB', decimalPlaces: 0}))
        .set('X-Miner', userAgent)
        .set('X-Minername', hostname())
        .set('X-Plotfile', `${userAgent}/${hostname()}`);

      // Work around BHD wallet bug
      if (this.isBHD && this.upstream.mode === 'solo') {
        request = request.unset('User-Agent');
      }

      if (this.upstream.accountKey) {
        request = request.set('X-Account', this.upstream.accountKey);
      }
      if (ctx.req.headers['X-Account']) {
        request = request.set('X-Account', ctx.req.headers['X-Account']);
      }

      let {text: result} = await request.retry(5);
      result = JSON.parse(result);
      if (result.result === 'success') {
        console.log(`${new Date().toISOString()} | ${this.upstream.name} | ${minerId} submitted DL ${adjustedDL.toString()}`);
      } else {
        console.error(`${new Date().toISOString()} | ${this.upstream.name} | ${minerId} tried submitting DL ${adjustedDL.toString()}, failed`);
      }

      ctx.body = result;
    } catch (err) {
      ctx.status = 400;
      ctx.body = {
        error: {
          message: 'error reaching upstream',
          code: 3,
        },
      };
      console.error(`${new Date().toISOString()} | ${this.upstream.name} | ${minerId} tried submitting DL ${adjustedDL.toString()}, failed`);
    }
  }

  async handleScanProgress(ctx) {
    const minerId = `${ctx.request.ip}/${ctx.req.headers['x-minername']}`;
    if (!this.upstream.miners[minerId]) {
      this.upstream.miners[minerId] = {};
    }
    this.upstream.miners[minerId].scanProgress = parseInt(ctx.query.scanProgress, 10);
    this.upstream.miners[minerId].lastBlockActive = this.upstream.miningInfo.height;
  }

  getTotalMinerCapacity() {
    const miners = Object.keys(this.upstream.miners).map(key => this.upstream.miners[key]);

    return miners.reduce((acc, miner) => {
      return acc + (miner.capacity || 0);
    }, 0);
  }

  async getStats() {
    const miners = Object.keys(this.upstream.miners).map(key => this.upstream.miners[key]);
    const totalCapacity = miners.reduce((acc, miner) => {
      return acc + (miner.capacity || 0);
    }, 0);

    const minersWithScanProgress = miners.filter(miner => miner.scanProgress !== undefined);
    let totalScanProgress = null;
    if (minersWithScanProgress.length !== 0) {
      totalScanProgress = minersWithScanProgress.reduce((acc, miner) => {
        return acc + miner.scanProgress;
      }, 0) / minersWithScanProgress.length;
    }

    const bestDL = this.getBestDL();

    const historicalRounds = await database().round.findAll({
      where: {
        upstream: this.upstream.name,
      },
      order: [
        ['blockHeight', 'DESC'],
      ],
    });

    return {
      name: this.upstream.name,
      blockNumber: this.upstream.miningInfo.height,
      netDiff: this.upstream.miningInfo.netDiff,
      roundStart: this.upstream.roundStart,
      bestDL: bestDL ? bestDL.toString() : null,
      miner: this.upstream.miners,
      totalCapacity,
      totalScanProgress,
      roundsWon: historicalRounds.filter(round => round.roundWon).length,
      roundsSubmitted: historicalRounds.filter(round => round.bestDLSubmitted).length,
      roundsWithDLs: historicalRounds.filter(round => round.bestDL).length,
      totalRounds: historicalRounds.length,
    };
  }
}

module.exports = Upstream;