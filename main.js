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

const app = new Koa();
const router = new Router();
app.use(json());
app.use(bodyParser());

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

  const upstreams = await Promise.all(upstreamConfigs.map(async upstreamConfig => {
    const upstream = new Upstream(upstreamConfig);
    await upstream.init();

    router.get(`/${upstreamConfig.name.toLowerCase()}/burst`, (ctx) => {
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
    });
    router.post(`/${upstreamConfig.name.toLowerCase()}/burst`, async (ctx) => {
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
    });

    console.log(`${new Date().toISOString()} | proxy for upstream ${upstreamConfig.name} configured and reachable via http://${config.listenAddr}/${upstreamConfig.name.toLowerCase()}`);

    return upstream;
  }));

  app.use(router.routes());
  app.use(router.allowedMethods());

  const server = http.createServer(app.callback());
  const io = IO(server);

  io.on('connection', async client => {
    const stats = await Promise.all(upstreams.map(upstream => upstream.getStats()));
    client.emit('stats', stats);
  });

  server.listen(config.listenPort, config.listenHost);

  eventBus.subscribe('stats/new', async () => {
    const stats = await Promise.all(upstreams.map(upstream => upstream.getStats()));
    io.emit('stats', stats);
  });

  const stats = await Promise.all(upstreams.map(upstream => upstream.getStats()));
}

init();
