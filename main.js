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

const config = new Config('config.yaml');

const proxyConfigs = config.proxies.map(proxyConfig => JSON.parse(JSON.stringify(proxyConfig)));

async function init() {
  // sync() creates missing tables
  await database().sequelize.sync({
    force: false, // Do not drop tables
  });

  const app = new Koa();
  const router = new Router();
  app.use(json());
  app.use(bodyParser());

  const proxies = await Promise.all(proxyConfigs.map(async (proxyConfig, index) => {
    const proxy = new Proxy(proxyConfig);
    await proxy.init();

    function handleGet(ctx) {
      const maxScanTime = ctx.params.maxScanTime && parseInt(ctx.params.maxScanTime, 10) || null;
      const requestType = ctx.query.requestType;
      switch (requestType) {
        case 'getMiningInfo':
          ctx.body = proxy.getMiningInfo(maxScanTime);
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
      const maxScanTime = ctx.params.maxScanTime && parseInt(ctx.params.maxScanTime, 10) || null;
      const requestType = ctx.query.requestType;
      switch (requestType) {
        case 'getMiningInfo':
          ctx.body = proxy.getMiningInfo(maxScanTime);
          break;
        case 'submitNonce':
          await proxy.handleSubmitNonce(ctx);
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
      const endpointWithScanTime = '/:maxScanTime';
      localRouter.get(`${endpoint}/burst`, handleGet);
      localRouter.post(`${endpoint}/burst`, handlePost);
      localRouter.get(`${endpointWithScanTime}/burst`, handleGet);
      localRouter.post(`${endpointWithScanTime}/burst`, handlePost);
      localApp.use(localRouter.routes());
      localApp.use(localRouter.allowedMethods());
      const localServer = http.createServer(localApp.callback());
      const listenPort = config.listenPort + index + 1;
      listenAddr = `${config.listenHost}:${listenPort}`;
      localServer.listen(listenPort, config.listenHost);
      result.server = localServer;
    } else {
      endpoint = `/${encodeURIComponent(proxyConfig.name.toLowerCase().replace(/ /g, '-'))}`;
      const endpointWithScanTime = `${endpoint}/:maxScanTime`;
      router.get(`${endpoint}/burst`, handleGet);
      router.post(`${endpoint}/burst`, handlePost);
      router.get(`${endpointWithScanTime}/burst`, handleGet);
      router.post(`${endpointWithScanTime}/burst`, handlePost);
    }

    console.log(`${new Date().toISOString()} | ${proxyConfig.name} | Proxy configured and reachable via http://${listenAddr}${endpoint}`);

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
    const connections = Object.keys(io.sockets.connected).length;
    if (connections === 0) {
      return;
    }
    const stats = await Promise.all(proxies.map(({proxy}) => proxy.getStats()));
    io.emit('stats', stats);
  });

  console.log(`${new Date().toISOString()} | BHD-Burst-Proxy ${version} initialized`);
}

init();
