BHD-Burst-Proxy
======

[![Software License](https://img.shields.io/badge/license-GPL--3.0-brightgreen.svg?style=flat-square)](LICENSE)

## Prerequisites

- nodejs >= 10

## Setup

```bash
git clone https://github.com/felixbrucker/bhd-burst-proxy
cd bhd-burst-proxy
npm ci
npm start
```
This will download the proxy, install its dependencies and setup the default config with some example upstream configs.
Edit the created `config.yaml` file so that your desired proxy/proxies and upstream(s) are configured. More on the valid config options below.
Make sure you do not break the yaml format or the file can not be read correctly.

## Running the proxy in production

I personally use pm2 to manage my nodejs based apps. An example ecosystem.config.js has been included. Just `cp ecosystem.config.js.dist ecosystem.config.js`.
Then just use `pm2 start ecosystem.config.js`.
To startup pm2 on boot use `pm2 save` to save the current running config and `pm2 startup` to startup pm2 on boot.

## Updating the proxy

When installed as a git repository just `git pull`.
If the changes have new dependencies required one needs to execute `npm ci` again as well before starting the proxy.

## BHD wallet bugs and quirks to be aware of

| Issue                                                               | resolved?                        | workaround                  |
|---------------------------------------------------------------------|----------------------------------|------------------|
| `getMiningInfo` does not support GET | :heavy_check_mark: (since v1.2.0.4) | - |
| RPC error with User-Agent set | :x: | `-rpcallowua` |
| RPC error for non-burst API requests when no rpc user / pass is set | :x: | configure a rpc user / pass |

## Solo mine BHD with the proxy

To solo mine BHD with this proxy you'll need to configure your wallet first:
- create a `btchd.conf` config file in the wallets data dir with at least the following lines:
    ```
    rpcuser=someuser
    rpcpassword=somepass
    server=1
    rpcallowua=1
    ``` 
- if your wallet is located on another machine you'll need to add `rpcallowip` lines for the ip or subnet as well
- restart your wallet
- add the rpc user/pass combo in to the wallet url in the proxy config like so: `http://someuser:somepass@localhost:8732`

## Config options

The config file currently consists of these config options:

- `proxies`: Array of proxy config objects, see below (**required**)
    - `name`: The name of the proxy, must be unique (**required**)
    - `maxScanTime`: The maximum amount of seconds each round takes to scan completely. Defaults to 30 seconds.
    - `upstreams`: Array of upstream config objects, see below (**required**)
      - `name`: The name of the upstream, must be unique within the proxy (**required**)
      - `url`: The upstream url, **required** for everything except hdpool
      - `mode`: `'solo'` or `'pool'` depending on if the upstream is a pool or a solo wallet (**required**)
      - `isBHD`: Set to `true` if the upstream is a bhd solo wallet or bhd pool (**required** for bhd based upstreams)
      - `walletUrl`: Optional url of a wallet to retrieve block winner information
      - `passphrases`: accountId -> passphrase mapping for solo mining (**required** for solo)
      - `passphrase`: Use a singular passphrase for all accountIds (pool emulation)
      - `targetDL`: Deadlines below this value will not be sent to the upstream (**required**)
      - `updateMiningInfoInterval`: Change the default 1000 msec update interval, value is in ms
      - `accountKey`: Add the supplied account key to miningInfo and nonceSubmission requests (**required** for bhd pools)
      - `type`: Only used for hdpool as of now, set it to `'hdpool'` if the upstream is hdpool.
      - `accountIdToUrl`: accountId -> upstream url (object), override the default upstream url based on the accountId
      - `historicalRoundsToKeep`: By default keep 720 rounds of historical stats, overwrite here
      - `minerName`: Set a custom miner name
      - `sendTargetDL`: Set a custom targetDL to send to the miners
      - `prio`: defines which upstream should have the higher priority when two blocks appear within the same max scan time. Defaults to 10.
      - `sendMiningSoftwareName`: When set to true send the mining software name as well on submit nonce requests.
      - `accountIdToTargetDL`: accountId -> targetDL (object), override the upstream-wide configured targetDL for specific account ids.
- `listenAddr`: a string representation of the address and port the proxy should listen on (**required**)

## Per miner maxScanTime

To allow fine granular control each miner which supports urls instead of simple ip:port can subscribe to their own maxScanTime. This was tested with scavenger only.  
To do so, just append the preferred maxScanTime in seconds to the url, like so: `http://localhost:12345/burst-bhd/25`. That would result in that miner setting its maxScanTime to 25 seconds.

## Stats

Currently stats are only available via a socket.io endpoint on the `listenAddr` address and port. An embedded web ui might be added in the future.

## Donate

- Burst: BURST-N5P2-3ETU-7LXK-DTU3X
- BHD: 382huZpCbisipKsLWTyQoPeWcpeeBRVdFF

## License

GNU GPLv3 (see LICENSE)
