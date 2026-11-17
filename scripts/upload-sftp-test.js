// End-to-end upload checks against real in-process SFTP servers (no mocks of the SFTP client).
// Covers: exactly-once delivery, inbound-folder pickup, stalled servers, unreachable servers,
// failover to the next server, duplicate endpoints, and retry without re-sending.
const assert = require("assert");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");

const ssh2 = require(require.resolve("ssh2", { paths: [path.dirname(require.resolve("ssh2-sftp-client"))] }));
const userDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ccrs-upload-userdata-"));
process.env.CCRS_USER_DATA_ROOT = userDataRoot;
const { uploadFileWithSftp, uploadFileWithWinscp, uploadTargetsSequentially } = require("../electron/backend/uploader");

const { Server, utils } = ssh2;
const { STATUS_CODE } = utils.sftp;
const hostKey = utils.generateKeyPairSync("ed25519").private;

function startSftpServer(behavior = {}) {
  const files = new Map();
  const stats = { opens: 0, writes: 0, connections: 0 };
  const server = new Server({ hostKeys: [hostKey] }, (client) => {
    stats.connections += 1;
    client.on("error", () => {});
    client.on("authentication", (ctx) => ctx.accept());
    client.on("ready", () => {
      client.on("session", (accept) => {
        const session = accept();
        session.on("sftp", (acceptSftp) => {
          const sftp = acceptSftp();
          const handles = new Map();
          let nextHandle = 0;
          const attrs = (size, isDir) => ({ mode: isDir ? 0o40755 : 0o100644, uid: 0, gid: 0, size, atime: 0, mtime: 0 });
          const statPath = (reqid, remotePath) => {
            if (files.has(remotePath)) return sftp.attrs(reqid, attrs(files.get(remotePath).length, false));
            if (!path.posix.extname(remotePath)) return sftp.attrs(reqid, attrs(0, true));
            return sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);
          };
          sftp.on("REALPATH", (reqid, remotePath) => sftp.name(reqid, [{ filename: remotePath, longname: remotePath, attrs: attrs(0, true) }]));
          sftp.on("STAT", statPath);
          sftp.on("LSTAT", statPath);
          sftp.on("MKDIR", (reqid) => sftp.status(reqid, STATUS_CODE.OK));
          sftp.on("OPEN", (reqid, filename) => {
            stats.opens += 1;
            const handle = Buffer.alloc(4);
            handle.writeUInt32BE(nextHandle++, 0);
            handles.set(handle.toString("hex"), { filename, chunks: [] });
            sftp.handle(reqid, handle);
          });
          sftp.on("WRITE", (reqid, handle, _offset, data) => {
            stats.writes += 1;
            if (behavior.stall) return; // Never acknowledge: simulates a frozen server.
            handles.get(handle.toString("hex")).chunks.push(Buffer.from(data));
            sftp.status(reqid, STATUS_CODE.OK);
          });
          sftp.on("FSTAT", (reqid) => sftp.attrs(reqid, attrs(0, false)));
          sftp.on("FSETSTAT", (reqid) => sftp.status(reqid, STATUS_CODE.OK));
          sftp.on("CLOSE", (reqid, handle) => {
            const entry = handles.get(handle.toString("hex"));
            if (entry && !behavior.pickUp) files.set(entry.filename, Buffer.concat(entry.chunks));
            sftp.status(reqid, STATUS_CODE.OK);
          });
        });
      });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, files, stats, port: server.address().port }));
  });
}

function target(name, port, directory = "/in/manual_process/", username = "tester") {
  return {
    server_name: name,
    user_name: username,
    remote_directory: directory,
    connection_details: { host: "127.0.0.1", port, username, password: "secret" },
  };
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ccrs-upload-sftp-"));
  const localPath = path.join(tempRoot, "leie_processed.xlsx");
  fs.writeFileSync(localPath, Buffer.alloc(300_000, 7));
  const localSize = fs.statSync(localPath).size;
  const fast = { connectTimeoutMs: 3_000, operationTimeoutMs: 5_000, closeTimeoutMs: 300, stallTimeoutMs: 500 };
  const upload = (file, directory, connection, options) =>
    uploadFileWithSftp(file, directory, connection, undefined, fast, options);
  const logPath = path.join(tempRoot, "uploads.log");
  const servers = [];
  const start = async (behavior) => {
    const instance = await startSftpServer(behavior);
    servers.push(instance);
    return instance;
  };

  try {
    const sqa = await start();
    const dev = await start({ stall: true });
    const ppd = await start({ pickUp: true });
    const closed = await new Promise((resolve) => {
      const probe = net.createServer().listen(0, "127.0.0.1", () => {
        const { port } = probe.address();
        probe.close(() => resolve(port));
      });
    });

    const events = [];
    const startedAt = Date.now();
    const results = await uploadTargetsSequentially(localPath, [
      target("SQA", sqa.port),
      target("DEV", dev.port),
      target("PROD", closed),
      target("PPD", ppd.port),
      target("SQA", sqa.port),
    ], { upload, logPath, onProgress: (event) => events.push(event) });
    const elapsed = Date.now() - startedAt;

    assert.deepEqual(results.map((item) => `${item.serverName}:${item.status}`), [
      "SQA:completed", "DEV:failed", "PROD:failed", "PPD:completed", "SQA:skipped",
    ]);
    assert.equal(results[0].verification, "size-match");
    assert.equal(sqa.stats.opens, 1, "SQA must receive the file exactly once");
    assert.equal(sqa.files.get("/in/manual_process/leie_processed.xlsx").length, localSize);
    assert.match(results[1].message, /stalled|timed out/i);
    assert.equal(dev.stats.opens, 1, "A stalled server must not be retried automatically");
    assert.ok(results[2].message.length > 0);
    assert.equal(results[3].verification, "picked-up", "A file consumed by the inbound job counts as delivered");
    assert.equal(ppd.stats.opens, 1);
    assert.ok(elapsed < 15_000, `Batch must not hang (took ${elapsed} ms)`);
    assert.equal(events.at(-1).state, "upload-batch-warning");
    assert.equal(events.at(-1).results.length, 5);
    const logText = fs.readFileSync(logPath, "utf8");
    assert.match(logText, /Upload run started: leie_processed\.xlsx \(300000 bytes\) to 4 servers/);
    assert.match(logText, /PASSED {3}SQA \| \/in\/manual_process\/leie_processed\.xlsx \| check: size-match/);
    assert.match(logText, /FAILED {3}DEV/);
    assert.match(logText, /SKIPPED {2}SQA/);
    assert.match(logText, /Upload run finished: 2 passed, 2 failed, 1 skipped/);
    assert.doesNotMatch(logText, /secret/, "The upload log must never contain a password");
    assert.equal(events.filter((event) => event.state === "uploading").length, 4);
    console.log(`PASS exactly-once delivery, stalled and unreachable servers fail over in ${elapsed} ms, pickup counts as delivered`);

    // Same host and folder but a different account is a different endpoint and must still upload.
    const shared = await start();
    const sharedResults = await uploadTargetsSequentially(localPath, [
      target("SQA", shared.port, "/in/manual_process/", "sqa_user"),
      target("DEV", shared.port, "/in/manual_process/", "dev_user"),
    ], { upload });
    assert.deepEqual(sharedResults.map((item) => item.status), ["completed", "completed"]);
    assert.equal(shared.stats.opens, 2);
    console.log("PASS different accounts on one host are separate endpoints");

    // Retry never re-sends a file that already reached the server.
    const retryResults = await uploadTargetsSequentially(localPath, [target("SQA", sqa.port)], { upload, skipIfPresent: true });
    assert.equal(retryResults[0].status, "completed");
    assert.equal(retryResults[0].verification, "already-present");
    assert.equal(sqa.stats.opens, 1, "Retry must not upload a second copy");
    console.log("PASS retry detects the delivered file and does not send it again");

    // A hard per-server deadline ends the batch even if an upload never settles.
    const deadlineResults = await uploadTargetsSequentially(localPath, [target("SQA", sqa.port), target("DEV", dev.port)], {
      targetTimeoutMs: 200,
      upload: (_file, _directory, connection) => (connection.port === sqa.port ? new Promise(() => {}) : "/in/manual_process/leie_processed.xlsx"),
    });
    assert.deepEqual(deadlineResults.map((item) => item.status), ["failed", "completed"]);
    assert.match(deadlineResults[0].message, /timed out/);
    console.log("PASS per-server deadline moves on to the next server");

    // WinSCP session path, driven through a stand-in WinSCP program that records the script
    // it was given and then succeeds, fails, or hangs on request.
    fs.mkdirSync(path.join(userDataRoot, "upload_import"), { recursive: true });
    fs.writeFileSync(path.join(userDataRoot, "upload_import", "WinSCP.ini"), "[Sessions\\LEIE_SQA]\nHostName=example.test\n", "utf8");
    const fakeWinscp = path.join(tempRoot, "fake-winscp.js");
    const recordPath = path.join(tempRoot, "winscp-runs.jsonl");
    fs.writeFileSync(fakeWinscp, `
      const fs = require("fs");
      const args = process.argv.slice(2);
      const script = fs.readFileSync(args.find((arg) => arg.startsWith("/script=")).slice(8), "utf8");
      fs.appendFileSync(${JSON.stringify(recordPath)}, JSON.stringify({ args, script }) + "\\n");
      const mode = process.env.FAKE_WINSCP_MODE || "ok";
      if (mode === "fail") { console.log("Authentication failed."); process.exit(1); }
      if (mode === "hang") { setInterval(() => {}, 1000); }
    `, "utf8");
    const winscp = (mode, timeoutMs = 5_000) => {
      process.env.FAKE_WINSCP_MODE = mode;
      return uploadFileWithWinscp(localPath, "/in/manual_process/", "LEIE_SQA", process.execPath, { argsPrefix: [fakeWinscp], timeoutMs });
    };
    const winscpRuns = () => fs.readFileSync(recordPath, "utf8").trim().split("\n").map((line) => JSON.parse(line));

    const leftoverScripts = () => fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith("winscp_upload_")).length;
    const scriptsBefore = leftoverScripts();
    const winscpOk = await winscp("ok");
    assert.equal(winscpOk.remotePath, "/in/manual_process/leie_processed.xlsx");
    assert.equal(winscpOk.verification, "winscp");
    assert.equal(winscpRuns().length, 1, "WinSCP must run exactly once per upload");
    const scriptLines = winscpRuns()[0].script.split("\n");
    assert.deepEqual(scriptLines.slice(0, 4), ["option batch abort", "option confirm off", "option reconnecttime off", 'open "LEIE_SQA"']);
    assert.equal(scriptLines.filter((line) => line.startsWith("put ")).length, 1, "The file must be sent with a single put");
    assert.equal(scriptLines.at(-1), "exit");
    assert.ok(winscpRuns()[0].args.includes("/nointeractiveinput"));

    await assert.rejects(winscp("fail"), /WinSCP upload failed for session LEIE_SQA\. Authentication failed\./);
    assert.equal(winscpRuns().length, 2, "A failed WinSCP upload must not be retried automatically");

    const hangStarted = Date.now();
    await assert.rejects(winscp("hang", 700), /did not finish within 1 seconds and was stopped/);
    assert.ok(Date.now() - hangStarted < 5_000, "A hung WinSCP must be stopped at the timeout");
    assert.equal(leftoverScripts(), scriptsBefore, "Temporary WinSCP scripts must be removed");
    console.log("PASS WinSCP session uploads run once, report failures, and are stopped when they hang");
  } finally {
    fs.rmSync(userDataRoot, { recursive: true, force: true });
    for (const { server } of servers) server.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error("FAIL upload SFTP test");
  console.error(error);
  process.exit(1);
});
