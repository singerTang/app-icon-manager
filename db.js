// 数据库模块：初始化 SQLite，创建 icons 表与索引
// 数据库文件位于 data/icons.db，首次运行自动创建

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// 确保 data 目录存在
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DB_PATH
  ? path.resolve(__dirname, process.env.DB_PATH)
  : path.join(dataDir, 'icons.db');

// 确保自定义路径的父目录存在
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// 开启 WAL 模式，提升并发读写表现
db.pragma('journal_mode = WAL');

// 建表：icons
db.exec(`
  CREATE TABLE IF NOT EXISTS icons (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    type        TEXT    NOT NULL DEFAULT 'app',
    category    TEXT    DEFAULT '',
    tags        TEXT    DEFAULT '',
    file_path   TEXT    DEFAULT '',
    file_type   TEXT    DEFAULT '',
    description TEXT    DEFAULT '',
    version     TEXT    DEFAULT '1.0.0',
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_icons_name     ON icons(name);
  CREATE INDEX IF NOT EXISTS idx_icons_type     ON icons(type);
  CREATE INDEX IF NOT EXISTS idx_icons_category ON icons(category);
`);

// 建表：folders（多级文件夹，parent_id=NULL 表示根级）
db.exec(`
  CREATE TABLE IF NOT EXISTS folders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    parent_id  INTEGER DEFAULT NULL,
    created_at TEXT    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
`);

// 兼容旧库：为 icons 表追加 folder_id 列（SQLite 不支持 ADD COLUMN IF NOT EXISTS）
// 用 PRAGMA 显式检查列是否存在，避免用 try/catch 吞掉真实的数据库错误
const hasFolderCol = db
  .prepare('PRAGMA table_info(icons)')
  .all()
  .some((col) => col.name === 'folder_id');
if (!hasFolderCol) {
  db.exec(`
    ALTER TABLE icons ADD COLUMN folder_id INTEGER DEFAULT NULL;
    CREATE INDEX IF NOT EXISTS idx_icons_folder ON icons(folder_id);
  `);
}

module.exports = db;
