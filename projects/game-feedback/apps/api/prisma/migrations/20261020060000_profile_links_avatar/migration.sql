ALTER TABLE "User" ADD COLUMN "profileLinks" JSONB NOT NULL DEFAULT '[]';
CREATE TABLE "UserAvatar" (
  "userId" TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "bytes" BYTEA,
  "objectId" TEXT,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  CONSTRAINT "UserAvatar_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "UserAvatar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserAvatar_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "MediaObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "UserAvatar_storage_check" CHECK (("bytes" IS NOT NULL) <> ("objectId" IS NOT NULL)),
  CONSTRAINT "UserAvatar_size_check" CHECK ("size" > 0 AND "size" <= 5242880)
);
CREATE UNIQUE INDEX "UserAvatar_id_key" ON "UserAvatar"("id");
CREATE UNIQUE INDEX "UserAvatar_objectId_key" ON "UserAvatar"("objectId");
