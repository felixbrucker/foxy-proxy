const superagent = require('superagent');
const JSONbig = require('json-bigint');
const bytes = require('bytes');
const eventBus = require('./event-bus');
const database = require('../models');
const MinerRound = require('./minerRound');
const MiningInfo = require('./miningInfo');

const historicalRoundsToKeep = 720;

class Upstream {
  constructor(upstream) {
    this.upstream = upstream;
    this.isBHD = upstream.name.toLowerCase().indexOf('bhd') !== -1;
  }

  async init() {
    await this.updateMiningInfo();
    setInterval(this.updateMiningInfo.bind(this), 1000);
  }

  async updateMiningInfo() {
    try {
      let {text: result} = await superagent.post(`${this.upstream.url}/burst?requestType=getMiningInfo`).unset('User-Agent');
      result = JSON.parse(result);
      const miningInfo = new MiningInfo(result.height, result.baseTarget, result.generationSignature, result.targetDeadline);
      if (miningInfo.height > this.upstream.miningInfo.height) {
        // save some stats for later
        const lastBlockHeight = this.upstream.miningInfo.height;
        const bestDL = this.getBestDL();
        const bestDLSubmitted = (bestDL <= this.upstream.targetDL) ? bestDL : null;
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
            bestDL,
            bestDLSubmitted,
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
      if (acc > dl) {
        return dl;
      }

      return acc;
    }, null);
  }

  async doBitcoinApiCal(method, params = []) {
    const res = await superagent.post(this.upstream.url).unset('User-Agent').send({
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
    const {text: result} = await superagent.get(`${this.upstream.url}/burst`).query(queryParams).unset('User-Agent');

    return JSON.parse(result);
  }

  async getBlockWinnerAccountId(height) {
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
    const minerRound = new MinerRound(
      ctx.query.accountId,
      ctx.query.blockheight,
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

    const adjustedDL = Math.floor(minerRound.deadline / this.upstream.miningInfo.baseTarget);

    const bestDLForAcc = this.upstream.deadlines[minerRound.accountId];

    // Do not submit worse DLs than already submitted
    if (bestDLForAcc && bestDLForAcc <= adjustedDL) {
      ctx.body = {
        result: 'success',
        deadline: adjustedDL,
      };
      return;
    }

    this.upstream.deadlines[minerRound.accountId] = adjustedDL;
    eventBus.publish('stats/new');

    // DL too high to submit
    if (adjustedDL > this.upstream.targetDL) {
      ctx.body = {
        result: 'success',
        deadline: adjustedDL,
      };
      return;
    }

    const queryParams = {
      requestType: 'submitNonce',
      accountId: minerRound.accountId,
      nonce: minerRound.nonce,
      blockheight: minerRound.height,
    };
    if (this.upstream.mode === 'pool') {
      queryParams.deadline = minerRound.deadline;
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

    try {
      let {text: result} = await superagent.post(`${url}/burst`).query(queryParams).unset('User-Agent').retry(2);
      result = JSON.parse(result);
      if (result.result === 'success') {
        console.log(`${new Date().toISOString()} | ${this.upstream.name} | ${minerId} submitted DL ${adjustedDL}`);
      } else {
        console.error(`${new Date().toISOString()} | ${this.upstream.name} | ${minerId} tried submitting DL ${adjustedDL}, failed`);
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
      console.error(`${new Date().toISOString()} | ${this.upstream.name} | ${minerId} tried submitting DL ${adjustedDL}, failed`);
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

    const bestDL = Object.keys(this.upstream.deadlines).reduce((acc, accountId) => {
      const dl = this.upstream.deadlines[accountId];
      if (!acc) {
        return dl;
      }
      if (acc > dl) {
        return dl;
      }

      return acc;
    }, null);

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
      bestDL,
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