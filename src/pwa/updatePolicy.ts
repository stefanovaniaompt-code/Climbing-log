export type AppUpdateContext = {
  visible: boolean
  blockerCount: number
  freshLoad: boolean
}

export function isNewBuild(
  currentBuildId: string,
  remoteBuildId: string,
) {
  const current =
    currentBuildId.trim()

  const remote =
    remoteBuildId.trim()

  return Boolean(
    current &&
    remote &&
    current !== remote,
  )
}

export function canApplyAppUpdate(
  context: AppUpdateContext,
) {
  if (!context.visible) {
    return false
  }

  /*
   * A genuinely fresh page has no unsaved interaction
   * yet. Updating immediately here is safe even if the
   * restored view is an editor.
   */
  if (context.freshLoad) {
    return true
  }

  return (
    context.blockerCount === 0
  )
}
