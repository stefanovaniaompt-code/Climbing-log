import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  remoteItemRpcPayload,
} from './remoteTestRepository'

import type {
  RemoteTestItem,
} from './remoteTestRunner'

const item:
  RemoteTestItem = {
    item: {
      id:
        'item-1',

      testSessionId:
        'session-1',

      itemOrder:
        1,

      protocolKey:
        'pullup_1rm',

      protocolVersion:
        '1.0',

      side:
        null,

      grip:
        'barra',

      source:
        'manual',

      config:
        {},

      status:
        'completed',
    },

    values: [
      {
        metricKey:
          'external_load',

        metricLabel:
          'Carico esterno',

        value:
          32.5,

        unit:
          'kg',
      },
    ],

    notes:
      'Tecnica regolare.',

    completedAt:
      '2026-12-13T09:15:00.000Z',
  }

describe(
  'remote test repository',
  () => {
    it(
      'serializes the complete athlete draft state for the RPC',
      () => {
        expect(
          remoteItemRpcPayload(
            item,
          ),
        ).toEqual({
          p_item_id:
            'item-1',

          p_values: [
            {
              metricKey:
                'external_load',

              metricLabel:
                'Carico esterno',

              value:
                32.5,

              unit:
                'kg',
            },
          ],

          p_notes:
            'Tecnica regolare.',

          p_status:
            'completed',

          p_completed_at:
            '2026-12-13T09:15:00.000Z',
        })
      },
    )
  },
)
