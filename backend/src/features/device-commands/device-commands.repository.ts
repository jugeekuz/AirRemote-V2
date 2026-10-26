import {
  buttons,
  deviceCommands,
  devices,
  type Database,
  type DeviceCommand,
  type LearnButtonContext,
} from '@airremote/db';
import { and, eq, gt, lte, sql } from 'drizzle-orm';
import { isUniqueViolation } from '../../shared/pg-errors';

/** A command as its owner sees it: overdue pending commands read as expired. */
export type DeviceCommandView = {
  id: string;
  kind: DeviceCommand['kind'];
  status: DeviceCommand['status'];
  errorCode: string | null;
  createdAt: Date;
  expiresAt: Date;
  button: { id: string; remoteId: string; name: string } | null;
};

export type CompleteLearnButtonResult =
  'succeeded' | 'name-taken' | 'not-pending';

export type DeviceCommandsRepository = {
  /**
   * Creates a pending command expiring `ttlMs` after Postgres' `now()`, first
   * marking the device's overdue pending command expired. Returns null when
   * the device already has a live pending command.
   */
  create(input: {
    deviceId: string;
    kind: 'learn_button';
    context: LearnButtonContext;
    ttlMs: number;
  }): Promise<DeviceCommand | null>;
  /** Records the device connection a pending command was sent over. */
  recordConnection(id: string, connectionId: string): Promise<void>;
  /** Fails the device's live pending command. False when there is none. */
  fail(input: {
    id: string;
    deviceId: string;
    errorCode: string;
  }): Promise<boolean>;
  /**
   * Saves the learned button and settles the command, in one transaction.
   * `'name-taken'` when the name was taken meanwhile (the command then fails
   * with `BUTTON_NAME_TAKEN`); `'not-pending'` when the device has no such
   * live pending command.
   */
  completeLearnButton(input: {
    id: string;
    deviceId: string;
    timingsUs: number[];
  }): Promise<CompleteLearnButtonResult>;
  /**
   * Fails the live pending commands sent over a connection that closed.
   * Returns how many it failed.
   */
  failConnection(input: {
    deviceId: string;
    connectionId: string;
    errorCode: string;
  }): Promise<number>;
  /** Finds a command on one of the user's devices. */
  findForUser(id: string, userId: string): Promise<DeviceCommandView | null>;
};

const ONE_PENDING_PER_DEVICE = 'device_commands_one_pending_per_device';
const BUTTON_NAME_KEY = 'buttons_remote_id_name_key';

const now = sql`now()`;

/** The command `id` on `deviceId`, still pending and not yet expired. */
function livePending(id: string, deviceId: string) {
  return and(
    eq(deviceCommands.id, id),
    eq(deviceCommands.deviceId, deviceId),
    eq(deviceCommands.status, 'pending'),
    gt(deviceCommands.expiresAt, now),
  );
}

export function createDeviceCommandsRepository(
  db: Database,
): DeviceCommandsRepository {
  return {
    async create({ deviceId, kind, context, ttlMs }) {
      try {
        return await db.transaction(async (tx) => {
          // A crash between sending and settling never blocks the device for
          // longer than the timeout.
          await tx
            .update(deviceCommands)
            .set({ status: 'expired', finishedAt: now })
            .where(
              and(
                eq(deviceCommands.deviceId, deviceId),
                eq(deviceCommands.status, 'pending'),
                lte(deviceCommands.expiresAt, now),
              ),
            );
          const [command] = await tx
            .insert(deviceCommands)
            .values({
              deviceId,
              kind,
              context,
              expiresAt: sql`now() + ${ttlMs}::integer * interval '1 millisecond'`,
            })
            .returning();
          return command!;
        });
      } catch (error) {
        if (isUniqueViolation(error, ONE_PENDING_PER_DEVICE)) return null;
        throw error;
      }
    },

    async recordConnection(id, connectionId) {
      await db
        .update(deviceCommands)
        .set({ connectionId })
        .where(
          and(eq(deviceCommands.id, id), eq(deviceCommands.status, 'pending')),
        );
    },

    async fail({ id, deviceId, errorCode }) {
      const failed = await db
        .update(deviceCommands)
        .set({ status: 'failed', errorCode, finishedAt: now })
        .where(livePending(id, deviceId))
        .returning({ id: deviceCommands.id });
      return failed.length > 0;
    },

    async completeLearnButton({ id, deviceId, timingsUs }) {
      return db.transaction(async (tx) => {
        const [command] = await tx
          .select()
          .from(deviceCommands)
          .where(
            and(
              livePending(id, deviceId),
              eq(deviceCommands.kind, 'learn_button'),
            ),
          )
          .for('update');
        if (!command) return 'not-pending';
        // Filtered on kind above, so the context is a learn context.
        const context = command.context as LearnButtonContext;

        let buttonId: string;
        try {
          // A savepoint: a name taken meanwhile must not abort the transaction.
          buttonId = await tx.transaction(async (savepoint) => {
            const [button] = await savepoint
              .insert(buttons)
              .values({
                remoteId: context.remoteId,
                name: context.name,
                timingsUs,
              })
              .returning({ id: buttons.id });
            return button!.id;
          });
        } catch (error) {
          if (!isUniqueViolation(error, BUTTON_NAME_KEY)) throw error;
          await tx
            .update(deviceCommands)
            .set({
              status: 'failed',
              errorCode: 'BUTTON_NAME_TAKEN',
              finishedAt: now,
            })
            .where(eq(deviceCommands.id, id));
          return 'name-taken';
        }

        await tx
          .update(deviceCommands)
          .set({ status: 'succeeded', resultId: buttonId, finishedAt: now })
          .where(eq(deviceCommands.id, id));
        return 'succeeded';
      });
    },

    async failConnection({ deviceId, connectionId, errorCode }) {
      const failed = await db
        .update(deviceCommands)
        .set({ status: 'failed', errorCode, finishedAt: now })
        .where(
          and(
            eq(deviceCommands.deviceId, deviceId),
            eq(deviceCommands.connectionId, connectionId),
            eq(deviceCommands.status, 'pending'),
            // An overdue command already reads as expired; leave it so.
            gt(deviceCommands.expiresAt, now),
          ),
        )
        .returning({ id: deviceCommands.id });
      return failed.length;
    },

    async findForUser(id, userId) {
      const [view] = await db
        .select({
          id: deviceCommands.id,
          kind: deviceCommands.kind,
          // Expiry is read, not swept: nothing has to mark it on a timer.
          status: sql<DeviceCommand['status']>`case
            when ${deviceCommands.status} = 'pending'
              and ${deviceCommands.expiresAt} <= now()
            then 'expired'
            else ${deviceCommands.status}::text
          end`,
          errorCode: deviceCommands.errorCode,
          createdAt: deviceCommands.createdAt,
          expiresAt: deviceCommands.expiresAt,
          button: {
            id: buttons.id,
            remoteId: buttons.remoteId,
            name: buttons.name,
          },
        })
        .from(deviceCommands)
        .innerJoin(devices, eq(devices.id, deviceCommands.deviceId))
        .leftJoin(buttons, eq(buttons.id, deviceCommands.resultId))
        .where(and(eq(deviceCommands.id, id), eq(devices.userId, userId)));
      return view ?? null;
    },
  };
}
