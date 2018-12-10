const Koa = require('koa');
const json = require('koa-json');
const bodyParser = require('koa-bodyparser');
const Router = require('koa-router');
const superagent = require('superagent');
const bytes = require('bytes');
const http = require('http');
const IO = require('socket.io');
const EventEmitter = require('events');
const Config = require('./lib/config');
const MinerRound = require('./lib/minerRound');
const MiningInfo = require('./lib/miningInfo');

const config = new Config('config.json');

const app = new Koa();
const router = new Router();
app.use(json());
app.use(bodyParser());

const upstreams = config.upstreams.map(upstream => {
  const copy = JSON.parse(JSON.stringify(upstream));
  copy.roundStart = new Date();
  copy.miningInfo = {height: 0};
  copy.deadlines = {};
  copy.miners = {};

  return copy;
});

const eventBus = new EventEmitter();

async function updateMiningInfos() {
  await Promise.all(upstreams.map(async upstream => {
    try {
      let {text: result} = await superagent.post(`${upstream.url}/burst?requestType=getMiningInfo`).unset('User-Agent');
      result = JSON.parse(result);
      const miningInfo = new MiningInfo(result.height, result.baseTarget, result.generationSignature, result.targetDeadline);
      if (miningInfo.height > upstream.miningInfo.height) {
        upstream.roundStart = new Date();
        upstream.miningInfo = miningInfo;
        upstream.deadlines = {};
        let newBlockLine = `${upstream.name}: new block ${miningInfo.height}, baseTarget ${miningInfo.baseTarget}, netDiff ${miningInfo.netDiff.toFixed(0)} TB`;
        if (miningInfo.targetDeadline) {
          newBlockLine += `, targetDeadline: ${miningInfo.targetDeadline}`;
        }
        console.log(`${new Date().toISOString()} | ${newBlockLine}`);

        // Remove stale miners
        Object.keys(upstream.miners).forEach(key => {
          if (miningInfo.height - 10 < upstream.miners[key].lastBlockSubmitted) {
            return;
          }
          delete upstream.miners[key];
        });
        eventBus.emit('stats/new');
      }
    } catch (err) {
      console.error(err.message);
    }
  }));
}

function handleGetMiningInfo(ctx, upstream) {
  ctx.body = upstream.miningInfo.toObject();
}

async function handleSubmitNonce(ctx, upstream) {
  const minerRound = new MinerRound(
    ctx.query.accountId,
    ctx.query.blockheight,
    ctx.query.nonce,
    ctx.query.deadline
  );
  const minerId = `${ctx.request.ip}/${ctx.req.headers['x-minername']}`;
  if (!upstream.miners[minerId]) {
    upstream.miners[minerId] = {};
  }
  upstream.miners[minerId].lastBlockSubmitted = minerRound.height;
  upstream.miners[minerId].capacity = bytes(`${ctx.req.headers['x-capacity']}GB`);

  if (!minerRound.isValid()) {
    ctx.status = 400;
    ctx.body = {
      error: {
        message: 'submission has wrong format',
        code: 1,
      },
    };
    return;
  }
  if (minerRound.height !== upstream.miningInfo.height) {
    ctx.status = 400;
    ctx.body = {
      error: {
        message: 'submission is for different round',
        code: 2,
      },
    };
    return;
  }

  const adjustedDL = Math.floor(minerRound.deadline / upstream.miningInfo.baseTarget);

  // DL too high to submit
  if (adjustedDL > upstream.targetDL) {
    ctx.body = {
      result: 'success',
      deadline: adjustedDL,
    };
    return;
  }

  const bestDLForAcc = upstream.deadlines[minerRound.accountId];

  // Do not submit worse DLs than already submitted
  if (bestDLForAcc && bestDLForAcc <= minerRound.deadline) {
    ctx.body = {
      result: 'success',
      deadline: adjustedDL,
    };
    return;
  }

  const queryParams = {
    requestType: 'submitNonce',
    accountId: minerRound.accountId,
    nonce: minerRound.nonce,
    blockheight: minerRound.height,
  };
  if (upstream.mode === 'pool') {
    queryParams.deadline = minerRound.deadline;
  } else {
    const passphrase = upstream.passphrases[minerRound.accountId];
    if (!passphrase) {
      ctx.status = 400;
      ctx.body = {
        error: {
          message: 'no passphrase configured for this accountId',
          code: 2,
        },
      };
      return;
    }
    queryParams.secretPhrase = passphrase;
  }

  try {
    let {text: result} = await superagent.post(`${upstream.url}/burst`).query(queryParams).unset('User-Agent').retry(2);
    result = JSON.parse(result);
    if (result.result === 'success') {
      upstream.deadlines[minerRound.accountId] = adjustedDL;
      console.log(`${new Date().toISOString()} | ${upstream.name} | Submitted DL ${adjustedDL}`);
      eventBus.emit('stats/new');
    }

    ctx.body = result;
  } catch (err) {
    ctx.status = 400;
    ctx.body = {
      error: {
        message: 'error reaching upstream',
        code: 3,
      },
    };
  }
}


async function init() {
  await updateMiningInfos();
  setInterval(updateMiningInfos, 1000);

  upstreams.map(upstream => {
    router.get(`/${upstream.name.toLowerCase()}/burst`, (ctx) => {
      const requestType = ctx.query.requestType;
      switch (requestType) {
        case 'getMiningInfo':
          handleGetMiningInfo(ctx, upstream);
          break;
        default:
          console.log(ctx.request);
          ctx.status = 400;
          ctx.body = {
            error: {
              message: 'unknown request type',
              code: 4,
            },
          };
      }
    });
    router.post(`/${upstream.name.toLowerCase()}/burst`, async (ctx) => {
      const requestType = ctx.query.requestType;
      switch (requestType) {
        case 'getMiningInfo':
          handleGetMiningInfo(ctx, upstream);
          break;
        case 'submitNonce':
          await handleSubmitNonce(ctx, upstream);
          break;
        default:
          console.log(ctx.request);
          ctx.status = 400;
          ctx.body = {
            error: {
              message: 'unknown request type',
              code: 4,
            },
          };
      }
    });
    // router.get('*', (ctx) => {
    //   console.log();
    // });
    // router.post('*', (ctx) => {
    //   console.log();
    // });

    console.log(`${new Date().toISOString()} | proxy for upstream ${upstream.name} configured and reachable via http://${config.listenAddr}/${upstream.name.toLowerCase()}`);
  });

  app.use(router.routes());
  app.use(router.allowedMethods());

  const server = http.createServer(app.callback());
  const io = IO(server);
  io.on('connection', client => {
    client.emit('stats', getStats());
  });

  server.listen(config.listenPort, config.listenHost);

  eventBus.on('stats/new', () => {
    io.emit('stats', getStats());
  });
}

function getStats() {
  return upstreams.map(upstream => {
    const totalCapacity = Object.keys(upstream.miners).reduce((acc, minerKey) => {
      return acc + upstream.miners[minerKey].capacity;
    }, 0);
    const bestDL = Object.keys(upstream.deadlines).reduce((acc, accountId) => {
      const dl = upstream.deadlines[accountId];
      if (!acc) {
        return dl;
      }
      if (acc > dl) {
        return dl;
      }

      return acc;
    }, null);

    return {
      name: upstream.name,
      blockNumber: upstream.miningInfo.height,
      roundStart: upstream.roundStart,
      bestDL,
      totalCapacity,
    };
  });
}

init();
