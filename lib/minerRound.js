module.exports = class MinerRound {
  constructor(accountId, height, nonce, deadline = null) {
    this._accountId = accountId;
    this._height = parseInt(height, 10);
    this._nonce = parseInt(nonce, 10);
    if (deadline) {
      this._deadline = parseInt(deadline, 10);
    } else {
      this._deadline = null;
    }
  }

  isValid() {
    const valid = this.accountId !== '' && !isNaN(this.height) && !isNaN(this.nonce);
    if (this.deadline) {
      return valid && !isNaN(this.deadline);
    }

    return valid;
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
};
