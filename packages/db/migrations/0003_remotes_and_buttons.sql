CREATE TYPE "public"."remote_type" AS ENUM('air_conditioner', 'audio_system', 'dehumidifier', 'heater', 'rgb_lights', 'smart_tv', 'generic_device');--> statement-breakpoint
CREATE TABLE "buttons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"remote_id" uuid NOT NULL,
	"name" text NOT NULL,
	"timings_us" integer[] NOT NULL,
	CONSTRAINT "buttons_name_check" CHECK (char_length("buttons"."name") BETWEEN 1 AND 100 AND "buttons"."name" !~ '^\s' AND "buttons"."name" !~ '\s$'),
	CONSTRAINT "buttons_timings_us_shape_check" CHECK (array_ndims("buttons"."timings_us") = 1 AND cardinality("buttons"."timings_us") BETWEEN 1 AND 2048 AND array_position("buttons"."timings_us", NULL) IS NULL),
	CONSTRAINT "buttons_timings_us_range_check" CHECK (0 <= ALL("buttons"."timings_us") AND 65535 >= ALL("buttons"."timings_us"))
);
--> statement-breakpoint
DROP INDEX "remotes_device_id_idx";--> statement-breakpoint
-- Hand-edited (a data change): existing remotes get generic_device before type becomes required.
ALTER TABLE "remotes" ADD COLUMN "type" "remote_type";--> statement-breakpoint
UPDATE "remotes" SET "type" = 'generic_device';--> statement-breakpoint
ALTER TABLE "remotes" ALTER COLUMN "type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "buttons" ADD CONSTRAINT "buttons_remote_id_remotes_id_fk" FOREIGN KEY ("remote_id") REFERENCES "public"."remotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "buttons_remote_id_name_key" ON "buttons" USING btree ("remote_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "remotes_device_id_name_key" ON "remotes" USING btree ("device_id",lower("name"));--> statement-breakpoint
ALTER TABLE "remotes" ADD CONSTRAINT "remotes_name_check" CHECK (char_length("remotes"."name") BETWEEN 1 AND 100 AND "remotes"."name" !~ '^\s' AND "remotes"."name" !~ '\s$');