const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  generateOptionalFieldOverrides,
  generatePaymentAuthorityCodeValue,
  generateReferralNumber,
  modifyContent,
  validatePaymentAuthorityCode,
} = require("../electron/backend/contentEditor");
const { summarizeUploadProfiles } = require("../electron/backend/uploader");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ccrs-smoke-"));
let failures = 0;

function test(name, callback) {
  try {
    callback();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}`);
    console.error(`  ${error.message}`);
  }
}

function writeJsonFixture(fileName, data) {
  const filePath = path.join(tempRoot, fileName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

test("Payment Authority Code accepts up to 5 digits", () => {
  assert.equal(validatePaymentAuthorityCode("99999"), "99999");
  assert.equal(validatePaymentAuthorityCode("12-345"), "12345");
  assert.throws(
    () => validatePaymentAuthorityCode("100000"),
    /Payment Authority Code must be a whole number between 0 and 99999/
  );
});

test("Payment Authority Code generation increments and stops at 99999", () => {
  assert.equal(generatePaymentAuthorityCodeValue("12345", 3), "12347");
  assert.equal(generatePaymentAuthorityCodeValue("", 1), "10000");
  assert.throws(
    () => generatePaymentAuthorityCodeValue("99999", 2),
    /Payment Authority Code range exceeded/
  );
});

test("Optional override normalization keeps the validated Payment Authority Code", () => {
  const overrides = generateOptionalFieldOverrides({
    StationID: "ab1",
    PaymentAuthorityCode: "54321",
  });

  assert.equal(overrides.PaymentAuthorityCode, "54321");
  assert.equal(overrides.StationID.length, 5);
  assert.match(overrides.StationID, /^[A-Za-z0-9]{5}$/);
});

test("Referral number generation preserves the VA prefix and increments", () => {
  assert.equal(generateReferralNumber("123", 1), "VA0000000123");
  assert.equal(generateReferralNumber("123", 2), "VA0000000124");
  assert.equal(generateReferralNumber("ABC123", 2), "VA0000ABC124");
});

test("modifyContent applies Payment Authority Code overrides uniquely across referrals", () => {
  const filePath = writeJsonFixture("override-referrals.json", {
    ListDate: "2026-01-01 00:00:00",
    Referrals: [
      {
        ReferralNumber: "VA0000000001",
        PaymentAuthorityCode: "12000",
        ICN: "1",
        FirstName: "John",
        LastName: "Doe",
        SSN: "111-11-1111",
      },
      {
        ReferralNumber: "VA0000000002",
        PaymentAuthorityCode: "12000",
        ICN: "2",
        FirstName: "Jane",
        LastName: "Doe",
        SSN: "222-22-2222",
      },
    ],
  });

  const result = modifyContent(
    filePath,
    "200",
    "2026-03-26 11:30:00",
    "999-99-0001",
    1,
    1,
    { PaymentAuthorityCode: "55550" },
    1
  );
  const parsed = JSON.parse(result.content);

  assert.deepEqual(
    parsed.Referrals.map((item) => item.PaymentAuthorityCode),
    ["55550", "55551"]
  );
  assert.deepEqual(
    parsed.Referrals.map((item) => item.ReferralNumber),
    ["VA0000000200", "VA0000000201"]
  );
  assert.equal(parsed.ListDate, "2026-03-26 11:30:00");
});

test("modifyContent rejects source files with oversized Payment Authority Code values", () => {
  const filePath = writeJsonFixture("invalid-payment-authority-code.json", {
    Referrals: [
      {
        ReferralNumber: "VA0000000001",
        PaymentAuthorityCode: "123456",
        ICN: "1",
        FirstName: "John",
        LastName: "Doe",
        SSN: "111-11-1111",
      },
    ],
  });

  assert.throws(
    () => modifyContent(filePath, "", null, "999-99-0001", 1, 1, {}, 1),
    /Payment Authority Code must be a whole number between 0 and 99999/
  );
});

test("Upload profile summary reports server and user counts", () => {
  const summary = summarizeUploadProfiles({
    servers: [{ name: "DEV" }, { name: "SQA" }],
    users: [{ name: "devuser" }, { name: "sqauser" }, { name: "extrauser" }],
  });

  assert.deepEqual(summary, {
    serverCount: 2,
    userCount: 3,
    targetNames: ["DEV", "SQA"],
  });
});

fs.rmSync(tempRoot, { recursive: true, force: true });

if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log("Smoke tests passed.");
}
