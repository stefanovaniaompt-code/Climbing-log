import {
  useEffect,
} from 'react'

import {
  setUpdateBlocker,
} from './updateSafety'

export function useUpdateBlocker(
  id: string,
  blocked: boolean,
) {
  useEffect(
    () => {
      setUpdateBlocker(
        id,
        blocked,
      )

      return () => {
        setUpdateBlocker(
          id,
          false,
        )
      }
    },
    [
      id,
      blocked,
    ],
  )
}
