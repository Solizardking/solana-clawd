/** tasks barrel — background task manager and related utilities. */
export type { TaskType, TaskManager } from './task-manager.js';

export type { TaskState, BackgroundTaskState } from './types.js';

export type { LocalMainSessionTaskState } from './LocalMainSessionTask.js';
export {
  registerMainSessionTask,
  completeMainSessionTask,
  foregroundMainSessionTask,
  isMainSessionTask,
  startBackgroundSession,
} from './LocalMainSessionTask.js';

export { StopTaskError } from './stopTask.js';

export { getPillLabel } from './pillLabel.js';