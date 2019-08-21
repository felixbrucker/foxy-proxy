const outputUtil = require('./output-util');

module.exports = () => {
  console.log(` ${outputUtil.getString('______  ______   __  __   __  __', '#ff4f19')}       ${outputUtil.getString('______  ______   ______   __  __   __  __', '#ff7a53')}    \n` +
    `${outputUtil.getString('/\\  ___\\/\\  __ \\ /\\_\\_\\_\\ /\\ \\_\\ \\', '#ff4f19')}     ${outputUtil.getString('/\\  == \\/\\  == \\ /\\  __ \\ /\\_\\_\\_\\ /\\ \\_\\ \\', '#ff7a53')}   \n` +
    `${outputUtil.getString('\\ \\  __\\\\ \\ \\/\\ \\\\/_/\\_\\/_\\ \\____ \\', '#ff4f19')}    ${outputUtil.getString('\\ \\  _-/\\ \\  __< \\ \\ \\/\\ \\\\/_/\\_\\/_\\ \\____ \\', '#ff7a53')}  \n` +
    ` ${outputUtil.getString('\\ \\_\\   \\ \\_____\\ /\\_\\/\\_\\\\/\\_____\\', '#ff4f19')}    ${outputUtil.getString('\\ \\_\\   \\ \\_\\ \\_\\\\ \\_____\\ /\\_\\/\\_\\\\/\\_____\\', '#ff7a53')} \n` +
    `  ${outputUtil.getString('\\/_/    \\/_____/ \\/_/\\/_/ \\/_____/', '#ff4f19')}     ${outputUtil.getString('\\/_/    \\/_/ /_/ \\/_____/ \\/_/\\/_/ \\/_____/', '#ff7a53')}\n\n` +
    `                   ${outputUtil.getString('BHD:   33fKEwAHxVwnrhisREFdSNmZkguo76a2ML', '#f99320')}\n` +
    `                   ${outputUtil.getString('LHD:   35NfQXpTdqAEGYpJyqteh8Lmn9RXrjN2Jp', '#d3d3d3')}\n` +
    `                   ${outputUtil.getString('BOOM:  BOOM-BVUD-7VWE-HD7F-6RX4P', '#6576ce')}\n` +
    `                   ${outputUtil.getString('BURST: BURST-BVUD-7VWE-HD7F-6RX4P', '#00579d')}\n` +
    `                   ${outputUtil.getString('DISC:  1F9nVpiA7iKcrpyHCGw6AeqMdU9EebZmrw', '#16702a')}\n` +
    `                   ${outputUtil.getString('ETH:   0xfEc6F48633A7c557b4ac5c37B4519C55CD701BEF', '#ecf0f1')}\n` +
    `                   ${outputUtil.getString('BTC:   14rbdLr2YXDkguVaqRKnPftTPX52tnv2x2', '#f2a900')}\n`);
};
