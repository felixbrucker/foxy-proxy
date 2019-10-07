const superagent = require('superagent');

class CoinPaprika {
  constructor(currency = 'USD') {
    this.currency = currency;
    this.baseUrl = 'https://api.coinpaprika.com/v1';
  }

  async getRate(coinId) {
    return this.doApiCall(`tickers/${coinId}`, {quotes: this.currency});
  }

  async doApiCall(endpoint, params = {}) {
    const {body} = await superagent.get(`${this.baseUrl}/${endpoint}`).query(params);

    return body;
  }
}

module.exports = CoinPaprika;
