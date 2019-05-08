const eventBus = require('../../services/event-bus');

module.exports = (upstreamClass) => class ConnectionQualityMixin extends upstreamClass {
  constructor() {
    super();
    this.connectionQuality = 100;
    this.connected = true;
    this.smoothedConnectionState = this.connected;
    this.prevConnectionState = this.connected;
    this.connectionStateCounter = 0;
    this.connectionOutageCounterThreshold = 2;
    setInterval(this.updateConnectionQuality.bind(this), 1000);
    setInterval(this.detectConnectionOutage.bind(this), 1000);
  }

  async init() {
    const updateMiningInfoInterval = this.upstreamConfig.updateMiningInfoInterval ? this.upstreamConfig.updateMiningInfoInterval : 1000;
    this.connectionOutageCounterThreshold = Math.round(updateMiningInfoInterval / 1000) * 2;
    if (super.init) {
      await super.init();
    }
  }

  updateConnectionQuality() {
    const prevValue = this.connectionQuality;
    if (this.connected) {
      this.connectionQuality += 0.01;
    } else {
      this.connectionQuality -= 0.01;
    }

    this.connectionQuality = Math.min(this.connectionQuality, 100);
    this.connectionQuality = Math.max(this.connectionQuality, 0);

    if (prevValue === this.connectionQuality) {
      return;
    }

    eventBus.publish('stats/connection-stats', this.fullUpstreamName, this.getConnectionStats());
  }

  detectConnectionOutage() {
    this.prevConnectionState = this.smoothedConnectionState;

    if (this.connected) {
      this.smoothedConnectionState = true;
      this.connectionStateCounter = 0;
    } else if (this.smoothedConnectionState !== this.connected) {
      this.connectionStateCounter += 1;
    } else {
      this.connectionStateCounter = 0;
    }

    if (this.connectionStateCounter > this.connectionOutageCounterThreshold) {
      this.smoothedConnectionState = this.connected;
      this.connectionStateCounter = 0;
    }

    if (this.prevConnectionState && !this.smoothedConnectionState) {
      eventBus.publish('log/error', `${this.fullUpstreamNameLogs} | Connection outage detected ..`);
    } else if (!this.prevConnectionState && this.smoothedConnectionState) {
      eventBus.publish('log/error', `${this.fullUpstreamNameLogs} | Connection outage resolved`);
    }
  }
};