module.exports = (sequelize, DataTypes) => sequelize.define('config', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
  },
  uuid: {
    type: DataTypes.STRING,
    allowNull: true,
  },
});
