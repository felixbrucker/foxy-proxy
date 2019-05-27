<img align="right" height="120" src="./app/src/assets/fox.svg">

Foxy-Proxy
======

[![Software License](https://img.shields.io/badge/license-GPL--3.0-brightgreen.svg?style=flat-square)](LICENSE)
[![npm](https://img.shields.io/npm/v/foxy-proxy.svg?style=flat-square)](https://www.npmjs.com/package/foxy-proxy)
[![npm weekly downloads](https://img.shields.io/npm/dw/foxy-proxy.svg?style=flat-square)](https://www.npmjs.com/package/foxy-proxy)
[![docker pulls](https://img.shields.io/docker/pulls/felixbrucker/foxy-proxy.svg?style=flat-square)](https://hub.docker.com/r/felixbrucker/foxy-proxy)

## Prerequisites

- nodejs >= 10, see [here](https://github.com/felixbrucker/foxy-proxy/wiki/Installing-nodejs) how to install it

## Getting started

If you are unsure on how to proceed check this [Getting started](https://github.com/felixbrucker/foxy-proxy/wiki/Getting-started) guide.

## Setup

### With npm

```bash
npm i -g foxy-proxy
foxy-proxy
```

### With docker

A docker image based on alpine linux is built automatically on every commit to master as well as on tags.

```bash
latest : Latest master build of the proxy
1.19.0, 1.19, 1 : Version 1.19.0 of the proxy
```

To run the proxy on the fly use:

```bash
docker run --volume /path/to/conf/dir:/conf -p 12345:12345 --name foxy-proxy --rm felixbrucker/foxy-proxy
```

Or set it up via compose as a service:

```bash
version: '2'
services:
  app:
    image: felixbrucker/foxy-proxy
    restart: always
    volumes:
      - /path/to/conf/dir:/conf
    ports:
      - "12345:12345"
```

Be sure to edit the `config.yaml` to listen on `0.0.0.0` for docker.

### With git

```bash
git clone https://github.com/felixbrucker/foxy-proxy
cd foxy-proxy
npm ci
npm start
```

----

This will download the proxy, install its dependencies and setup the default config with some example upstream configs.
Edit the created `config.yaml` file so that your desired proxy/proxies and upstream(s) are configured. More on the valid config options [here](https://github.com/felixbrucker/foxy-proxy/wiki/Config-options).
Make sure you do not break the yaml format or the file can not be read correctly.

## Updating the proxy

### NPM
When installed via npm just run `npm update -g foxy-proxy`

### Docker
When using docker just pull the latest image or tag you want to update to and replace the running container.
This can be automated via [watchtower](https://github.com/v2tec/watchtower).

### Git
When installed as a git repository just `git pull`.
If the changes have new dependencies required one needs to execute `npm ci` again as well before starting the proxy.


## CLI parameters

The proxy can be setup with a custom config and db file path, see `--help` for more info:

```bash
Options:
  -V, --version              output the version number
  --config <config.yaml>     The custom config.yaml file path
  --db <db.sqlite>           The custom db.sqlite file path
  --live                     Show a live dashboard with stats
  --update-historical-stats  Update all historical stats
  --no-colors                Do not use colors in the cli output
  -h, --help                 output usage information
```

## Config examples

Some config examples can be found in the [wiki](https://github.com/felixbrucker/foxy-proxy/wiki/Config-examples)

## Running the proxy in production

I personally use pm2 to manage my nodejs based apps. An example ecosystem.config.js has been included. Just `cp ecosystem.config.js.dist ecosystem.config.js`.
Then just use `pm2 start ecosystem.config.js`.
To startup pm2 on boot use `pm2 save` to save the current running config and `pm2 startup` to startup pm2 on boot.
This will only work when installed via git.

Alternatively docker (tag) based deployments with automatic updates through [watchtower](https://github.com/v2tec/watchtower) can be used as well.


## Per miner maxScanTime

To allow fine granular control each miner which supports urls instead of simple ip:port can subscribe to their own maxScanTime. This was tested with scavenger only.  
To do so, just append the preferred maxScanTime in seconds to the url, like so: `http://localhost:12345/burst-bhd/25`. That would result in that miner setting its maxScanTime to 25 seconds.

## Stats

An embedded web ui is available on the `listenAddr` address and port. Alternatively some basic live stats are available via the `--live` cli parameter.

## Donate

- BURST: BURST-N5P2-3ETU-7LXK-DTU3X
- BHD: 382huZpCbisipKsLWTyQoPeWcpeeBRVdFF
- ETH: 0xfEc6F48633A7c557b4ac5c37B4519C55CD701BEF
- BTC: 14rbdLr2YXDkguVaqRKnPftTPX52tnv2x2
- PP: https://www.paypal.me/felixbrucker

## Changelog

A Changelog can be found [here](https://github.com/felixbrucker/foxy-proxy/blob/master/CHANGELOG.md)

## Heroku

One can deploy the proxy to Heroku, though you'll want the config to contain the `ignoreMinerIP` config option per proxy because Heroku assigns each request a different internal ip based on the load balancer route the request took.

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

## License

GNU GPLv3 (see [LICENSE](https://github.com/felixbrucker/foxy-proxy/blob/master/LICENSE))
