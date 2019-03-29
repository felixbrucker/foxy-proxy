const database = require('../../models');
const eventBus = require('./event-bus');

class HistoricalStatsUpdater {
  async updateHistoricalStats(proxies) {
    for (let proxy of proxies) {
      for (let upstream of proxy.upstreams) {
        eventBus.publish('log/info', `Processing ${upstream.fullUpstreamNameLogs} ..`);
        const historicalRounds = await database().round.findAll({
          where: {
            upstream: upstream.fullUpstreamName,
          },
          order: [
            ['blockHeight', 'ASC'],
          ],
        });
        for (let round of historicalRounds) {
          await this.updateRoundWon(round, upstream);
        }
      }
    }
    eventBus.publish('log/info', 'Completed historical stats updates');
  }

  async updateRoundWon(historicalRound, upstream) {
    const accountIds = Object.keys(upstream.deadlines);
    const lastBlockWinner = await upstream.getBlockWinnerAccountId(historicalRound.blockHeight);
    const roundWon = accountIds.some(accountId => accountId === lastBlockWinner);
    if (historicalRound.roundWon || historicalRound.roundWon === roundWon) {
      return;
    }
    historicalRound.roundWon = roundWon;
    await historicalRound.save();
  }
}

module.exports = new HistoricalStatsUpdater();
