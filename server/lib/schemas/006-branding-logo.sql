-- Up
CREATE TABLE IF NOT EXISTS "branding" (
  "key" text PRIMARY KEY NOT NULL,
  "image" blob,
  "dateUpdated" integer NOT NULL DEFAULT(0)
);

-- Down
DROP TABLE IF EXISTS "branding";
