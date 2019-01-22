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
    allowNull: false,
  },
}, {
  indexes: [
    {
      name: 'roundUpstreamIndex',
      unique: false,
      fields: ['upstream'],
    },
    {
      name: 'roundBlockHeightIndex',
      unique: false,
      fields: ['blockHeight'],
    },
  ],
});
