module.exports = (sequelize, DataTypes) => sequelize.define('round', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  upstream: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
    },
  },
  blockHeight: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  blockHash: {
    type: DataTypes.STRING,
  },
  baseTarget: {
    type: DataTypes.INTEGER,
  },
  netDiff: {
    type: DataTypes.INTEGER,
  },
  bestDL: {
    type: DataTypes.STRING,
  },
  bestDLSubmitted: {
    type: DataTypes.STRING,
  },
  roundWon: {
    type: DataTypes.BOOLEAN,
  },
}, {
  indexes: [
    {
      name: 'roundUpstreamBlockHeightIndex',
      unique: false,
      fields: ['upstream', 'blockHeight'],
    },
  ],
});
