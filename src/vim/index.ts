/** vim barrel — motions, operators, text objects, transitions, and types. */
export { resolveMotion } from './motions.js';

export type { OperatorContext } from './operators.js';
export {
  executeIndent,
  executeJoin,
  executeLineOp,
  executeOpenLine,
  executeOperatorFind,
  executeOperatorG,
  executeOperatorGg,
  executeOperatorMotion,
  executeOperatorTextObj,
  executePaste,
  executeReplace,
  executeToggleCase,
  executeX,
} from './operators.js';

export { findTextObject } from './textObjects.js';
export type { TextObjectRange } from './textObjects.js';

export type {
  CommandState,
  VimState,
  RecordedChange,
  FindType,
} from './types.js';
export { FIND_KEYS, isOperatorKey, isTextObjScopeKey } from './types.js';

export type { TransitionContext, TransitionResult } from './transitions.js';
export { transition } from './transitions.js';