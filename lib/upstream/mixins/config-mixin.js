module.exports = (upstreamClass) => class ConfigMixin extends upstreamClass {
  getCapacityForAccountId(accountId) {
    if (!accountId) {
      return this.totalCapacity;
    }

    if (this.upstreamConfig.capacityForAccountId && this.upstreamConfig.capacityForAccountId[accountId]) {
      return parseInt(this.upstreamConfig.capacityForAccountId[accountId], 10);
    }

    return this.totalCapacity;
  }
};