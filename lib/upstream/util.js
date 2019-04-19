const bytes = require('bytes');
const crypto = require('crypto');
const JSONbig = require('json-bigint');
const bigInt = require('big-integer');
const superagent = require('superagent');

function getBestDL(deadlines) {
  return Object.keys(deadlines).reduce((acc, accountId) => {
    const dl = deadlines[accountId];
    if (!acc) {
      return dl;
    }
    if (acc.isGreaterThan(dl)) {
      return dl;
    }

    return acc;
  }, null);
}

async function doBitcoinApiCall(url, method, params = []) {
  const res = await superagent.post(url).unset('User-Agent').send({
    jsonrpc: '2.0',
    id: 0,
    method,
    params,
  });

  return JSONbig.parse(res.res.text).result;
}

async function doBurstApiCall(url, method, params = {}) {
  const queryParams = {
    requestType: method,
  };
  Object.keys(params).forEach(key => {
    queryParams[key] = params[key];
  });
  const {text: result} = await superagent.get(`${url}/burst`).query(queryParams).unset('User-Agent');

  return JSON.parse(result);
}

async function getBlockWinnerAccountId(url, isBHD, height) {
  let accountId = await getBlockWinnerAccountIdOrNull(url, isBHD, height);
  let retries = 0;
  while (accountId === null && retries < 10) {
    await new Promise(resolve => setTimeout(resolve, 5 * 1000));
    accountId = await getBlockWinnerAccountIdOrNull(url, isBHD, height);
    retries += 1;
  }

  return accountId;
}

async function getBlockWinnerAccountIdOrNull(url, isBHD, height) {
  try {
    if (isBHD) {
        const blockHash = await doBitcoinApiCall(url, 'getblockhash', [height]);
        const block = await doBitcoinApiCall(url, 'getblock', [blockHash], true);

        return block.plotterId.toString();
    } else {
      const block = await doBurstApiCall(url, 'getBlock', {height});

      if (!block.generator) {
        return null;
      }

      return block.generator;
    }
  } catch (err) {
    return null;
  }
}

function getTotalMinerCapacity(minersObj) {
  if (!minersObj) {
    return 0;
  }
  const miners = Object.keys(minersObj).map(key => minersObj[key]);

  return miners.reduce((acc, miner) => {
    return acc + (miner.capacity || 0);
  }, 0);
}

function getIdForPublicKeyBuffer(publicKeyBuffer) {
  const publicKeyHashBuffer = crypto.createHash('sha256').update(publicKeyBuffer).digest();

  return bigInt.fromArray(Array.from(publicKeyHashBuffer.slice(0, 8).reverse()), 256, false).toString();
}

module.exports = {
  getBestDL,
  getTotalMinerCapacity,
  getBlockWinnerAccountId,
  getIdForPublicKeyBuffer,
};