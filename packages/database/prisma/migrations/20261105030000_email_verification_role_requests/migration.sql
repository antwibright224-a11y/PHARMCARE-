ALTER TABLE "User"
ADD COLUMN "requestedRole" "Role";

ALTER TABLE "TwoFactorChallenge"
ADD COLUMN "emailCodeHash" TEXT;
