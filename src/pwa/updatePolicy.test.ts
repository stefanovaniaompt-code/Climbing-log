import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  canApplyAppUpdate,
  isNewBuild,
} from './updatePolicy'

describe(
  'PWA update policy',
  () => {
    it(
      'detects a different deployment build',
      () => {
        expect(
          isNewBuild(
            'build-a',
            'build-b',
          ),
        ).toBe(true)

        expect(
          isNewBuild(
            'build-a',
            'build-a',
          ),
        ).toBe(false)
      },
    )

    it(
      'never reloads while the app is hidden',
      () => {
        expect(
          canApplyAppUpdate({
            visible:
              false,

            blockerCount:
              0,

            freshLoad:
              false,
          }),
        ).toBe(false)

        expect(
          canApplyAppUpdate({
            visible:
              false,

            blockerCount:
              0,

            freshLoad:
              true,
          }),
        ).toBe(false)
      },
    )

    it(
      'defers an update while an interactive screen is active',
      () => {
        expect(
          canApplyAppUpdate({
            visible:
              true,

            blockerCount:
              1,

            freshLoad:
              false,
          }),
        ).toBe(false)
      },
    )

    it(
      'applies a pending update at a safe point',
      () => {
        expect(
          canApplyAppUpdate({
            visible:
              true,

            blockerCount:
              0,

            freshLoad:
              false,
          }),
        ).toBe(true)
      },
    )

    it(
      'allows immediate update on a genuinely fresh launch',
      () => {
        expect(
          canApplyAppUpdate({
            visible:
              true,

            blockerCount:
              2,

            freshLoad:
              true,
          }),
        ).toBe(true)
      },
    )
  },
)
