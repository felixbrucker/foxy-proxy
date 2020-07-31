const BigNumber = require('bignumber.js');

const cache = require('./cache');
const eventBus = require('./event-bus');

class SubmissionProcessor {
    async processSubmission({upstream, submission, isSubmitted = true}) {
        eventBus.publish('log/trace', `Submission-Processor | ${upstream.fullUpstreamNameLogs} | Processing ${isSubmitted ? 'submitted' : 'received'} submission for height ${submission.height} with DL ${submission.deadline}`);
        const round = await cache.ensureRoundIsCached(upstream, submission.height);
        let roundUpdated = false;
        if (round.bestDL === null || (new BigNumber(round.bestDL)).isGreaterThan(submission.deadline)) {
            round.bestDL = submission.deadline;
            roundUpdated = true;
        }
        if (isSubmitted && (round.bestDLSubmitted === null || (new BigNumber(round.bestDLSubmitted)).isGreaterThan(submission.deadline))) {
            round.bestDLSubmitted = submission.deadline;
            roundUpdated = true;
        }
        if (roundUpdated) {
            cache.roundWasUpdated(round);
        }

        const plotter = await cache.ensurePlotterIsCached(upstream, submission.accountId);
        let plotterUpdated = false;
        if (!plotter.lastSubmitHeight || plotter.lastSubmitHeight < submission.height) {
            plotter.lastSubmitHeight = submission.height;
            plotterUpdated = true;
        }

        if (plotterUpdated) {
            await cache.saveEntity(plotter);
        }
    }
}

module.exports = new SubmissionProcessor();
