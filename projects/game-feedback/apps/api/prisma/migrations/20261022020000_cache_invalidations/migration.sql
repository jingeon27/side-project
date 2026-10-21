CREATE TABLE "CacheInvalidation" (
  "tag" TEXT NOT NULL,
  "revision" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CacheInvalidation_pkey" PRIMARY KEY ("tag")
);

CREATE INDEX "CacheInvalidation_updatedAt_tag_idx" ON "CacheInvalidation"("updatedAt", "tag");
