const cache = require('./cache');
const database = require('../../models');

class RoundPopulator {
    async populateRound(upstream, height) {
        const blockInfo = await upstream.getBlockInfo(height);
        if (!blockInfo || !blockInfo.hash || !blockInfo.plotterId) {
            return;
        }
        const round = await cache.ensureRoundIsCached(upstream, height);
        round.blockHash = blockInfo.hash;
        const activePlotter = await upstream.getActivePlotter(round.blockHeight);
        round.roundWon = activePlotter.some(plotter => plotter.pid === blockInfo.plotterId);

        await cache.saveEntity(round);
    }

    async populateUnpopulatedRounds(upstream, maxHeight) {
        const unpopulatedRounds = await database().round.findAll({
            where: {
                upstream: upstream.fullUpstreamName,
                [database().Op.or]: [{
                    roundWon: null,
                }, {
                    blockHash: null,
                }],
                blockHeight: {
                    [database().Op.lte]: maxHeight,
                },
            },
            order: [
                ['blockHeight', 'ASC'],
            ],
        });
        await Promise.all(unpopulatedRounds.map(round => this.populateRound(upstream, round.blockHeight)));
    }
}

module.exports = new RoundPopulator();
