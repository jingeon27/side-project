ALTER TABLE "OAuthAttempt" ADD COLUMN "appChallenge" TEXT;
CREATE TABLE "AppLoginTicket" (
  "codeHash" TEXT NOT NULL PRIMARY KEY,
  "challenge" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "AppLoginTicket_expiresAt_idx" ON "AppLoginTicket"("expiresAt");
