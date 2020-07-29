module.exports = (sequelize, DataTypes) => sequelize.define('plotter', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  upstream: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  lastSubmitHeight: {
    type: DataTypes.INTEGER,
  },
});
