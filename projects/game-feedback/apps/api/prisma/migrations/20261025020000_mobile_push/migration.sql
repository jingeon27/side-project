CREATE TABLE "PushDevice" (
  "id" TEXT NOT NULL, "token" TEXT NOT NULL, "userId" TEXT NOT NULL, "sessionKey" TEXT NOT NULL,
  "platform" TEXT NOT NULL, "locale" TEXT NOT NULL DEFAULT 'ko', "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PushDevice_platform_check" CHECK ("platform" IN ('ios', 'android')),
  CONSTRAINT "PushDevice_locale_check" CHECK ("locale" IN ('ko', 'en', 'ja'))
);
CREATE UNIQUE INDEX "PushDevice_token_key" ON "PushDevice"("token");
CREATE INDEX "PushDevice_userId_enabled_idx" ON "PushDevice"("userId", "enabled");
CREATE INDEX "PushDevice_sessionKey_idx" ON "PushDevice"("sessionKey");
ALTER TABLE "PushDevice" ADD CONSTRAINT "PushDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PushDevice" ADD CONSTRAINT "PushDevice_sessionKey_fkey" FOREIGN KEY ("sessionKey") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "PushDelivery" (
  "id" TEXT NOT NULL, "deviceId" TEXT NOT NULL, "eventId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3), "leaseToken" TEXT, "ticketId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PushDelivery_status_check" CHECK ("status" IN ('PENDING', 'TICKET', 'DELIVERED', 'FAILED', 'CANCELLED'))
);
CREATE UNIQUE INDEX "PushDelivery_deviceId_eventId_key" ON "PushDelivery"("deviceId", "eventId");
CREATE INDEX "PushDelivery_status_nextAttemptAt_leaseUntil_idx" ON "PushDelivery"("status", "nextAttemptAt", "leaseUntil");
CREATE INDEX "PushDelivery_createdAt_idx" ON "PushDelivery"("createdAt");
ALTER TABLE "PushDelivery" ADD CONSTRAINT "PushDelivery_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "PushDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
