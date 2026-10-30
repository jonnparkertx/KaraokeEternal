-- Up
ALTER TABLE "media" ADD COLUMN "isCorruptedCdg" INTEGER(1) NOT NULL DEFAULT 0;

-- Down
ALTER TABLE "media" DROP COLUMN "isCorruptedCdg";
