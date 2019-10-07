const superagent = require('superagent');
const CoinGecko = require('./coin-gecko');
const CoinPaprika = require('./coin-paprika');

class ProfitabilityService {
  constructor() {
    this.coinGecko = new CoinGecko();
    this.coinPaprika = new CoinPaprika();
    this.rates = {};
  }

  getBlockReward(miningInfo, coin) {
    switch(coin) {
      case 'bhd': return this.useEcoBlockRewards ? 4.5 : 14.25;
      case 'burst':
        const month = Math.floor(miningInfo.height / 10800);
        return Math.floor(10000 * Math.pow(95, month) / Math.pow(100, month));
      case 'boom': return this.useEcoBlockRewards ? 40 : 190;
      case 'disc': return this.useEcoBlockRewards ? 8 : 17.5; // Basically impossible to reach full rewards consistently
      case 'lhd': return this.useEcoBlockRewards ? 10 : 92;
      case 'hdd': return this.useEcoBlockRewards ? 110 : 2200;
    }

    return 0;
  }

  async init(useEcoBlockRewards) {
    this.useEcoBlockRewards = useEcoBlockRewards;
    await this.updateRates();
    setInterval(this.updateRates.bind(this), 5 * 60 * 1000);
  }

  async updateRates() {
    try {
      const rates = await this.coinGecko.getRates(['bitcoin-hd', 'burst', 'boom-coin', 'litecoin-hd']);
      this.rates.bhd = rates['bitcoin-hd'].usd;
      this.rates.burst = rates.burst.usd;
      this.rates.boom = rates['boom-coin'].usd;
      this.rates.lhd = rates['litecoin-hd'].usd;
    } catch (err) {}

    try {
      const {quotes: {USD: {price: bhdPriceInUsd}}} = await this.coinPaprika.getRate('bhd-bitcoin-hd');
      this.rates.bhd = bhdPriceInUsd;
    } catch (err) {}

    try {
      const {body: discOtcData} = await superagent.get('https://otc.poolx.com/otc/exchange/ticker?symbol=disc_usdt');
      this.rates.disc = parseFloat(discOtcData.data.price);
    } catch (err) {}

    this.rates.hdd = 0;
  }

  getRate(symbol) {
    return this.rates[symbol];
  }

  getProfitability(miningInfo, coin, blockReward) {
    const rate = this.getRate(coin);
    if (!rate) {
      return 0;
    }

    if (!blockReward) {
      blockReward = this.getBlockReward(miningInfo, coin);
    }

    return Math.round((Math.pow(1024, 2) / miningInfo.netDiff) * 100 * blockReward * rate);
  }
}

module.exports = new ProfitabilityService();
