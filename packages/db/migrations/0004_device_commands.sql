CREATE TYPE "public"."device_command_kind" AS ENUM('learn_button');--> statement-breakpoint
CREATE TYPE "public"."device_command_status" AS ENUM('pending', 'succeeded', 'failed', 'expired');--> statement-breakpoint
CREATE TABLE "device_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"kind" "device_command_kind" NOT NULL,
	"context" jsonb NOT NULL,
	"status" "device_command_status" DEFAULT 'pending' NOT NULL,
	"error_code" text,
	"result_id" uuid,
	"connection_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "device_commands_finished_check" CHECK (("device_commands"."status" = 'pending') = ("device_commands"."finished_at" IS NULL)),
	CONSTRAINT "device_commands_error_check" CHECK (("device_commands"."status" = 'failed') = ("device_commands"."error_code" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "device_commands" ADD CONSTRAINT "device_commands_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_commands_one_pending_per_device" ON "device_commands" USING btree ("device_id") WHERE "device_commands"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "device_commands_connection_id_idx" ON "device_commands" USING btree ("connection_id") WHERE "device_commands"."status" = 'pending';