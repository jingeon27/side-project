-- AlterTable
ALTER TABLE "OAuthAttempt" ADD COLUMN     "appChallenge" TEXT;

-- CreateTable
CREATE TABLE "Like" (
    "submissionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Like_pkey" PRIMARY KEY ("submissionId","userId")
);

-- CreateTable
CREATE TABLE "AppLoginTicket" (
    "codeHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppLoginTicket_pkey" PRIMARY KEY ("codeHash")
);

-- CreateIndex
CREATE INDEX "Like_userId_idx" ON "Like"("userId");

-- CreateIndex
CREATE INDEX "AppLoginTicket_expiresAt_idx" ON "AppLoginTicket"("expiresAt");

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppLoginTicket" ADD CONSTRAINT "AppLoginTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

