const BigNumber = require('bignumber.js');
const moment = require('moment/moment');
const database = require('../../../models');

module.exports = (upstreamClass) => class EstimatedCapacityMixin extends upstreamClass {
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

  async init() {
    this.alphas = {};
    this.estimatedCapacityRoundMinimum = 10;
    this.estimatedCapacityRoundInterval = this.upstreamConfig.estimatedCapacityRounds || this.upstreamConfig.historicalRoundsToKeep || (this.isBHD ? 288 : 360);
    for (let i = this.estimatedCapacityRoundMinimum; i <= this.estimatedCapacityRoundInterval; i += 1) {
      this.alphas[i] = EstimatedCapacityMixin.calculateAlphas(i, this.estimatedCapacityRoundMinimum);
    }
    if (super.init) {
      await super.init();
    }
  }

  async getEstimatedCapacity(excludeFastBlocks = false) {
    const historicalRoundsOriginal = await database().round.findAll({
      where: {
        upstream: this.fullUpstreamName,
      },
      order: [
        ['blockHeight', 'DESC'],
      ],
      limit: this.estimatedCapacityRoundInterval,
    });
    let historicalRounds = historicalRoundsOriginal;
    if (excludeFastBlocks) {
      historicalRounds = historicalRoundsOriginal.filter((round, index) => {
        if (index === historicalRoundsOriginal.length - 1) {
          // last one, skip
          return false;
        }
        const previousRound = historicalRounds[index + 1];

        return moment(round.createdAt).diff(previousRound.createdAt, 'seconds') > 20;
      });
    }
    const totalRounds = historicalRoundsOriginal.length;
    const roundsWithDLs = historicalRounds.filter(round => round.bestDL !== null);
    const nConf = roundsWithDLs.length;
    const nConfAlpha = historicalRoundsOriginal.filter(round => round.bestDL !== null).length;
    const weightedDLSum = roundsWithDLs
      .map(round => BigNumber(round.bestDL).dividedBy(round.netDiff))
      .reduce((acc, curr) => acc.plus(curr), BigNumber(0));

    if (weightedDLSum.isEqualTo(0)) {
      return 0;
    }

    // BHD's blockZeroBaseTarget is the same as burst's, use same blocktime here to get the correct capacity
    const blockTime = 240;
    const alpha = this.alphas[totalRounds];
    if (!alpha) {
      return 0;
    }
    const pos = nConfAlpha > alpha.length ? alpha.length - 1 : nConfAlpha - 1;

    return alpha[pos] * blockTime * (nConf - 1) / weightedDLSum.toNumber();
  }
};