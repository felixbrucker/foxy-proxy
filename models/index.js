const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const store = require('../lib/services/store');
const util = require('../lib/util');

const useSSL = process.env.NODE_ENV === 'production';
const basename = path.basename(module.filename);
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
      ssl: useSSL,
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

  // Load all models
  fs.readdirSync(__dirname)
    .filter(file => (file.indexOf('.') !== 0) && (file !== basename) && (file.slice(-3) === '.js'))
    .forEach((file) => {
      const model = sequelize.import(path.join(__dirname, file));
      db[model.name] = model;
    });

  Object.keys(db).forEach((modelName) => {
    if (db[modelName].associate) {
      db[modelName].associate(db);
    }
  });

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
