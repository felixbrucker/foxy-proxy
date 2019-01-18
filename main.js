const Koa = require('koa');
const json = require('koa-json');
const bodyParser = require('koa-bodyparser');
const Router = require('koa-router');
const http = require('http');
const IO = require('socket.io');
const database = require('./models');
const Config = require('./lib/config');
const Proxy = require('./lib/proxy');
const eventBus = require('./lib/event-bus');
const version = require('./lib/version');

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
  // sync() creates missing tables
  await database().sequelize.sync({
    force: false, // Do not drop tables
  });

  const app = new Koa();
  const router = new Router();
  app.use(json());
  app.use(bodyParser());

  const proxies = await Promise.all(upstreamConfigs.map(async (upstreamConfig, index) => {
    const proxy = new Proxy(upstreamConfig);
    await proxy.init();

    function handleGet(ctx) {
      const requestType = ctx.query.requestType;
      switch (requestType) {
        case 'getMiningInfo':
          ctx.body = proxy.getMiningInfo();
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
          ctx.body = proxy.getMiningInfo();
          break;
        case 'submitNonce':
          await proxy.handleSubmitNonce(ctx);
          break;
        case 'scanProgress':
          await proxy.handleScanProgress(ctx);
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
      proxy,
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

    console.log(`${new Date().toISOString()} | ${upstreamConfig.name} | ${proxy.upstream.isBHD ? 'BHD' : 'Burst'} proxy in ${upstreamConfig.mode} mode configured and reachable via http://${listenAddr}${endpoint}`);

    return result;
  }));

  app.use(router.routes());
  app.use(router.allowedMethods());

  const server = http.createServer(app.callback());
  const io = IO(server);
  server.listen(config.listenPort, config.listenHost);

  io.on('connection', async client => {
    const stats = await Promise.all(proxies.map(({proxy}) => proxy.getStats()));
    client.emit('stats', stats);
    client.on('stats/get', async () => {
      const stats = await Promise.all(proxies.map(({proxy}) => proxy.getStats()));
      client.emit('stats', stats);
    });
  });

  eventBus.subscribe('stats/new', async () => {
    const stats = await Promise.all(proxies.map(({proxy}) => proxy.getStats()));
    io.emit('stats', stats);
  });

  console.log(`${new Date().toISOString()} | BHD-Burst-Proxy ${version} initialized`);
}

init();
