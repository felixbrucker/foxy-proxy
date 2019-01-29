const BigNumber = require('bignumber.js');
const database = require('../../models');

module.exports = (upstreamClass) => class extends upstreamClass {
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

    const blockTime = 240; // BHD's blockZeroBaseTarget is the same as burst's, use same blocktime here to get the correct capacity
    const pos = nConf > this.alphas.length ? this.alphas.length - 1 : nConf - 1;

    return this.alphas[pos] * blockTime * (nConf - 1) / weightedDLSum.toNumber();
  }
};