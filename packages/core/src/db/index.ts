export {
  closeDatabase,
  getDatabase,
  initDatabase,
} from './connection.js';
export { runMigrations } from './migrations.js';

export {
  createLoop,
  updateLoop,
  failLoop,
  getLoopDetail,
  getRecentLoops,
  createLoopTurn,
  updateLoopTurn,
  getLoopTurns,
  getBestModelForFeatureType,
  saveTicket,
  getTicket,
  logNotification,
  getNotificationLog,
} from './queries/index.js';
