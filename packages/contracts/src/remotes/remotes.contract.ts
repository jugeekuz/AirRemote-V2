import { z } from 'zod';

/** What kind of appliance a remote controls. The database's `remote_type` enum is built from this list. */
export const REMOTE_TYPES = [
  'air_conditioner',
  'audio_system',
  'dehumidifier',
  'heater',
  'rgb_lights',
  'smart_tv',
  'generic_device',
] as const;

export const remoteTypeSchema = z.enum(REMOTE_TYPES);

export type RemoteType = z.infer<typeof remoteTypeSchema>;
