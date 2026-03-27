const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  ICN_MODES,
  generateOptionalFieldOverrides,
  generatePaymentAuthorityCodeValue,
  generateReferralNumber,
  modifyContent,
  prepareIcnSettings,
  validatePaymentAuthorityCode,
} = require("../electron/backend/contentEditor");
const backend = require("../electron/backend");
const { summarizeUploadProfiles } = require("../electron/backend/uploader");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ccrs-smoke-"));
let failures = 0;
const tests = [];

function test(name, callback) {
  tests.push({ name, callback });
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

test("Optional date overrides reject invalid formats", () => {
  assert.throws(
    () => generateOptionalFieldOverrides({ DOB: "03/26/2026" }),
    /DOB must use the format YYYY-MM-DD/
  );
  assert.throws(
    () => generateOptionalFieldOverrides({ ReferralDateTime: "2026-03-26T11:30:00" }),
    /Referral DateTime must use the format YYYY-MM-DD HH:mm:ss/
  );
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

test("modifyContent keeps TEST and generates unique ICNs by default", () => {
  const filePath = writeJsonFixture("default-icn.json", {
    Referrals: [
      {
        ReferralNumber: "VA0000000001",
        ICN: "1",
        FirstName: "John",
        LastName: "Doe",
        SSN: "111-11-1111",
      },
      {
        ReferralNumber: "VA0000000002",
        ICN: "2",
        FirstName: "Jane",
        LastName: "Doe",
        SSN: "222-22-2222",
      },
    ],
  });

  const result = modifyContent(filePath, "", null, "999-99-0001", 1, 1, {}, 1);
  const parsed = JSON.parse(result.content);

  assert.match(parsed.Referrals[0].ICN, /^TEST\d{13}$/);
  assert.match(parsed.Referrals[1].ICN, /^TEST\d{13}$/);
  assert.notEqual(parsed.Referrals[0].ICN, parsed.Referrals[1].ICN);
});

test("modifyContent supports a custom suffix after TEST", () => {
  const filePath = writeJsonFixture("custom-test-icn.json", {
    Referrals: [
      {
        ReferralNumber: "VA0000000001",
        ICN: "1",
        FirstName: "John",
        LastName: "Doe",
        SSN: "111-11-1111",
      },
      {
        ReferralNumber: "VA0000000002",
        ICN: "2",
        FirstName: "Jane",
        LastName: "Doe",
        SSN: "222-22-2222",
      },
    ],
  });

  const result = modifyContent(
    filePath,
    "",
    null,
    "999-99-0001",
    1,
    1,
    {},
    1,
    prepareIcnSettings({ mode: ICN_MODES.TEST_CUSTOM_SUFFIX, value: "AB12" }),
    1
  );
  const parsed = JSON.parse(result.content);

  assert.match(parsed.Referrals[0].ICN, /^TESTAB12[A-Z0-9]{9}$/);
  assert.match(parsed.Referrals[1].ICN, /^TESTAB12[A-Z0-9]{9}$/);
  assert.notEqual(parsed.Referrals[0].ICN, parsed.Referrals[1].ICN);
});

test("modifyContent supports a fully custom ICN base", () => {
  const filePath = writeJsonFixture("custom-full-icn.json", {
    Referrals: [
      {
        ReferralNumber: "VA0000000001",
        ICN: "1",
        FirstName: "John",
        LastName: "Doe",
        SSN: "111-11-1111",
      },
      {
        ReferralNumber: "VA0000000002",
        ICN: "2",
        FirstName: "Jane",
        LastName: "Doe",
        SSN: "222-22-2222",
      },
    ],
  });

  const result = modifyContent(
    filePath,
    "",
    null,
    "999-99-0001",
    1,
    1,
    {},
    1,
    prepareIcnSettings({ mode: ICN_MODES.CUSTOM_FULL, value: "AB12" }),
    1
  );
  const parsed = JSON.parse(result.content);

  assert.match(parsed.Referrals[0].ICN, /^AB12[A-Z0-9]{13}$/);
  assert.equal(parsed.Referrals[0].ICN.length, 17);
  assert.equal(parsed.Referrals[1].ICN.length, 17);
  assert.notEqual(parsed.Referrals[0].ICN, parsed.Referrals[1].ICN);
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

test("Preview validation reports field-level errors without throwing", async () => {
  const preview = await backend.handleCommand("preview", {
    referralReplacementCode: "123",
    icnSettings: {
      mode: ICN_MODES.TEST_CUSTOM_SUFFIX,
      value: "",
    },
    ssnValue: "9999990001",
    optionalOverrides: {
      DOB: "2026/03/26",
      PaymentAuthorityCode: "100000",
    },
    fileCount: 0,
    referralsPerFile: 0,
    upload: {
      enabled: true,
      targets: [{ server_name: "DEV", user_name: "", remote_directory: "" }],
    },
  });

  assert.equal(preview.fieldErrors.ssnValue, "SSN must use the format 999-99-0001.");
  assert.equal(preview.fieldErrors.icnValue, "Enter up to 13 letters or numbers after TEST.");
  assert.equal(preview.fieldErrors.PaymentAuthorityCode, "Payment Authority Code must be a whole number between 0 and 99999.");
  assert.equal(preview.fieldErrors.DOB, "DOB must use the format YYYY-MM-DD.");
  assert.equal(preview.fieldErrors.fileCount, "Number of JSON files to generate must be greater than zero.");
  assert.equal(preview.fieldErrors.referralsPerFile, "Number of referrals per file must be greater than zero.");
  assert.equal(preview.fieldErrors["upload:DEV:user_name"], "Please choose a user for DEV.");
  assert.equal(
    preview.fieldErrors["upload:DEV:remote_directory"],
    "Please enter the remote upload location for DEV."
  );
});

(async () => {
  try {
    for (const { name, callback } of tests) {
      try {
        await callback();
        console.log(`PASS ${name}`);
      } catch (error) {
        failures += 1;
        console.error(`FAIL ${name}`);
        console.error(`  ${error.message}`);
      }
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  if (failures > 0) {
    process.exitCode = 1;
  } else {
    console.log("Smoke tests passed.");
  }
})();
