const presets = [
  [
    "@babel/env",
    {
      targets: {
        edge: "17",
        firefox: "60",
        chrome: "67",
        safari: "11.1",
        ie: "11",
      },
      useBuiltIns: "usage",
      corejs: '2.6.5',
    },
  ],
];

module.exports = { presets };
