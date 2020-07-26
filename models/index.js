const fs = require('fs');
const { Sequelize, DataTypes } = require('sequelize');

const store = require('../lib/services/store');
const util = require('../lib/util');
const configModel = require('./config');
const roundModel = require('./round');

const db = {};

let isInitialized = false;

function init() {
  const sqliteFilePath = store.getDbFilePath();
  migrateDbPath(sqliteFilePath);
  migrateLegacyDbPath(sqliteFilePath);
  const databaseUrl = process.env.DATABASE_URL || `sqlite:${sqliteFilePath}`;
  const isPostgres = databaseUrl.indexOf('postgres') !== -1;
  let sequelizeConfig = {
    dialect: 'postgres',
    protocol: 'postgres',
    dialectOptions: {
      ssl: {
        rejectUnauthorized: false,
      },
    },
    logging: false,
  };
  if (!isPostgres) {
    sequelizeConfig = {
      dialect: 'sqlite',
      storage: sqliteFilePath,
      logging: false,
      retry: {
        max: 10,
      },
      pool: {
        max: 1,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
    };
  }
  const sequelize = new Sequelize(databaseUrl, sequelizeConfig);

  db.config = configModel(sequelize, DataTypes);
  db.round = roundModel(sequelize, DataTypes);

  db.sequelize = sequelize;
}

function migrateDbPath(newPath) {
  const oldPath = 'db/db.sqlite';
  if (!fs.existsSync(oldPath)) {
    return;
  }

  util.ensureFilePathExists(newPath);
  fs.renameSync(oldPath, newPath);
  fs.rmdirSync('db');
}

function migrateLegacyDbPath(newPath) {
  const oldPath = util.getLegacyFilePath('db.sqlite');
  if (!fs.existsSync(oldPath)) {
    return;
  }

  util.ensureFilePathExists(newPath);
  fs.renameSync(oldPath, newPath);
}

db.Sequelize = Sequelize;
db.Op = Sequelize.Op;

module.exports = () => {
  if (!isInitialized) {
    init();
    isInitialized = true;
  }

  return db;
};
