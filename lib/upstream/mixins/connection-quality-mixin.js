const eventBus = require('../../services/event-bus');

module.exports = (upstreamClass) => class ConnectionQualityMixin extends upstreamClass {
  constructor() {
    super();
    this.connectionQuality = 100;
    this.connected = true;
    setInterval(this.updateConnectionQuality.bind(this), 1000);
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
};