module.exports = (sequelize, DataTypes) => sequelize.define('plotter', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  pid: {
    type: DataTypes.STRING,
  },
  upstream: {
    type: DataTypes.STRING,
  },
  lastSubmitHeight: {
    type: DataTypes.INTEGER,
  },
}, {
  indexes: [
    {
      name: 'plotterUpstreamIndex',
      unique: false,
      fields: ['id', 'upstream'],
    },
  ],
});
