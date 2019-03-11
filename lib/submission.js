const BigNumber = require('bignumber.js');

module.exports = class Submission {
  constructor(accountId, height, nonce, deadline, secretPhrase = null) {
    this._accountId = accountId;
    this._height = parseInt(height, 10);
    this._nonce = BigNumber(nonce);
    this._deadline = BigNumber(deadline);
    this._secretPhrase = secretPhrase;
  }

  isValid() {
    return this.accountId !== '' && !isNaN(this.height) && !this.nonce.isNaN() && (!this.deadline.isNaN() || this.secretPhrase);
  }

  get accountId() {
    return this._accountId;
  }

  get height() {
    return this._height;
  }

  get deadline() {
    return this._deadline;
  }

  get nonce() {
    return this._nonce;
  }

  get secretPhrase() {
    return this._secretPhrase;
  }
};
