const JSONbig = require('json-bigint');
const superagent = require('superagent');

const eventBus = require('../services/event-bus');

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

async function doBurstApiCall(url, method, params = {}, endpoint = 'burst') {
  const queryParams = {
    requestType: method,
  };
  Object.keys(params).forEach(key => {
    queryParams[key] = params[key];
  });
  const {text: result} = await superagent.get(`${url}/${endpoint}`).query(queryParams).unset('User-Agent');

  return JSON.parse(result);
}

async function getBhdBlockInfo({url, height}) {
  try {
    const blockHash = await doBitcoinApiCall(url, 'getblockhash', [height]);
    const block = await doBitcoinApiCall(url, 'getblock', [blockHash]);
    const plotterId = block.plotterId || block.plotterid;

    return {
      height,
      hash: block.hash,
      plotterId: plotterId.toString(),
    };
  } catch (err) {
    eventBus.publish('log/error', `Failed retrieving block info for height ${height}`);

    return null;
  }
}

async function getBurstBlockInfo({url, height}) {
  try {
    const block = await doBurstApiCall(url, 'getBlock', {height});

    return {
      height,
      hash: block.block,
      plotterId: block.generator,
    };
  } catch (err) {
    eventBus.publish('log/error', `Failed retrieving block info for height ${height}`);

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

module.exports = {
  getBestDL,
  getTotalMinerCapacity,
  getBhdBlockInfo,
  getBurstBlockInfo,
};