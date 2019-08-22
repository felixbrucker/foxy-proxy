const superagent = require('superagent');
const CoinGecko = require('./coin-gecko');

class ProfitabilityService {
  constructor() {
    this.coinGecko = new CoinGecko();
    this.rates = {};
  }

  getBlockReward(miningInfo, coin) {
    switch(coin) {
      case 'bhd': return 7.5;
      case 'burst':
        const month = Math.floor(miningInfo.height / 10800);
        return Math.floor(10000 * Math.pow(95, month) / Math.pow(100, month));
      case 'boom': return 40;
      case 'disc': return 8;
      case 'lhd': return 10;
    }

    return 0;
  }

  async init() {
    await this.updateRates();
    setInterval(this.updateRates.bind(this), 5 * 60 * 1000);
  }

  async updateRates() {
    try {
      const rates = await this.coinGecko.getRates(['bitcoin-hd', 'burst', 'boom-coin']);
      this.rates.bhd = rates['bitcoin-hd'].usd;
      this.rates.burst = rates.burst.usd;
      this.rates.boom = rates['boom-coin'].usd;
      const { body: discOtcData } = await superagent.get('https://otc.poolx.com/otc/exchange/ticker?symbol=disc_usdt');
      this.rates.disc = parseFloat(discOtcData.data.price);
    } catch (err) {}
    this.rates.lhd = 0;
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
