import type { FlatDomTree } from './type'

export interface DomTreeArgs {
  doHighlightElements?: boolean
  focusHighlightIndex?: number
  viewportExpansion?: number
  debugMode?: boolean
  interactiveBlacklist?: Element[]
  interactiveWhitelist?: Element[]
  highlightOpacity?: number
  highlightLabelOpacity?: number
}

declare function domTree(args?: DomTreeArgs): FlatDomTree

export default domTree
