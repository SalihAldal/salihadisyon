ALTER TABLE "Company"
ADD COLUMN IF NOT EXISTS "employeeProfilesShadow" boolean DEFAULT false;

ALTER TABLE "Company"
DROP COLUMN IF EXISTS "employeeProfilesShadow";

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "firstName" TEXT,
ADD COLUMN IF NOT EXISTS "lastName" TEXT;

ALTER TABLE "EmployeeProfile"
ADD COLUMN IF NOT EXISTS "companyId" TEXT,
ADD COLUMN IF NOT EXISTS "pinCodeEnc" TEXT,
ADD COLUMN IF NOT EXISTS "restaurantRole" TEXT,
ADD COLUMN IF NOT EXISTS "staffRoleId" TEXT,
ADD COLUMN IF NOT EXISTS "isOwner" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "overtimeEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "dailyFreeDrinkLimit" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "totalBreakMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "EmployeeProfile" ep
SET "companyId" = b."companyId"
FROM "Branch" b
WHERE ep."branchId" = b."id"
  AND ep."companyId" IS NULL;

ALTER TABLE "EmployeeProfile"
ALTER COLUMN "companyId" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'EmployeeProfile_companyId_fkey'
  ) THEN
    ALTER TABLE "EmployeeProfile"
    ADD CONSTRAINT "EmployeeProfile_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'EmployeeProfile_staffRoleId_fkey'
  ) THEN
    ALTER TABLE "EmployeeProfile"
    ADD CONSTRAINT "EmployeeProfile_staffRoleId_fkey"
    FOREIGN KEY ("staffRoleId") REFERENCES "Role"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "EmployeePersonalProfile" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "photo" TEXT,
  "nationality" TEXT,
  "identityNumberEnc" TEXT,
  "identityNumberLast4" TEXT,
  "gender" TEXT,
  "bloodType" TEXT,
  "disabilityStatus" TEXT,
  "educationStatus" TEXT,
  "highestEducationLevel" TEXT,
  "lastEducationSchool" TEXT,
  "maritalStatus" TEXT,
  "childrenCount" INTEGER,
  "birthDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeePersonalProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EmployeeContactProfile" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "address" TEXT,
  "country" TEXT,
  "city" TEXT,
  "district" TEXT,
  "postalCode" TEXT,
  "homePhone" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeContactProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EmployeeFinancialProfile" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "salary" DECIMAL(12,2),
  "salaryPaymentDay" INTEGER,
  "bankName" TEXT,
  "accountType" TEXT,
  "accountNumberEnc" TEXT,
  "accountNumberLast4" TEXT,
  "ibanEnc" TEXT,
  "ibanLast4" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeFinancialProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EmployeeEmergencyContact" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "contactName" TEXT,
  "contactPhone" TEXT,
  "relation" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeEmergencyContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EmployeeStatusLog" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "actionType" TEXT NOT NULL,
  "oldStatus" TEXT,
  "newStatus" TEXT,
  "note" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployeeStatusLog_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'EmployeePersonalProfile_employeeId_fkey'
  ) THEN
    ALTER TABLE "EmployeePersonalProfile"
    ADD CONSTRAINT "EmployeePersonalProfile_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'EmployeeContactProfile_employeeId_fkey'
  ) THEN
    ALTER TABLE "EmployeeContactProfile"
    ADD CONSTRAINT "EmployeeContactProfile_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'EmployeeFinancialProfile_employeeId_fkey'
  ) THEN
    ALTER TABLE "EmployeeFinancialProfile"
    ADD CONSTRAINT "EmployeeFinancialProfile_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'EmployeeEmergencyContact_employeeId_fkey'
  ) THEN
    ALTER TABLE "EmployeeEmergencyContact"
    ADD CONSTRAINT "EmployeeEmergencyContact_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'EmployeeStatusLog_employeeId_fkey'
  ) THEN
    ALTER TABLE "EmployeeStatusLog"
    ADD CONSTRAINT "EmployeeStatusLog_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "EmployeeProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'EmployeeStatusLog_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "EmployeeStatusLog"
    ADD CONSTRAINT "EmployeeStatusLog_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "EmployeePersonalProfile_employeeId_key" ON "EmployeePersonalProfile"("employeeId");
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeContactProfile_employeeId_key" ON "EmployeeContactProfile"("employeeId");
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeFinancialProfile_employeeId_key" ON "EmployeeFinancialProfile"("employeeId");
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeEmergencyContact_employeeId_key" ON "EmployeeEmergencyContact"("employeeId");

CREATE INDEX IF NOT EXISTS "EmployeeProfile_companyId_branchId_isActive_idx" ON "EmployeeProfile"("companyId", "branchId", "isActive");
CREATE INDEX IF NOT EXISTS "EmployeeProfile_staffRoleId_idx" ON "EmployeeProfile"("staffRoleId");
CREATE INDEX IF NOT EXISTS "EmployeePersonalProfile_identityNumberLast4_idx" ON "EmployeePersonalProfile"("identityNumberLast4");
CREATE INDEX IF NOT EXISTS "EmployeeFinancialProfile_salaryPaymentDay_idx" ON "EmployeeFinancialProfile"("salaryPaymentDay");
CREATE INDEX IF NOT EXISTS "EmployeeFinancialProfile_ibanLast4_idx" ON "EmployeeFinancialProfile"("ibanLast4");
CREATE INDEX IF NOT EXISTS "EmployeeStatusLog_employeeId_createdAt_idx" ON "EmployeeStatusLog"("employeeId", "createdAt");
CREATE INDEX IF NOT EXISTS "EmployeeStatusLog_createdByUserId_idx" ON "EmployeeStatusLog"("createdByUserId");

INSERT INTO "EmployeePersonalProfile" (
  "id",
  "employeeId",
  "birthDate",
  "createdAt",
  "updatedAt"
)
SELECT
  'epp_' || md5(ep."id"),
  ep."id",
  ep."birthDate",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "EmployeeProfile" ep
WHERE ep."birthDate" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "EmployeePersonalProfile" epp
    WHERE epp."employeeId" = ep."id"
  );

INSERT INTO "EmployeeFinancialProfile" (
  "id",
  "employeeId",
  "salary",
  "createdAt",
  "updatedAt"
)
SELECT
  'efp_' || md5(ep."id"),
  ep."id",
  ep."salary",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "EmployeeProfile" ep
WHERE ep."salary" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "EmployeeFinancialProfile" efp
    WHERE efp."employeeId" = ep."id"
  );
