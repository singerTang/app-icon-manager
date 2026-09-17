// 作者：singerTang。回收站状态与文件清理，供接口和定时任务共用。
const fs = require('fs');
const path = require('path');

module.exports = function createTrash(db, uploadDir) {
  const retentionDays = () => Number(db.prepare("SELECT value FROM app_settings WHERE key = 'trash_retention_days'").get().value);
  const count = () => db.prepare('SELECT COUNT(*) AS n FROM icons WHERE deleted_at IS NOT NULL').get().n;
  const placeholders = (ids) => ids.map(() => '?').join(',');

  function move(ids) {
    return db.transaction(() => {
      const deletedAt = new Date().toISOString();
      const purgeAfter = new Date(Date.now() + retentionDays() * 86400000).toISOString();
      const folders = new Map(db.prepare('SELECT * FROM folders').all().map((folder) => [folder.id, folder]));
      const rows = db.prepare(`SELECT * FROM icons WHERE deleted_at IS NULL AND id IN (${placeholders(ids)})`).all(...ids);
      const update = db.prepare('UPDATE icons SET deleted_at = ?, purge_after = ?, deleted_folder_path = ?, deleted_category = ? WHERE id = ?');
      for (const row of rows) {
        const names = [];
        const visited = new Set();
        let folder = folders.get(row.folder_id);
        while (folder && !visited.has(folder.id)) {
          visited.add(folder.id);
          names.unshift(folder.name);
          folder = folders.get(folder.parent_id);
        }
        update.run(deletedAt, purgeAfter, names.join(' / '), row.category, row.id);
      }
      return rows.length;
    })();
  }

  function restore(ids) {
    return db.transaction(() => {
      const rows = db.prepare(`SELECT * FROM icons WHERE deleted_at IS NOT NULL AND id IN (${placeholders(ids)})`).all(...ids);
      let adjusted = 0;
      const update = db.prepare(`UPDATE icons SET folder_id = ?, category = ?, deleted_at = NULL, purge_after = NULL,
        deleted_folder_path = NULL, deleted_category = NULL WHERE id = ?`);
      for (const row of rows) {
        const folder = row.folder_id != null && db.prepare('SELECT 1 FROM folders WHERE id = ?').get(row.folder_id) ? row.folder_id : null;
        const category = row.category && db.prepare('SELECT 1 FROM categories WHERE name = ?').get(row.category) ? row.category : '';
        if (folder !== row.folder_id || category !== (row.category || '')) adjusted++;
        update.run(folder, category, row.id);
      }
      return { restored: rows.map((row) => row.id), adjusted };
    })();
  }

  function purge(ids) {
    const deleted = [];
    const failed = [];
    // 每条独立处理，文件删除失败时保留记录，后续可重试。
    const remove = db.transaction((id) => {
      const row = db.prepare('SELECT * FROM icons WHERE id = ? AND deleted_at IS NOT NULL').get(id);
      if (!row) return false;
      if (row.file_path) {
        const shared = db.prepare('SELECT 1 FROM icons WHERE file_path = ? AND id != ?').get(row.file_path, id);
        if (!shared) {
          if (!/^\/uploads\/[^/\\]+$/.test(row.file_path) || ['.', '..'].includes(path.basename(row.file_path))) {
            throw new Error('图片路径无效');
          }
          try { fs.unlinkSync(path.join(uploadDir, path.basename(row.file_path))); }
          catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
      }
      db.prepare('DELETE FROM icons WHERE id = ?').run(id);
      return true;
    });
    for (const id of ids) {
      try { if (remove(id)) deleted.push(id); }
      catch (error) {
        failed.push(id);
        console.warn('回收站清理失败，图标 ID：', id, error.message);
      }
    }
    return { deleted, failed };
  }

  function cleanup() {
    const expired = db.prepare('SELECT id FROM icons WHERE deleted_at IS NOT NULL AND purge_after <= ?').all(new Date().toISOString());
    return purge(expired.map((row) => row.id));
  }

  return { retentionDays, count, move, restore, purge, cleanup };
};
