-- Keep each participant's deletion boundary independent; preserve the peer's history.
ALTER TABLE "ChatConversation"
ADD COLUMN "firstClearedAt" TIMESTAMP(3),
ADD COLUMN "firstClearedId" TEXT,
ADD COLUMN "secondClearedAt" TIMESTAMP(3),
ADD COLUMN "secondClearedId" TEXT,
ADD COLUMN "firstHidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "secondHidden" BOOLEAN NOT NULL DEFAULT false;
