ALTER TABLE "Session" ADD COLUMN "pendingProvider" TEXT;
ALTER TABLE "OAuthAttempt" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'google';
ALTER TABLE "AppLoginTicket" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'google';

CREATE TABLE "SocialIdentity" (
    "provider" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "SocialIdentity_pkey" PRIMARY KEY ("provider", "subject"),
    CONSTRAINT "SocialIdentity_provider_check" CHECK ("provider" IN ('google', 'x', 'kakao', 'discord')),
    CONSTRAINT "SocialIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SocialIdentity_userId_provider_key" ON "SocialIdentity"("userId", "provider");
INSERT INTO "SocialIdentity" ("provider", "subject", "userId")
SELECT 'google', "googleSubject", "id" FROM "User" WHERE "googleSubject" IS NOT NULL;
UPDATE "Session" SET "pendingProvider" = 'google' WHERE "pendingSubject" IS NOT NULL;
