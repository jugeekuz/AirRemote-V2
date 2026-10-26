import { z } from 'zod';
import { nameSchema } from '../shared/names.contract';

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

export const createRemoteRequestSchema = z.object({
  name: nameSchema,
  type: remoteTypeSchema,
});

export type CreateRemoteRequest = z.output<typeof createRemoteRequestSchema>;

export const remoteResponseSchema = z.object({
  id: z.uuid(),
  deviceId: z.uuid(),
  name: z.string(),
  type: remoteTypeSchema,
});

export type RemoteResponse = z.infer<typeof remoteResponseSchema>;
