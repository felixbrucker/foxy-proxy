const blockZeroBaseTarget = 18325193796;

module.exports = class MiningInfo {
  constructor(height, baseTarget, generationSignature, targetDeadline = null) {
    this._height = parseInt(height, 10);
    this._baseTarget = parseInt(baseTarget, 10);
    this._generationSignature = generationSignature;
    this._targetDeadline = targetDeadline;
  }

  get height() {
    return this._height;
  }

  get baseTarget() {
    return this._baseTarget;
  }

  get generationSignature() {
    return this._generationSignature;
  }

  get targetDeadline() {
    return this._targetDeadline;
  }

  get netDiff() {
    return blockZeroBaseTarget / this.baseTarget;
  }

  toObject() {
    const obj = {
      height: this.height,
      baseTarget: this.baseTarget,
      generationSignature: this.generationSignature,
    };
    if (this.targetDeadline) {
      obj.targetDeadline = this.targetDeadline;
    }

    return obj;
  }
};
