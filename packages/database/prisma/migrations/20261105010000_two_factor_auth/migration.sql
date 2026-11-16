ALTER TABLE "User"
ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "twoFactorSecret" TEXT;

ALTER TABLE "Session"
ADD COLUMN "mfaVerified" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "TwoFactorChallenge" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "setupSecret" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TwoFactorChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TwoFactorChallenge_tokenHash_key" ON "TwoFactorChallenge"("tokenHash");
CREATE INDEX "TwoFactorChallenge_userId_idx" ON "TwoFactorChallenge"("userId");
CREATE INDEX "TwoFactorChallenge_expiresAt_idx" ON "TwoFactorChallenge"("expiresAt");

ALTER TABLE "TwoFactorChallenge"
ADD CONSTRAINT "TwoFactorChallenge_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
