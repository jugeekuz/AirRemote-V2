import { z } from 'zod';
import { buttonResponseSchema } from '../buttons/buttons.contract';
import { errorCodeSchema } from '../errors/errors.contract';

export const DEVICE_COMMAND_KINDS = ['learn_button', 'send_ir'] as const;

export const DEVICE_COMMAND_STATUSES = [
  'pending',
  'succeeded',
  'failed',
  'expired',
] as const;

export const deviceCommandKindSchema = z.enum(DEVICE_COMMAND_KINDS);
export const deviceCommandStatusSchema = z.enum(DEVICE_COMMAND_STATUSES);

export type DeviceCommandKind = z.infer<typeof deviceCommandKindSchema>;
export type DeviceCommandStatus = z.infer<typeof deviceCommandStatusSchema>;

export const deviceCommandResponseSchema = z.object({
  id: z.uuid(),
  kind: deviceCommandKindSchema,
  status: deviceCommandStatusSchema,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  error: z.object({ code: errorCodeSchema, message: z.string() }).optional(),
  button: buttonResponseSchema.optional(),
});

export type DeviceCommandResponse = z.infer<typeof deviceCommandResponseSchema>;
