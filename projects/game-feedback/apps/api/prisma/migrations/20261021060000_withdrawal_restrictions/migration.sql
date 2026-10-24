ALTER TABLE "User" ADD COLUMN "withdrawnAt" TIMESTAMP(3);

CREATE TABLE "RetainedIdentityRestriction" (
    "identityHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "RetainedIdentityRestriction_pkey" PRIMARY KEY ("identityHash")
);

CREATE INDEX "RetainedIdentityRestriction_userId_idx" ON "RetainedIdentityRestriction"("userId");

ALTER TABLE "RetainedIdentityRestriction" ADD CONSTRAINT "RetainedIdentityRestriction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
