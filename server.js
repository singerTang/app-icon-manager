// 应用 icon 管理端：Express 服务入口
// 提供静态页面托管与 icons 的增删改查、分类、导入导出 API

const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// 上传目录，首次运行自动创建
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 允许的图标文件类型
const ALLOWED_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico'];

// 允许的 type 字段值（白名单，防止存储型 XSS）
const ALLOWED_TYPES = ['app', 'symbol'];

// 当前时间，ISO 字符串
function now() {
  return new Date().toISOString();
}

function normalizeUploadName(name) {
  const decoded = Buffer.from(String(name || ''), 'latin1').toString('utf8');
  return /[一-鿿]/.test(decoded) ? decoded : String(name || '');
}

// 复用的 GBK 解码器，用于解析未声明 UTF-8 的 ZIP 条目名
const gbkDecoder = new TextDecoder('gbk');

// 解码 ZIP 条目文件名：UTF-8 标志位（通用标志 bit 11）置位则按 utf8，
// 否则按中文 Windows 常见的 GBK/CP936 解码，修复中文名乱码
function decodeZipEntryName(entry) {
  const raw = entry.rawEntryName;
  if (!raw || !raw.length) return entry.entryName;
  const flags = (entry.header && entry.header.flags) || 0;
  const isUtf8 = (flags & 0x800) !== 0;
  return isUtf8 ? raw.toString('utf8') : gbkDecoder.decode(raw);
}

function normalizeIds(ids) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

function parseOptionalFolderId(value) {
  if (value === undefined || value === null || value === '' || value === 'null') return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : NaN;
}

// multer 存储配置：保留原扩展名，文件名加时间戳避免冲突
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const originalName = normalizeUploadName(file.originalname);
    const ext = path.extname(originalName).toLowerCase();
    const base = path.basename(originalName, ext)
      .replace(/[^\w\u4e00-\u9fa5-]/g, '_')
      .slice(0, 50);
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 单文件最大 5MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(normalizeUploadName(file.originalname)).toLowerCase();
    if (ALLOWED_EXT.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型，仅允许图片或 SVG'));
    }
  },
});

// ZIP 上传专用 multer（50MB，仅允许 .zip）
const uploadZip = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}_upload.zip`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.zip') {
      cb(null, true);
    } else {
      cb(new Error('请上传 .zip 格式的文件'));
    }
  },
});

app.use(express.json({ limit: '20mb' }));

// 静态资源托管
app.use(express.static(path.join(__dirname, 'public')));
// SVG 强制以 attachment 方式响应，防止同源直接执行脚本
app.use('/uploads', express.static(uploadDir, {
  setHeaders: (res, filePath) => {
    if (path.extname(filePath).toLowerCase() === '.svg') {
      res.setHeader('Content-Disposition', 'attachment');
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
  },
}));

// 校验失败时清理已落盘的上传文件，防止磁盘垃圾残留
function removeUploadedFile(file) {
  if (file && file.path && fs.existsSync(file.path)) {
    fs.unlink(file.path, () => {});
  }
}

// 删除磁盘上的图标文件（file_path 形如 /uploads/xxx）
function removeFileByPath(filePath) {
  if (!filePath) return;
  const name = path.basename(filePath);
  const abs = path.join(uploadDir, name);
  if (fs.existsSync(abs)) {
    try {
      fs.unlinkSync(abs);
    } catch (err) {
      console.warn('删除文件失败:', abs, err.message);
    }
  }
}

// ─── 文件夹 API ──────────────────────────────────────────────

// 获取所有文件夹（flat 数组，前端构建树），每项附带直属图标数量 icon_count
app.get('/api/folders', (req, res) => {
  const rows = db
    .prepare(
      `SELECT f.*, COUNT(i.id) AS icon_count
         FROM folders f
         LEFT JOIN icons i ON i.folder_id = f.id
        GROUP BY f.id
        ORDER BY f.parent_id, f.name`
    )
    .all();
  res.json(rows);
});

// 全局统计：图标总数与未归类数量，用于侧栏「全部图标」与底部统计
app.get('/api/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS n FROM icons').get().n;
  const unfiled = db.prepare('SELECT COUNT(*) AS n FROM icons WHERE folder_id IS NULL').get().n;
  res.json({ total, unfiled });
});

// 新建文件夹
app.post('/api/folders', (req, res) => {
  const { name, parent_id = null } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: '文件夹名称不能为空' });
  }
  const info = db
    .prepare('INSERT INTO folders (name, parent_id, created_at) VALUES (?, ?, ?)')
    .run(name.trim(), parent_id || null, now());
  const row = db.prepare('SELECT * FROM folders WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

// 重命名文件夹
app.put('/api/folders/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: '文件夹名称不能为空' });
  }
  const existing = db.prepare('SELECT id FROM folders WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: '文件夹不存在' });
  db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(name.trim(), id);
  res.json(db.prepare('SELECT * FROM folders WHERE id = ?').get(id));
});

// 删除文件夹（图标 folder_id 置 NULL，子文件夹 parent_id 置 NULL 变为根级）
app.delete('/api/folders/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM folders WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: '文件夹不存在' });

  db.transaction(() => {
    db.prepare('UPDATE icons SET folder_id = NULL WHERE folder_id = ?').run(id);
    db.prepare('UPDATE folders SET parent_id = NULL WHERE parent_id = ?').run(id);
    db.prepare('DELETE FROM folders WHERE id = ?').run(id);
  })();
  res.json({ success: true });
});

// ─── 批量上传 API ─────────────────────────────────────────────

// 批量图片上传（multipart files[]）
app.post('/api/icons/batch', upload.array('files', 50), (req, res) => {
  const files = req.files || [];
  if (!files.length) {
    return res.status(400).json({ error: '未收到文件' });
  }
  const folder_id = req.body.folder_id ? Number(req.body.folder_id) : null;
  const type = ALLOWED_TYPES.includes(req.body.type) ? req.body.type : null;

  const insert = db.prepare(
    `INSERT INTO icons (name, type, category, tags, file_path, file_type, description, version, folder_id, created_at, updated_at)
     VALUES (?, ?, '', '', ?, ?, '', '1.0.0', ?, ?, ?)`
  );

  const results = db.transaction(() => {
    return files.map((file) => {
      const ext = path.extname(file.filename).slice(1).toLowerCase();
      const originalName = normalizeUploadName(file.originalname);
      const baseName = path.basename(originalName, path.extname(originalName));
      const iconType = type || (ext === 'svg' ? 'symbol' : 'app');
      const ts = now();
      const info = insert.run(baseName, iconType, `/uploads/${file.filename}`, ext, folder_id, ts, ts);
      return db.prepare('SELECT * FROM icons WHERE id = ?').get(info.lastInsertRowid);
    });
  })();

  res.status(201).json({ added: results.length, icons: results });
});

// ZIP 批量上传（解压后批量入库，处理完删临时 ZIP）
app.post('/api/icons/batch-zip', uploadZip.single('zipfile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '未收到 ZIP 文件' });
  }
  const folder_id = req.body.folder_id ? Number(req.body.folder_id) : null;
  const zipPath = req.file.path;

  let added = 0;
  let skipped = 0;

  try {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();

    const insert = db.prepare(
      `INSERT INTO icons (name, type, category, tags, file_path, file_type, description, version, folder_id, created_at, updated_at)
       VALUES (?, ?, '', '', ?, ?, '', '1.0.0', ?, ?, ?)`
    );

    db.transaction(() => {
      for (const entry of entries) {
        if (entry.isDirectory) continue;
        const entryName = decodeZipEntryName(entry);
        const ext = path.extname(entryName).toLowerCase();
        if (!ALLOWED_EXT.includes(ext)) { skipped += 1; continue; }

        const baseName = path.basename(entryName, ext);
        const filename = `${Date.now()}_${baseName.replace(/[^\w一-龥-]/g, '_').slice(0, 50)}${ext}`;
        const destPath = path.join(uploadDir, filename);
        fs.writeFileSync(destPath, entry.getData());

        const iconType = ext === '.svg' ? 'symbol' : 'app';
        const ts = now();
        insert.run(baseName, iconType, `/uploads/${filename}`, ext.slice(1), folder_id, ts, ts);
        added += 1;
      }
    })();
  } catch (err) {
    fs.unlink(zipPath, () => {});
    return res.status(400).json({ error: `ZIP 解析失败：${err.message}` });
  }

  fs.unlink(zipPath, () => {});
  res.json({ added, skipped });
});

// ─── 图标 API ────────────────────────────────────────────────

// 列表查询，支持 search / type / category / folder_id 筛选
app.get('/api/icons', (req, res) => {
  const { search = '', type = '', category = '', folder_id = '' } = req.query;
  const conditions = [];
  const params = [];

  if (search) {
    conditions.push('(name LIKE ? OR tags LIKE ? OR description LIKE ?)');
    const kw = `%${search}%`;
    params.push(kw, kw, kw);
  }
  if (type) {
    conditions.push('type = ?');
    params.push(type);
  }
  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }
  if (folder_id !== '') {
    conditions.push('folder_id IS ?');
    params.push(folder_id === 'null' ? null : Number(folder_id));
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // 按需分页：带 page 参数时返回 { total, page, pageSize, icons }，
  // 否则维持返回数组（向后兼容既有调用方）
  if (req.query.page !== undefined) {
    const PAGE_SIZES = [30, 50, 100];
    const pageSize = PAGE_SIZES.includes(Number(req.query.pageSize)) ? Number(req.query.pageSize) : 30;
    const total = db.prepare(`SELECT COUNT(*) AS n FROM icons ${where}`).get(...params).n;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    let page = Number(req.query.page);
    if (!Number.isInteger(page) || page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    const offset = (page - 1) * pageSize;
    const icons = db
      .prepare(`SELECT * FROM icons ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, offset);
    return res.json({ total, page, pageSize, icons });
  }

  const rows = db
    .prepare(`SELECT * FROM icons ${where} ORDER BY updated_at DESC`)
    .all(...params);
  res.json(rows);
});

// 新增图标
app.post('/api/icons', upload.single('file'), (req, res) => {
  const { name, type = 'app', category = '', tags = '', description = '', version = '1.0.0' } = req.body;
  if (!name || !name.trim()) {
    removeUploadedFile(req.file);
    return res.status(400).json({ error: '名称不能为空' });
  }
  if (!ALLOWED_TYPES.includes(type)) {
    removeUploadedFile(req.file);
    return res.status(400).json({ error: 'type 只允许 app 或 symbol' });
  }

  let filePath = '';
  let fileType = '';
  if (req.file) {
    filePath = `/uploads/${req.file.filename}`;
    fileType = path.extname(req.file.filename).slice(1).toLowerCase();
  }

  const folder_id = req.body.folder_id !== undefined
    ? (req.body.folder_id === '' || req.body.folder_id === 'null' ? null : Number(req.body.folder_id))
    : null;

  const ts = now();
  const info = db
    .prepare(
      `INSERT INTO icons (name, type, category, tags, file_path, file_type, description, version, folder_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(name.trim(), type, category, tags, filePath, fileType, description, version, folder_id, ts, ts);

  const row = db.prepare('SELECT * FROM icons WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(row);
});

// 编辑图标（可选替换文件）
app.put('/api/icons/:id', upload.single('file'), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM icons WHERE id = ?').get(id);
  if (!existing) {
    removeUploadedFile(req.file);
    return res.status(404).json({ error: '图标不存在' });
  }

  const {
    name = existing.name,
    type = existing.type,
    category = existing.category,
    tags = existing.tags,
    description = existing.description,
    version = existing.version,
  } = req.body;

  if (!name || !name.trim()) {
    removeUploadedFile(req.file);
    return res.status(400).json({ error: '名称不能为空' });
  }
  if (!ALLOWED_TYPES.includes(type)) {
    removeUploadedFile(req.file);
    return res.status(400).json({ error: 'type 只允许 app 或 symbol' });
  }

  let filePath = existing.file_path;
  let fileType = existing.file_type;
  if (req.file) {
    // 替换文件时删除旧文件
    removeFileByPath(existing.file_path);
    filePath = `/uploads/${req.file.filename}`;
    fileType = path.extname(req.file.filename).slice(1).toLowerCase();
  }

  const folder_id = req.body.folder_id !== undefined
    ? (req.body.folder_id === '' || req.body.folder_id === 'null' ? null : Number(req.body.folder_id))
    : existing.folder_id;

  db.prepare(
    `UPDATE icons SET name = ?, type = ?, category = ?, tags = ?, file_path = ?, file_type = ?, description = ?, version = ?, folder_id = ?, updated_at = ?
     WHERE id = ?`
  ).run(name.trim(), type, category, tags, filePath, fileType, description, version, folder_id, now(), id);

  const row = db.prepare('SELECT * FROM icons WHERE id = ?').get(id);
  res.json(row);
});

// 批量迁移图标所属文件夹
app.patch('/api/icons/batch/folder', (req, res) => {
  const ids = normalizeIds(req.body.ids);
  if (!ids.length) {
    return res.status(400).json({ error: '请选择要迁移的图标' });
  }

  const folderId = parseOptionalFolderId(req.body.folder_id);
  if (Number.isNaN(folderId)) {
    return res.status(400).json({ error: '文件夹 id 不合法' });
  }

  const placeholders = ids.map(() => '?').join(',');
  const info = db
    .prepare(`UPDATE icons SET folder_id = ?, updated_at = ? WHERE id IN (${placeholders})`)
    .run(folderId, now(), ...ids);

  res.json({ success: true, updated: info.changes });
});

// 批量下载：将选中图标打包为单个 ZIP 返回（文件名用图标名，重名追加序号）
app.post('/api/icons/batch/download', (req, res) => {
  const ids = normalizeIds(req.body.ids);
  if (!ids.length) {
    return res.status(400).json({ error: '请选择要下载的图标' });
  }

  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT name, file_path FROM icons WHERE id IN (${placeholders})`)
    .all(...ids);

  const zip = new AdmZip();
  const usedNames = new Map(); // 基础文件名 -> 已出现次数，用于去重
  let count = 0;

  for (const row of rows) {
    if (!row.file_path) continue;
    const abs = path.join(uploadDir, path.basename(row.file_path));
    if (!fs.existsSync(abs)) continue;

    const ext = path.extname(abs);
    const base = (String(row.name || '').replace(/[\\/:*?"<>|]/g, '_').trim()) || 'icon';
    let fileName = `${base}${ext}`;
    if (usedNames.has(fileName)) {
      const n = usedNames.get(fileName) + 1;
      usedNames.set(fileName, n);
      fileName = `${base}_${n}${ext}`;
    } else {
      usedNames.set(fileName, 1);
    }

    zip.addFile(fileName, fs.readFileSync(abs));
    count += 1;
  }

  if (!count) {
    return res.status(400).json({ error: '选中的图标均无可下载的文件' });
  }

  // 每个条目标记 UTF-8 文件名（通用标志 bit 11）避免中文乱码；
  // 并强制 STORED 存储模式（method=0，不压缩），保证下载即原始文件字节
  for (const entry of zip.getEntries()) {
    entry.header.flags |= 0x800;
    entry.header.method = 0;
  }

  const buffer = zip.toBuffer();
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="icons.zip"; filename*=UTF-8''${encodeURIComponent('图标打包.zip')}`
  );
  res.send(buffer);
});

// 批量删除图标（同时删除磁盘文件）
app.delete('/api/icons/batch', (req, res) => {
  const ids = normalizeIds(req.body.ids);
  if (!ids.length) {
    return res.status(400).json({ error: '请选择要删除的图标' });
  }

  const placeholders = ids.map(() => '?').join(',');
  const result = db.transaction(() => {
    const rows = db.prepare(`SELECT file_path FROM icons WHERE id IN (${placeholders})`).all(...ids);
    const info = db.prepare(`DELETE FROM icons WHERE id IN (${placeholders})`).run(...ids);
    return { rows, deleted: info.changes };
  })();

  for (const row of result.rows) {
    removeFileByPath(row.file_path);
  }

  res.json({ success: true, deleted: result.deleted });
});

// 删除图标（同时删除磁盘文件）
app.delete('/api/icons/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM icons WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: '图标不存在' });
  }
  removeFileByPath(existing.file_path);
  db.prepare('DELETE FROM icons WHERE id = ?').run(id);
  res.json({ success: true });
});

// 已有分类去重列表
app.get('/api/categories', (req, res) => {
  const rows = db
    .prepare("SELECT DISTINCT category FROM icons WHERE category != '' ORDER BY category")
    .all();
  res.json(rows.map((r) => r.category));
});

// 导出全部数据为 JSON
app.get('/api/export', (req, res) => {
  const rows = db.prepare('SELECT * FROM icons ORDER BY id').all();
  const payload = {
    exported_at: now(),
    count: rows.length,
    icons: rows,
  };
  res.setHeader('Content-Disposition', 'attachment; filename="icons-export.json"');
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(payload, null, 2));
});

// 导入 JSON（追加合并，重新生成 id）
app.post('/api/import', (req, res) => {
  const body = req.body || {};
  const icons = Array.isArray(body.icons) ? body.icons : Array.isArray(body) ? body : null;
  if (!icons) {
    return res.status(400).json({ error: '导入格式错误，需包含 icons 数组' });
  }

  const insert = db.prepare(
    `INSERT INTO icons (name, type, category, tags, file_path, file_type, description, version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const importMany = db.transaction((list) => {
    let added = 0;
    for (const item of list) {
      if (!item) continue;
      const name = String(item.name || '').trim();
      if (!name) continue;
      const safeType = ALLOWED_TYPES.includes(item.type) ? item.type : 'app';
      const ts = now();
      insert.run(
        name,
        safeType,
        item.category || '',
        item.tags || '',
        item.file_path || '',
        item.file_type || '',
        item.description || '',
        item.version || '1.0.0',
        item.created_at || ts,
        ts
      );
      added += 1;
    }
    return added;
  });

  const added = importMany(icons);
  res.json({ success: true, added });
});

// 统一错误处理（含 multer 文件类型/大小错误）
app.use((err, req, res, next) => {
  console.error('请求出错:', err.message);
  res.status(400).json({ error: err.message || '服务器内部错误' });
});

const server = app.listen(PORT, () => {
  console.log(`应用 icon 管理端已启动: http://localhost:${PORT}`);
});

module.exports = { app, server };
