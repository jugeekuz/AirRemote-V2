CREATE TABLE "pairing_codes" (
	"mac_address" "macaddr" PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
