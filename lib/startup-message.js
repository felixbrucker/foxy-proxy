const outputUtil = require('./output-util');

module.exports = () => {
  console.log(` ${outputUtil.getString('______  ______   __  __   __  __', '#ff4f19')}       ${outputUtil.getString('______  ______   ______   __  __   __  __', '#ff7a53')}    \n` +
    `${outputUtil.getString('/\\  ___\\/\\  __ \\ /\\_\\_\\_\\ /\\ \\_\\ \\', '#ff4f19')}     ${outputUtil.getString('/\\  == \\/\\  == \\ /\\  __ \\ /\\_\\_\\_\\ /\\ \\_\\ \\', '#ff7a53')}   \n` +
    `${outputUtil.getString('\\ \\  __\\\\ \\ \\/\\ \\\\/_/\\_\\/_\\ \\____ \\', '#ff4f19')}    ${outputUtil.getString('\\ \\  _-/\\ \\  __< \\ \\ \\/\\ \\\\/_/\\_\\/_\\ \\____ \\', '#ff7a53')}  \n` +
    ` ${outputUtil.getString('\\ \\_\\   \\ \\_____\\ /\\_\\/\\_\\\\/\\_____\\', '#ff4f19')}    ${outputUtil.getString('\\ \\_\\   \\ \\_\\ \\_\\\\ \\_____\\ /\\_\\/\\_\\\\/\\_____\\', '#ff7a53')} \n` +
    `  ${outputUtil.getString('\\/_/    \\/_____/ \\/_/\\/_/ \\/_____/', '#ff4f19')}     ${outputUtil.getString('\\/_/    \\/_/ /_/ \\/_____/ \\/_/\\/_/ \\/_____/', '#ff7a53')}\n\n` +
    `                   ${outputUtil.getString('BURST: BURST-N5P2-3ETU-7LXK-DTU3X', '#00579d')}\n` +
    `                   ${outputUtil.getString('BHD:   382huZpCbisipKsLWTyQoPeWcpeeBRVdFF', '#f99320')}\n` +
    `                   ${outputUtil.getString('ETH:   0xfEc6F48633A7c557b4ac5c37B4519C55CD701BEF', '#ecf0f1')}\n` +
    `                   ${outputUtil.getString('BTC:   14rbdLr2YXDkguVaqRKnPftTPX52tnv2x2', '#f2a900')}\n`);
};
