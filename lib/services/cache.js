const { debounce } = require('lodash');

const database = require('../../models');
const ProcessingQueue = require('../processing-queue');

class Cache {
    constructor() {
        this.rounds = {};
        this.plotter = {};

        this.debouncedSaveRound = {};

        this.processingQueue = new ProcessingQueue();
        this.processingQueue.registerHandler('create-or-update-round', this.createOrUpdateRoundHandler.bind(this));
        this.processingQueue.registerHandler('remove-old-rounds', this.removeOldRoundsHandler.bind(this));
        this.processingQueue.registerHandler('save-entity', this.saveEntityHandler.bind(this));
        this.processingQueue.registerHandler('find-or-create-plotter', this.findOrCreatePlotterHandler.bind(this));
    }

    async ensureRoundIsCached(upstream, height) {
        if (!this.rounds[upstream.fullUpstreamName]) {
            this.rounds[upstream.fullUpstreamName] = {};
        }
        if (!this.rounds[upstream.fullUpstreamName][height]) {
            this.rounds[upstream.fullUpstreamName][height] = await database().round.findOne({
                where: {
                    upstream: upstream.fullUpstreamName,
                    blockHeight: height,
                },
            });
        }

        return this.rounds[upstream.fullUpstreamName][height];
    }

    async ensurePlotterIsCached(upstream, plotterId) {
        if (!this.plotter[upstream.fullUpstreamName]) {
            this.plotter[upstream.fullUpstreamName] = {};
        }
        if (!this.plotter[upstream.fullUpstreamName][plotterId]) {
            this.plotter[upstream.fullUpstreamName][plotterId] = await this.findOrCreatePlotter(upstream, plotterId);
        }

        return this.plotter[upstream.fullUpstreamName][plotterId];
    }

    roundWasUpdated(round) {
        if (!this.debouncedSaveRound[round.id]) {
            this.debouncedSaveRound[round.id] = debounce(this.saveEntity.bind(this), 3 * 1000, { maxWait: 5 * 1000 });
        }
        this.debouncedSaveRound[round.id](round);
    }

    async findOrCreatePlotter(upstream, plotterId) {
        return this.processingQueue.push({type: 'find-or-create-plotter', data: { upstream, plotterId, priority: 20 }});
    }

    async createOrUpdateRound(roundPrototype) {
        return this.processingQueue.push({type: 'create-or-update-round', data: roundPrototype, priority: 10});
    }

    async removeOldRounds({upstream, roundsToKeep}) {
        return this.processingQueue.push({type: 'remove-old-rounds', data: {upstream, roundsToKeep}});
    }

    async saveEntity(entity) {
        return this.processingQueue.push({type: 'save-entity', data: entity, priority: 30});
    }

    async saveEntityHandler(entity) {
        await entity.save();
    }

    async findOrCreatePlotterHandler({ upstream, plotterId }) {
        const [plotter] = await database().plotter.findOrCreate({
            where: {
                upstream: upstream.fullUpstreamName,
                id: plotterId,
            },
        });

        return plotter;
    }

    async createOrUpdateRoundHandler(roundPrototype) {
        const [round, created] = await database().round.findOrCreate({
            where: {
                upstream: roundPrototype.upstream,
                blockHeight: roundPrototype.blockHeight,
            },
            defaults: roundPrototype,
        });
        if (!created && round.baseTarget !== roundPrototype.baseTarget) {
            round.baseTarget = roundPrototype.baseTarget;
            round.netDiff = roundPrototype.netDiff;
            round.bestDL = null;
            round.bestDLSubmitted = null;
            round.roundWon = null;
            await round.save();
        }

        return round;
    }

    async removeOldRoundsHandler({upstream, roundsToKeep}) {
        const rounds = await database().round.findAll({
            where: {
                upstream,
            },
            order: [
                ['blockHeight', 'DESC'],
            ],
            offset: roundsToKeep,
        });
        for (let round of rounds) {
            await round.destroy();
        }
    }

    removeOldCachedRounds(upstream, currentHeight) {
        this.removeCachedRoundsBelow(upstream, currentHeight - 10);
    }

    removeCachedRoundsBelow(upstream, height) {
        const roundHeights = Object.keys(this.rounds[upstream.fullUpstreamName] || {});
        const heightsToRemove = roundHeights.filter(roundHeight => roundHeight < height);
        heightsToRemove
            .map(heightToRemove => this.rounds[upstream.fullUpstreamName][heightToRemove])
            .filter(round => !!round)
            .forEach(round => this.invalidateCachedRound(round));
    }

    invalidateCachedRound(round) {
        if (this.rounds[round.upstream] && this.rounds[round.upstream][round.blockHeight]) {
            delete this.rounds[round.upstream][round.blockHeight];
        }
        if (this.debouncedSaveRound[round.id]) {
            delete this.debouncedSaveRound[round.id];
        }
    }
}

module.exports = new Cache();
