const EventEmitter = require('events');
const connectionQualityMixin = require('./mixins/connection-quality-mixin');
const estimatedCapacityMixin = require('./mixins/estimated-capacity-mixin');
const statsMixin = require('./mixins/stats-mixin');
const submitProbabilityMixin = require('./mixins/submit-probability-mixin');
const configMixin = require('./mixins/config-mixin');
const cliColorMixin = require('./mixins/cli-color-mixin');

module.exports = cliColorMixin(configMixin(submitProbabilityMixin(statsMixin(estimatedCapacityMixin(connectionQualityMixin(
  EventEmitter
))))));