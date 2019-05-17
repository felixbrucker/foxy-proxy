const chalk = require('chalk');
const database = require('../../models');
const eventBus = require('./event-bus');
const store = require('./store');

class HistoricalStatsUpdater {
  async updateHistoricalStats(proxies, force = false) {
    for (let proxy of proxies) {
      for (let upstream of proxy.upstreams) {
        const upstreamConfig = upstream.upstreamConfig;
        if (!force && upstreamConfig.mode === 'pool' && !upstreamConfig.walletUrl) {
          return;
        }
        if (force) {
          eventBus.publish('log/info', `Processing ${upstream.fullUpstreamNameLogs} ..`);
        }
        const query = {
          upstream: upstream.fullUpstreamName,
        };
        if (!force) {
          query.roundWon = null;
        }
        const historicalRounds = await database().round.findAll({
          where: query,
          order: [
            ['blockHeight', 'ASC'],
          ],
        });
        for (let round of historicalRounds) {
          await this.updateRoundWon(round, upstream);
        }
      }
    }
    if (force) {
      const logLine = 'Completed historical stats updates';
      eventBus.publish('log/info', store.getUseColors() ? chalk.green(logLine) : logLine);
    }
  }

  async updateRoundWon(historicalRound, upstream) {
    const accountIds = Object.keys(upstream.deadlines);
    const lastBlockWinner = await upstream.getBlockWinnerAccountId(historicalRound.blockHeight);
    const roundWon = lastBlockWinner === null ? null : accountIds.some(accountId => accountId === lastBlockWinner);
    if (historicalRound.roundWon || historicalRound.roundWon === roundWon) {
      return;
    }
    historicalRound.roundWon = roundWon;
    await historicalRound.save();
  }
}

module.exports = new HistoricalStatsUpdater();
