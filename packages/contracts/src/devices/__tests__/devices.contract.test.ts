import { describe, expect, it } from 'vitest';
import { errorCodeSchema } from '../../errors/errors.contract';
import {
  deviceListResponseSchema,
  enrollDeviceRequestSchema,
  normalisePairingCode,
  pairingCodeResponseSchema,
} from '../devices.contract';

const valid = {
  macAddress: 'AA:BB:CC:DD:EE:01',
  pairingCode: '7K4MQ9TX',
  name: 'Living room',
};

describe('normalisePairingCode', () => {
  it.each([
    ['7k4m-q9tx', '7K4MQ9TX'],
    [' 7K4M Q9TX ', '7K4MQ9TX'],
    ['o1il-0000', '01110000'],
  ])('turns %j into %j', (input, expected) => {
    expect(normalisePairingCode(input)).toBe(expected);
  });
});

describe('enrollDeviceRequestSchema', () => {
  it('normalises the code and trims the name', () => {
    expect(
      enrollDeviceRequestSchema.parse({
        macAddress: 'AA:BB:CC:DD:EE:01',
        pairingCode: '7k4m-q9tx',
        name: '  Living room ',
      }),
    ).toEqual(valid);
  });

  it.each(['aa-bb-cc-dd-ee-01', 'aabbccddee01', 'AA:BB:CC:DD:EE'])(
    'rejects the MAC address %j',
    (macAddress) => {
      expect(
        enrollDeviceRequestSchema.safeParse({ ...valid, macAddress }).success,
      ).toBe(false);
    },
  );

  it.each(['7K4MQ9T', '7K4MQ9TXX', '7K4MQ9TU', '7K4MQ9T!'])(
    'rejects the pairing code %j',
    (pairingCode) => {
      expect(
        enrollDeviceRequestSchema.safeParse({ ...valid, pairingCode }).success,
      ).toBe(false);
    },
  );

  it.each(['', '   ', 'a'.repeat(101)])('rejects the name %j', (name) => {
    expect(
      enrollDeviceRequestSchema.safeParse({ ...valid, name }).success,
    ).toBe(false);
  });

  it.each(['macAddress', 'pairingCode', 'name'] as const)(
    'rejects a request without %s',
    (field) => {
      const body: Partial<typeof valid> = { ...valid };
      delete body[field];
      expect(enrollDeviceRequestSchema.safeParse(body).success).toBe(false);
    },
  );
});

describe('pairingCodeResponseSchema', () => {
  it('accepts an issued code', () => {
    const body = {
      pairingCode: '7K4MQ9TX',
      expiresAt: '2026-10-26T12:15:00.000Z',
    };
    expect(pairingCodeResponseSchema.parse(body)).toEqual(body);
  });

  it('rejects a code that is not in its issued form', () => {
    expect(
      pairingCodeResponseSchema.safeParse({
        pairingCode: '7k4mq9tx',
        expiresAt: '2026-10-26T12:15:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('enrollment error codes', () => {
  it.each([
    'UNAUTHORIZED',
    'INVALID_PAIRING_CODE',
    'DEVICE_ALREADY_REGISTERED',
    'INVALID_DEVICE_CERTIFICATE',
  ])('includes %s', (code) => {
    expect(errorCodeSchema.options).toContain(code);
  });
});

describe('deviceListResponseSchema', () => {
  const item = {
    id: '5d1c2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
    macAddress: 'AA:BB:CC:DD:EE:01',
    name: 'Hall',
    online: true,
  };

  it('accepts an empty list and a list of items', () => {
    expect(deviceListResponseSchema.parse([])).toEqual([]);
    expect(deviceListResponseSchema.parse([item])).toEqual([item]);
  });

  it('requires the online flag to be a boolean', () => {
    const withoutOnline = {
      id: item.id,
      macAddress: item.macAddress,
      name: item.name,
    };
    expect(deviceListResponseSchema.safeParse([withoutOnline]).success).toBe(
      false,
    );
    expect(
      deviceListResponseSchema.safeParse([{ ...item, online: 'yes' }]).success,
    ).toBe(false);
  });

  it('rejects an invalid item', () => {
    expect(deviceListResponseSchema.safeParse([{ id: '1' }]).success).toBe(
      false,
    );
  });
});
