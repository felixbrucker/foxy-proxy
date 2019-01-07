const Koa = require('koa');
const json = require('koa-json');
const bodyParser = require('koa-bodyparser');
const Router = require('koa-router');
const http = require('http');
const IO = require('socket.io');
const database = require('./models');
const Config = require('./lib/config');
const Upstream = require('./lib/upstream');
const eventBus = require('./lib/event-bus');

const config = new Config('config.json');

const upstreamConfigs = config.upstreams.map(upstream => {
  const copy = JSON.parse(JSON.stringify(upstream));
  copy.roundStart = new Date();
  copy.miningInfo = {height: 0};
  copy.deadlines = {};
  copy.miners = {};

  return copy;
});

async function init() {
  if (process.env.DATABASE_URL) {
    // sync() creates missing tables
    await database().sequelize.sync({
      force: false, // Do not drop tables
    });
  }

  const app = new Koa();
  const router = new Router();
  app.use(json());
  app.use(bodyParser());

  const upstreams = await Promise.all(upstreamConfigs.map(async (upstreamConfig, index) => {
    const upstream = new Upstream(upstreamConfig);
    await upstream.init();

    function handleGet(ctx) {
      const requestType = ctx.query.requestType;
      switch (requestType) {
        case 'getMiningInfo':
          ctx.body = upstream.getMiningInfo();
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
    }

    async function handlePost(ctx) {
      const requestType = ctx.query.requestType;
      switch (requestType) {
        case 'getMiningInfo':
          ctx.body = upstream.getMiningInfo();
          break;
        case 'submitNonce':
          await upstream.handleSubmitNonce(ctx);
          break;
        case 'scanProgress':
          await upstream.handleScanProgress(ctx);
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
    }

    const result = {
      upstream,
    };

    let endpoint;
    let listenAddr = config.listenAddr;
    if (config.useMultiplePorts) {
      const localApp = new Koa();
      const localRouter = new Router();
      localApp.use(json());
      localApp.use(bodyParser());
      endpoint = '';
      localRouter.get('/burst', handleGet);
      localRouter.post('/burst', handlePost);
      localApp.use(localRouter.routes());
      localApp.use(localRouter.allowedMethods());
      const localServer = http.createServer(localApp.callback());
      const listenPort = config.listenPort + index + 1;
      listenAddr = `${config.listenHost}:${listenPort}`;
      localServer.listen(listenPort, config.listenHost);
      result.server = localServer;
    } else {
      endpoint = `/${encodeURIComponent(upstreamConfig.name.toLowerCase().replace(' ', '-'))}`;
      router.get(`${endpoint}/burst`, handleGet);
      router.post(`${endpoint}/burst`, handlePost);
    }

    console.log(`${new Date().toISOString()} | ${upstreamConfig.name} | ${upstream.isBHD ? 'BHD' : 'Burst'} proxy in ${upstream.upstream.mode} mode configured and reachable via http://${listenAddr}${endpoint}`);

    return result;
  }));

  app.use(router.routes());
  app.use(router.allowedMethods());

  const server = http.createServer(app.callback());
  const io = IO(server);
  server.listen(config.listenPort, config.listenHost);

  io.on('connection', async client => {
    const stats = await Promise.all(upstreams.map(({upstream}) => upstream.getStats()));
    client.emit('stats', stats);
  });

  eventBus.subscribe('stats/new', async () => {
    const stats = await Promise.all(upstreams.map(({upstream}) => upstream.getStats()));
    io.emit('stats', stats);
  });
}

init();
