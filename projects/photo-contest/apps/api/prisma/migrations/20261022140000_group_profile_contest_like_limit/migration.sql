-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "avatarId" TEXT,
ADD COLUMN     "description" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Contest" ADD COLUMN     "likeLimit" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "GroupAvatar" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupAvatar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupAvatar_storageKey_key" ON "GroupAvatar"("storageKey");

-- CreateIndex
CREATE INDEX "GroupAvatar_expiresAt_idx" ON "GroupAvatar"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "GroupAvatar_id_groupId_key" ON "GroupAvatar"("id", "groupId");

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_avatarId_id_fkey" FOREIGN KEY ("avatarId", "id") REFERENCES "GroupAvatar"("id", "groupId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "GroupAvatar" ADD CONSTRAINT "GroupAvatar_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

