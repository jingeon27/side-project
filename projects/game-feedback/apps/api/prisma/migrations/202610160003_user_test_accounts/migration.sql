-- Service-managed verification is separate from Supercell account ownership.
ALTER TABLE "User" ADD COLUMN "isVerified" BOOLEAN NOT NULL DEFAULT false,
                   ADD COLUMN "verifiedAt" TIMESTAMP(3),
                   ADD COLUMN "supercellTag" TEXT;
-- Initialize only the previously shipped synthetic fixtures; real users keep false/null defaults.
UPDATE "User" SET "isVerified" = true, "verifiedAt" = CURRENT_TIMESTAMP,
  "supercellTag" = COALESCE("supercellTag", '#9QY')
  WHERE "id" = 'sample-user-3' AND "demoKey" = 'sample:3';
UPDATE "User" SET "supercellTag" = COALESCE("supercellTag", '#2PP')
  WHERE "id" = 'sample-user-0' AND "demoKey" = 'sample:0';
