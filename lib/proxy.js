const BigNumber = require('bignumber.js');
const bytes = require('bytes');
const moment = require('moment');
const database = require('../models');
const eventBus = require('./event-bus');
const GenericUpstream = require('./upstream/generic');
const HDPool = require('./upstream/hdpool');
const Submission = require('./submission');
const CurrentRoundManager = require('./currentRoundManager');

const blockZeroBaseTarget = 18325193796;

class Proxy {
  static getUpstreamClass(type) {
    switch (type) {
      case 'hdpool':
        return HDPool;
      default:
        return GenericUpstream;
    }
  }

  static calculateAlphas(numberOfRounds, minNumberOfRounds) {
    return new Array(numberOfRounds).fill().map((x, index) => {
      if (index === numberOfRounds - 1) {
        return 1;
      }
      if (index < minNumberOfRounds - 1) {
        return 0;
      }
      const nConf = index + 1;
      return 1 - ((numberOfRounds - nConf) / nConf * Math.log(numberOfRounds / (numberOfRounds - nConf)));
    });
  }

  constructor(upstreamConfig) {
    this.upstreamConfig = upstreamConfig;
    this.estimatedCapacityRoundMinimum = 10;
    this.estimatedCapacityRoundInterval = upstreamConfig.historicalRoundsToKeep ? upstreamConfig.historicalRoundsToKeep : 720;
    this.alphas = Proxy.calculateAlphas(this.estimatedCapacityRoundInterval, this.estimatedCapacityRoundMinimum);
    this.currentRoundmanager = new CurrentRoundManager();
    this.miners = {};
  }

  async init() {
    const upstreamClass = Proxy.getUpstreamClass(this.upstreamConfig.type);
    this.upstream = new upstreamClass(this.upstreamConfig, this.miners);
    await this.upstream.init();
    this.upstreams = [this.upstream];
    this.upstreams.forEach(upstream => {
      upstream.on('new-round', (miningInfo) => {
        this.currentRoundmanager.addNewRound(upstream, miningInfo);
      });
    });
    setInterval(this.updateMiners.bind(this), 60 * 1000);
  }

  getMiningInfo() {
    return this.currentRoundmanager.getMiningInfo();
  }

  getUpstreamForHeight(height) {
    return this.upstreams.find(upstream => upstream.getMiningInfo().height === height);
  }

  async getEstimatedCapacity() {
    const historicalRounds = await database().round.findAll({
      where: {
        upstream: this.upstreamConfig.name,
      },
      order: [
        ['blockHeight', 'DESC'],
      ],
      limit: this.estimatedCapacityRoundInterval,
    });
    const roundsWithDLs = historicalRounds.filter(round => round.bestDL !== null);
    const nConf = roundsWithDLs.length;
    const weightedDLSum = roundsWithDLs
      .map(round => BigNumber(round.bestDL).dividedBy(round.netDiff))
      .reduce((acc, curr) => acc.plus(curr), BigNumber(0));

    if (weightedDLSum.isEqualTo(0)) {
      return 0;
    }

    const blockTime = this.upstreamConfig.isBHD ? 300 : 240;
    const pos = nConf > this.alphas.length ? this.alphas.length - 1 : nConf - 1;

    return this.alphas[pos] * blockTime * (nConf - 1) / weightedDLSum.toNumber();
  }

  async handleSubmitNonce(ctx) {
    const submission = new Submission(
      ctx.query.accountId,
      ctx.query.blockheight,
      ctx.query.nonce,
      ctx.query.deadline
    );
    const minerName = ctx.req.headers['x-minername'] || ctx.req.headers['x-miner'];
    const minerId = `${ctx.request.ip}/${minerName}`;
    if (!this.miners[minerId]) {
      this.miners[minerId] = {};
    }
    this.miners[minerId].lastTimeActive = moment();
    this.miners[minerId].capacity = bytes(`${ctx.req.headers['x-capacity']}GB`);

    if (!submission.isValid()) {
      ctx.status = 400;
      ctx.body = {
        error: {
          message: 'submission has wrong format',
          code: 1,
        },
      };
      return;
    }
    const upstream = this.getUpstreamForHeight(submission.height);
    if (!upstream) {
      ctx.status = 400;
      ctx.body = {
        error: {
          message: 'submission is for different round',
          code: 2,
        },
      };
      return;
    }

    // Probably safe as integer, but use bignum just in case
    const adjustedDL = submission.deadline.dividedBy(upstream.miningInfo.baseTarget).integerValue(BigNumber.ROUND_FLOOR);

    const bestDLForAcc = upstream.deadlines[submission.accountId];

    // Do not submit worse DLs than already submitted
    if (bestDLForAcc && bestDLForAcc.isLessThanOrEqualTo(adjustedDL)) {
      ctx.body = {
        result: 'success',
        deadline: adjustedDL.toNumber(),
      };
      return;
    }

    upstream.deadlines[submission.accountId] = adjustedDL;
    eventBus.publish('stats/new');

    // DL too high to submit
    if (adjustedDL.isGreaterThan(upstream.upstreamConfig.targetDL)) {
      ctx.body = {
        result: 'success',
        deadline: adjustedDL.toNumber(),
      };
      return;
    }
    if (upstream.miningInfo.targetDeadline && adjustedDL.isGreaterThan(upstream.miningInfo.targetDeadline)) {
      ctx.body = {
        result: 'success',
        deadline: adjustedDL.toNumber(),
      };
      return;
    }

    const result = await upstream.submitNonce(submission, ctx);
    if (result.error) {
      console.error(`${new Date().toISOString()} | ${upstream.upstreamConfig.name} | ${minerId} | account=${submission.accountId} | tried submitting DL ${adjustedDL.toString()}, failed`);
      ctx.status = 400;
      ctx.body = {
        error: result.error,
      };
      return;
    }

    let realResult = result.result;
    if (!realResult) {
      // emulate response
      realResult = {
        result: 'success',
        deadline: adjustedDL.toNumber(),
      };
    }
    if (realResult.result === 'success') {
      console.log(`${new Date().toISOString()} | ${upstream.upstreamConfig.name} | ${minerId} | account=${submission.accountId} | submitted DL ${adjustedDL.toString()}`);
    } else {
      console.error(`${new Date().toISOString()} | ${upstream.upstreamConfig.name} | ${minerId} | account=${submission.accountId} | tried submitting DL ${adjustedDL.toString()}, failed`);
    }

    ctx.body = realResult
  }

  updateMiners() {
    // Remove stale miners
    Object.keys(this.miners).forEach(key => {
      if (this.miners[key].lastTimeActive.isAfter(moment().subtract(1, 'hour'))) {
        return;
      }
      delete this.miners[key];
    });
  }

  async getStats() {
    const miners = Object.keys(this.miners).map(key => this.miners[key]);
    const totalCapacity = miners.reduce((acc, miner) => {
      return acc + (miner.capacity || 0);
    }, 0);
    const estimatedCapacityInTB = await this.getEstimatedCapacity();

    const bestDL = this.upstreams.reduce((bestDL, upstream) => {
      if (!bestDL) {
        return upstream.getBestDL();
      }
      const currBestDL = upstream.getBestDL();
      return bestDL.isGreaterThan(currBestDL) ? currBestDL : bestDL;
    }, null);

    const historicalRounds = await database().round.findAll({
      where: {
        upstream: this.upstreamConfig.name,
      },
      order: [
        ['blockHeight', 'DESC'],
      ],
    });

    return {
      name: this.upstreamConfig.name,
      isBHD: this.upstream.isBHD,
      blockNumber: this.upstream.miningInfo.height,
      netDiff: this.upstream.miningInfo.netDiff,
      roundStart: this.upstream.roundStart,
      bestDL: bestDL ? bestDL.toString() : null,
      miner: this.miners,
      totalCapacity,
      estimatedCapacityInTB,
      roundsWon: historicalRounds.filter(round => round.roundWon).length,
      roundsSubmitted: historicalRounds.filter(round => round.bestDLSubmitted).length,
      roundsWithDLs: historicalRounds.filter(round => round.bestDL).length,
      totalRounds: historicalRounds.length,
    };
  }
}

module.exports = Proxy;