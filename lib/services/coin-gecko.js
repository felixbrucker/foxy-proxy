const superagent = require('superagent');

class CoinGecko {
  constructor(currency = 'usd') {
    this.currency = currency;
    this.baseUrl = 'https://api.coingecko.com/api/v3';
  }

  async getRates(symbols) {
    return this.doApiCall('simple/price', {vs_currencies: this.currency, ids: symbols.join(',')});
  }

  async doApiCall(endpoint, params = {}) {
    const res = await superagent.get(`${this.baseUrl}/${endpoint}`).query(params);

    return res.body;
  }
}

module.exports = CoinGecko;
