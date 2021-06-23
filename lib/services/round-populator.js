const moment = require('moment');

const cache = require('./cache');
const database = require('../../models');
const eventBus = require('./event-bus');

class RoundPopulator {
    constructor() {
        this.blockInfoUnavailable = new Map();
    }

    async populateRound(upstream, height) {
        const lastUnavailable = this.blockInfoUnavailable.get(upstream.fullUpstreamName);
        if (lastUnavailable && moment().diff(lastUnavailable, 'minutes') < 5) {
            return;
        }

        eventBus.publish('log/debug', `Round-Populator | ${upstream.fullUpstreamNameLogs} | Populating round ${height}`);
        const blockInfo = await upstream.getBlockInfo(height);
        if (!blockInfo) {
            this.blockInfoUnavailable.set(upstream.fullUpstreamName, new Date());
        }
        if (!blockInfo || !blockInfo.hash || !blockInfo.plotterId) {
            return;
        }
        if (this.blockInfoUnavailable.has(upstream.fullUpstreamName)) {
            this.blockInfoUnavailable.delete(upstream.fullUpstreamName);
        }
        const round = await cache.ensureRoundIsCached(upstream, height);
        round.blockHash = blockInfo.hash;
        const activePlotter = await upstream.getActivePlotter(round.blockHeight);
        round.roundWon = activePlotter.some(plotter => plotter.pid === blockInfo.plotterId);

        await cache.saveEntity(round);
    }

    async populateUnpopulatedRounds(upstream, maxHeight) {
        const lastUnavailable = this.blockInfoUnavailable.get(upstream.fullUpstreamName);
        if (lastUnavailable && moment().diff(lastUnavailable, 'minutes') < 5) {
            return;
        }

        const unpopulatedRounds = await database().round.findAll({
            where: {
                upstream: upstream.fullUpstreamName,
                [database().Op.or]: [{
                    roundWon: null,
                }, {
                    blockHash: null,
                }],
                blockHeight: {
                    [database().Op.lt]: maxHeight,
                },
            },
            order: [
                ['blockHeight', 'ASC'],
            ],
        });
        for (let round of unpopulatedRounds) {
            await this.populateRound(upstream, round.blockHeight);
        }
    }
}

module.exports = new RoundPopulator();
