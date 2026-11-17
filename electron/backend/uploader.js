const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { Transform, pipeline } = require("stream");
const SftpClient = require("ssh2-sftp-client");
const { userDataPath } = require("./appPaths");
const { writeFileAtomic } = require("./atomicFile");
const {
  importCredentialFile,
  migrateCredentialFile,
  parseCredentialFile,
  saveCredentialEntries,
} = require("./secureCredentials");

const WINSCP_INI_PATH = userDataPath("upload_import", "WinSCP.ini");
const CREDENTIALS_JSON_PATH = userDataPath("config", "upload_credentials.json");
const WINSCP_GENERATED_CREDENTIALS_PATH = userDataPath("upload_import", "winscp_credentials.json");
const UPLOAD_PROFILES_PATH = userDataPath("config", "upload_profiles.json");
const UPLOAD_SOURCE_MARKER_PATH = userDataPath("config", "upload_source_marker.json");
const SFTP_CONNECT_TIMEOUT_MS = 30_000;
const SFTP_OPERATION_TIMEOUT_MS = 10 * 60_000;
const SFTP_CLOSE_TIMEOUT_MS = 5_000;
const SFTP_STALL_TIMEOUT_MS = 60_000;
const SFTP_KEEPALIVE_INTERVAL_MS = 10_000;
const SFTP_KEEPALIVE_COUNT_MAX = 3;
// Hard ceiling for one server: connect + folder prep + transfer + verification + close.
const UPLOAD_TARGET_DEADLINE_MS = SFTP_OPERATION_TIMEOUT_MS + 4 * SFTP_CONNECT_TIMEOUT_MS + SFTP_CLOSE_TIMEOUT_MS;

function summarizeUploadProfiles(profiles) {
  return {
    serverCount: (profiles?.servers || []).length,
    userCount: (profiles?.users || []).length,
    targetNames: (profiles?.servers || []).map((server) => server.name).filter(Boolean),
  };
}

function normalizeUploadTargetName(value) {
  const normalized = (value || "").trim().toUpperCase();
  if (normalized.includes("PROD")) {
    return "PROD";
  }
  if (normalized.includes("SQA")) {
    return "SQA";
  }
  if (normalized.includes("DEV")) {
    return "DEV";
  }
  if (normalized.includes("PPD")) {
    return "PPD";
  }
  return normalized;
}

function inferUploadTargetName(...values) {
  const normalized = values
    .filter(Boolean)
    .map((value) => String(value).trim().toUpperCase())
    .join(" ");

  if (!normalized) {
    return "";
  }

  const aliasGroups = {
    DEV: ["DEV", "DEVELOPMENT", "NONPROD", "NON-PROD", "SANDBOX"],
    PPD: ["PPD", "PREPROD", "PRE-PROD", "PRE PROD", "STAGE", "STAGING"],
    SQA: ["SQA", "QA", "TEST", "UAT"],
    PROD: ["PROD", "PRODUCTION", "LIVE"],
  };

  for (const [targetName, aliases] of Object.entries(aliasGroups)) {
    if (aliases.some((alias) => normalized.includes(alias))) {
      return targetName;
    }
  }

  return normalizeUploadTargetName(normalized);
}

function inferServerName(sessionName, host) {
  const lastSegment = (sessionName || "").split("\\").slice(-1)[0];
  if (lastSegment.includes("@")) {
    return lastSegment.split("@", 2)[1].trim() || host;
  }
  if ((sessionName || "").includes("\\")) {
    return sessionName.split("\\", 1)[0].trim() || host;
  }
  const hostPrefix = (host || "").split(".", 1)[0].trim();
  return hostPrefix ? hostPrefix.toUpperCase() : host;
}

function getDefaultUploadTargets() {
  return ["SQA", "DEV", "PPD", "PROD"];
}

function getUploadTargetNames(profiles = {}) {
  const defaults = getDefaultUploadTargets();
  const discovered = new Set(defaults);

  for (const server of profiles.servers || []) {
    const normalized = normalizeUploadTargetName(server?.name || server?.target_name || "");
    if (normalized) {
      discovered.add(normalized);
    }
  }

  for (const user of profiles.users || []) {
    const normalized = normalizeUploadTargetName(user?.server || user?.target_name || "");
    if (normalized) {
      discovered.add(normalized);
    }
  }

  return [...discovered]
    .filter((name) => name)
    .sort((left, right) => {
      const leftIndex = defaults.indexOf(left);
      const rightIndex = defaults.indexOf(right);
      if (leftIndex >= 0 && rightIndex >= 0) {
        return leftIndex - rightIndex;
      }
      if (leftIndex >= 0) {
        return -1;
      }
      if (rightIndex >= 0) {
        return 1;
      }
      return left.localeCompare(right);
    });
}

function getCandidateWinscpIniPaths() {
  return [...new Set([
    WINSCP_INI_PATH,
    userDataPath("upload_import", "winscp.ini"),
  ])];
}

function getCandidateCredentialsJsonPaths() {
  return [...new Set([
    CREDENTIALS_JSON_PATH,
    userDataPath("config", "winscp_credentials.json"),
  ])];
}

function getCandidateUploadProfilesPaths() {
  return [...new Set([
    UPLOAD_PROFILES_PATH,
  ])];
}

function loadUploadImportMarker() {
  try {
    if (!fs.existsSync(UPLOAD_SOURCE_MARKER_PATH)) {
      return null;
    }

    const parsed = JSON.parse(fs.readFileSync(UPLOAD_SOURCE_MARKER_PATH, "utf8"));
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return {
      sourceKind: String(parsed.source_kind || parsed.sourceKind || "").trim(),
      sourcePath: String(parsed.source_path || parsed.sourcePath || "").trim(),
      importedAt: String(parsed.imported_at || parsed.importedAt || "").trim(),
    };
  } catch (_error) {
    return null;
  }
}

function saveUploadImportMarker(payload = {}) {
  const marker = {
    source_kind: String(payload.sourceKind || payload.source_kind || "").trim(),
    source_path: String(payload.sourcePath || payload.source_path || "").trim(),
    imported_at: new Date().toISOString(),
  };

  writeFileAtomic(UPLOAD_SOURCE_MARKER_PATH, `${JSON.stringify(marker, null, 2)}\n`, "utf8");
  return marker;
}

function getExistingWinscpIniPath() {
  return getCandidateWinscpIniPaths().find((candidate) => fs.existsSync(candidate)) || "";
}

function getExistingCredentialsJsonPath() {
  return getCandidateCredentialsJsonPaths().find((candidate) => fs.existsSync(candidate)) || "";
}

function getExistingUploadProfilesPath() {
  return getCandidateUploadProfilesPaths().find((candidate) => fs.existsSync(candidate)) || "";
}

function getUploadProfileSourcePath() {
  const marker = loadUploadImportMarker();
  if (!marker) {
    return ["", ""];
  }

  const credentialsJsonPath = getExistingCredentialsJsonPath();
  if (credentialsJsonPath) {
    return [credentialsJsonPath, "credentials_json"];
  }

  const winscpIniPath = getExistingWinscpIniPath();
  if (winscpIniPath) {
    return [winscpIniPath, "winscp_ini"];
  }

  return ["", ""];
}

function parseCredentialsProfiles(jsonPath = CREDENTIALS_JSON_PATH) {
  const resolvedPath = jsonPath === CREDENTIALS_JSON_PATH ? getExistingCredentialsJsonPath() : jsonPath;
  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    return { servers: [], users: [] };
  }

  const loaded = parseCredentialFile(resolvedPath);
  const entries = loaded.entries;
  if (!loaded.encrypted) migrateCredentialFile(resolvedPath);

  const servers = new Map();
  const users = new Map();

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const environment = (entry.Environment || entry.environment || "").trim();
    const sessionName = (entry.Session || entry.session || "").trim();
    const host = (entry.Host || entry.host || "").trim();
    const username = (entry.UserName || entry.username || "").trim();
    const password = (entry.Password || entry.password || "").trim();
    const port = Number(entry.Port || entry.port || 22);
    if (!host || !username) {
      continue;
    }

    const targetName = inferUploadTargetName(environment, sessionName, host, username);
    const serverKey = targetName || inferServerName(sessionName || username, host);
    const displayName = `${username}@${serverKey}`;

    if (!servers.has(serverKey)) {
      servers.set(serverKey, {
        name: serverKey,
        host,
        port,
        target_name: targetName || "",
        session_name: sessionName,
        actual_server_name: environment || serverKey,
        source: "credentials_json",
      });
    }

    users.set(displayName, {
      name: displayName,
      server: serverKey,
      username,
      password,
      encrypted_password: "",
      password_plain: password,
      session_name: sessionName,
      target_name: targetName || "",
      source: "credentials_json",
    });
  }

  return {
    servers: [...servers.values()].sort((a, b) => a.name.localeCompare(b.name)),
    users: [...users.values()].sort((a, b) => `${a.server}:${a.name}`.localeCompare(`${b.server}:${b.name}`)),
  };
}

function sanitizeWinscpIniContent(content) {
  const lines = content.split(/\r?\n/);
  const sanitized = [];
  let inIniBody = false;

  for (const line of lines) {
    const stripped = line.trim();
    if (stripped.startsWith("[") && stripped.endsWith("]")) {
      inIniBody = true;
      sanitized.push(stripped);
      continue;
    }
    if (!inIniBody) {
      continue;
    }
    if (!stripped) {
      sanitized.push("");
      continue;
    }
    if (stripped.startsWith(";") || stripped.startsWith("#")) {
      sanitized.push(line);
      continue;
    }
    if (line.includes("=")) {
      sanitized.push(line);
    }
  }

  return sanitized.join("\n");
}

function parseIniSections(content) {
  const sections = {};
  let currentSection = "";

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) {
      continue;
    }
    if (line.startsWith("[") && line.endsWith("]")) {
      currentSection = line.slice(1, -1);
      sections[currentSection] = sections[currentSection] || {};
      continue;
    }
    if (!currentSection) {
      continue;
    }
    const separatorIndex = rawLine.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const key = rawLine.slice(0, separatorIndex).trim();
    const value = rawLine.slice(separatorIndex + 1).trim();
    sections[currentSection][key] = value;
  }

  return sections;
}

function decodeWinscpSessionName(sessionName) {
  try {
    return decodeURIComponent(sessionName).replace(/\//g, "\\").trim();
  } catch (_error) {
    return sessionName.replace(/\//g, "\\").trim();
  }
}

function extractSessionName(sectionName) {
  return decodeWinscpSessionName(sectionName.replace(/\//g, "\\").split("\\", 2)[1] || "");
}

function isSessionSection(sectionName) {
  return sectionName.replace(/\//g, "\\").startsWith("Sessions\\");
}

function parseUserHostKey(value) {
  const match = /^\s*([^@\s]+)@([^\s=]+)\s*$/.exec(value || "");
  if (!match) {
    return ["", ""];
  }
  return [match[1].trim(), match[2].trim()];
}

function buildUserDisplayName(sessionName, username, serverName) {
  const lastSegment = (sessionName || "").split("\\").slice(-1)[0];
  if (lastSegment.includes("@")) {
    return lastSegment;
  }
  return `${username}@${serverName}`;
}

function loadWinscpProfiles(iniPath = WINSCP_INI_PATH) {
  const resolvedPath = iniPath === WINSCP_INI_PATH ? getExistingWinscpIniPath() : iniPath;
  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    return { servers: [], users: [] };
  }

  const sections = parseIniSections(sanitizeWinscpIniContent(fs.readFileSync(resolvedPath, "utf8")));
  const servers = new Map();
  const users = new Map();

  for (const [sectionName, sessionData] of Object.entries(sections)) {
    if (!isSessionSection(sectionName)) {
      continue;
    }

    const host = (sessionData.HostName || "").trim();
    const username = (sessionData.UserName || "").trim();
    if (!host || !username) {
      continue;
    }

    const sessionName = extractSessionName(sectionName);
    const serverName = inferServerName(sessionName, host);
    const targetName = inferUploadTargetName(sessionName, host, serverName);
    const port = Number(sessionData.PortNumber || 22);
    const serverKey = targetName || serverName;

    if (!servers.has(serverKey)) {
      servers.set(serverKey, {
        name: serverKey,
        host,
        port,
        target_name: targetName || "",
        session_name: sessionName,
        actual_server_name: serverName,
        source: "winscp_ini",
      });
    }

    const displayName = buildUserDisplayName(sessionName, username, serverKey);
    users.set(displayName, {
      name: displayName,
      server: serverKey,
      username,
      password: "",
      encrypted_password: (sessionData.Password || "").trim(),
      password_plain: (sessionData.PasswordPlain || "").trim(),
      session_name: sessionName,
      target_name: targetName || "",
      source: "winscp_ini",
    });
  }

  if (servers.size === 0 && users.size === 0) {
    for (const [sectionName, section] of Object.entries(sections)) {
      for (const key of Object.keys(section)) {
        const [username, host] = parseUserHostKey(key);
        if (!username || !host) {
          continue;
        }
        const targetName = inferUploadTargetName(sectionName, key, host);
        if (!getDefaultUploadTargets().includes(targetName)) {
          continue;
        }

        if (!servers.has(targetName)) {
          servers.set(targetName, {
            name: targetName,
            host,
            port: 22,
            target_name: targetName,
            session_name: "",
            actual_server_name: host,
            source: "winscp_cache",
          });
        }

        const displayName = `${username}@${targetName}`;
        users.set(displayName, {
          name: displayName,
          server: targetName,
          username,
          password: "",
          encrypted_password: "",
          password_plain: "",
          session_name: "",
          target_name: targetName,
          source: "winscp_cache",
        });
      }
    }
  }

  return {
    servers: [...servers.values()].sort((a, b) => a.name.localeCompare(b.name)),
    users: [...users.values()].sort((a, b) => `${a.server}:${a.name}`.localeCompare(`${b.server}:${b.name}`)),
  };
}

function decryptNextCharacterWinscp(remainingPassword, magic = 163) {
  if (!remainingPassword || remainingPassword.length < 2) {
    return [0, ""];
  }

  const added = Number.parseInt(remainingPassword.slice(0, 2), 16);
  const decryptedResult = ((~(added ^ magic)) % 256 + 256) % 256;
  return [decryptedResult, remainingPassword.slice(2)];
}

function decryptWinscpPassword(sessionHostname, sessionUsername, encryptedPassword) {
  const checkFlag = 255;
  const key = `${sessionHostname}${sessionUsername}`;
  if (!encryptedPassword) {
    return "";
  }

  let [storedFlag, remainingPassword] = decryptNextCharacterWinscp(encryptedPassword);
  let passwordLength = 0;

  if (storedFlag === checkFlag) {
    remainingPassword = remainingPassword.slice(2);
    [passwordLength, remainingPassword] = decryptNextCharacterWinscp(remainingPassword);
  } else {
    [passwordLength, remainingPassword] = decryptNextCharacterWinscp(remainingPassword);
  }

  let skipLength = 0;
  [skipLength, remainingPassword] = decryptNextCharacterWinscp(remainingPassword);
  remainingPassword = remainingPassword.slice(skipLength * 2);

  const chars = [];
  for (let index = 0; index < passwordLength; index += 1) {
    let decryptedChar = 0;
    [decryptedChar, remainingPassword] = decryptNextCharacterWinscp(remainingPassword);
    chars.push(String.fromCharCode(decryptedChar));
  }

  const finalPassword = chars.join("");
  return storedFlag === checkFlag ? finalPassword.slice(key.length) : finalPassword;
}

function persistCredentialsJson(sourceJsonPath, destinationPath = CREDENTIALS_JSON_PATH, removeSource = false) {
  return importCredentialFile(sourceJsonPath, destinationPath, removeSource);
}

function generateCredentialsJsonFromWinscpIni(iniPath, outputPath = WINSCP_GENERATED_CREDENTIALS_PATH) {
  const profiles = loadWinscpProfiles(iniPath);
  const credentials = [];

  for (const user of profiles.users || []) {
    const encryptedPassword = (user.encrypted_password || "").trim();
    if (!encryptedPassword) {
      continue;
    }

    const server = findServerForTarget(profiles, user.server);
    const host = server ? server.host : "";
    const password = decryptWinscpPassword(host, user.username || "", encryptedPassword);
    if (!password) {
      continue;
    }

    credentials.push({
      environment: user.server || "",
      target_name: user.server || "",
      server_name: server ? server.name || "" : "",
      session: (user.session_name || "").replace(/\\/g, "/"),
      session_name: user.session_name || "",
      username: user.username || "",
      host,
      port: Number(server?.port || 22),
      password,
      source: "winscp_ini",
      Environment: user.server || "",
      Session: (user.session_name || "").replace(/\\/g, "/"),
      UserName: user.username || "",
      Host: host,
      Port: Number(server?.port || 22),
      Password: password,
    });
  }

  if (credentials.length === 0) {
    throw new Error("WinSCP.ini did not contain saved session passwords that could be converted to upload credentials.");
  }

  saveCredentialEntries(outputPath, credentials);

  return outputPath;
}

function loadUploadProfiles() {
  const marker = loadUploadImportMarker();
  if (!marker) {
    return { servers: [], users: [] };
  }

  const jsonProfiles = parseCredentialsProfiles();
  if (jsonProfiles.servers.length || jsonProfiles.users.length) {
    return jsonProfiles;
  }

  const winscpProfiles = loadWinscpProfiles();
  if (winscpProfiles.servers.length || winscpProfiles.users.length) {
    return winscpProfiles;
  }

  const uploadProfilesPath = getExistingUploadProfilesPath();
  if (uploadProfilesPath) {
    try {
      const parsed = JSON.parse(fs.readFileSync(uploadProfilesPath, "utf8"));
      const servers = Array.isArray(parsed?.servers)
        ? parsed.servers
            .map((server) => ({
              name: String(server?.name || "").trim(),
              host: String(server?.host || "").trim(),
              port: Number(server?.port || 22),
              target_name: String(server?.target_name || server?.name || "").trim(),
              actual_server_name: String(server?.actual_server_name || server?.host || server?.name || "").trim(),
              source: "upload_profiles_json",
            }))
            .filter((server) => Boolean(server.name))
        : [];
      const users = Array.isArray(parsed?.users)
        ? parsed.users
            .map((user) => ({
              name: String(user?.name || "").trim(),
              server: String(user?.server || "").trim(),
              username: String(user?.username || "").trim(),
              password: String(user?.password || "").trim(),
              encrypted_password: String(user?.encrypted_password || "").trim(),
              password_plain: String(user?.password_plain || "").trim(),
              session_name: String(user?.session_name || "").trim(),
              target_name: String(user?.target_name || user?.server || "").trim(),
              source: "upload_profiles_json",
            }))
            .filter((user) => Boolean(user.name && user.server))
        : [];

      if (servers.length || users.length) {
        return {
          servers: servers.sort((a, b) => a.name.localeCompare(b.name)),
          users: users.sort((a, b) => `${a.server}:${a.name}`.localeCompare(`${b.server}:${b.name}`)),
        };
      }
    } catch (_error) {
      // Ignore invalid legacy profile file and continue with empty defaults.
    }
  }

  return { servers: [], users: [] };
}

function importUploadSourceToConfig(sourcePath) {
  const normalizedSourcePath = (sourcePath || "").trim();
  if (!normalizedSourcePath || !fs.existsSync(normalizedSourcePath)) {
    throw new Error("The selected upload source file was not found.");
  }

  const extension = path.extname(normalizedSourcePath).toLowerCase();
  if (extension === ".json") {
    const profiles = parseCredentialsProfiles(normalizedSourcePath);
    if (!profiles.servers.length || !profiles.users.length) {
      throw new Error("The selected credentials JSON file did not contain usable upload profiles.");
    }
    persistCredentialsJson(normalizedSourcePath);
    saveUploadImportMarker({
      sourceKind: "credentials_json",
      sourcePath: CREDENTIALS_JSON_PATH,
    });
    return {
      source_kind: "credentials_json",
      source_path: normalizedSourcePath,
      config_path: CREDENTIALS_JSON_PATH,
      profile_summary: summarizeUploadProfiles(parseCredentialsProfiles(CREDENTIALS_JSON_PATH)),
    };
  }

  if (extension === ".ini") {
    fs.mkdirSync(path.dirname(WINSCP_INI_PATH), { recursive: true });
    fs.copyFileSync(normalizedSourcePath, WINSCP_INI_PATH);
    const generatedJsonPath = generateCredentialsJsonFromWinscpIni(WINSCP_INI_PATH);
    persistCredentialsJson(generatedJsonPath, CREDENTIALS_JSON_PATH, true);
    saveUploadImportMarker({
      sourceKind: "winscp_ini",
      sourcePath: WINSCP_INI_PATH,
    });
    return {
      source_kind: "winscp_ini",
      source_path: normalizedSourcePath,
      config_path: CREDENTIALS_JSON_PATH,
      generated_json_path: CREDENTIALS_JSON_PATH,
      profile_summary: summarizeUploadProfiles(parseCredentialsProfiles(CREDENTIALS_JSON_PATH)),
    };
  }

  throw new Error("Please choose either a WinSCP.ini file or a credentials JSON file.");
}

function findServerForTarget(profiles, targetName) {
  const normalizedTarget = normalizeUploadTargetName(targetName);
  return (profiles.servers || []).find((server) => {
    return [server.name, server.host, server.target_name].some(
      (value) => normalizeUploadTargetName(value) === normalizedTarget
    );
  }) || null;
}

function getServerDisplayForTarget(profiles, targetName) {
  const server = findServerForTarget(profiles, targetName);
  if (!server) {
    return "No server name available";
  }
  return (server.host || server.actual_server_name || server.name || "No server name available").trim();
}

function getUserNamesForServer(profiles, serverName) {
  return (profiles.users || [])
    .filter((user) => normalizeUploadTargetName(user.server) === normalizeUploadTargetName(serverName))
    .map((user) => user.name);
}

function findWinscpExecutable() {
  const defaultPaths = [
    "C:\\Program Files (x86)\\WinSCP\\WinSCP.com",
    "C:\\Program Files\\WinSCP\\WinSCP.com",
    "C:\\Program Files (x86)\\WinSCP\\WinSCP.exe",
    "C:\\Program Files\\WinSCP\\WinSCP.exe",
  ];
  return defaultPaths.find((candidate) => fs.existsSync(candidate)) || "";
}

function resolveUploadProfile(profiles, serverName, userName) {
  let server = (profiles.servers || []).find((item) => item.name === serverName);
  if (!server) {
    server = findServerForTarget(profiles, serverName);
  }
  const user = (profiles.users || []).find(
    (item) => item.name === userName && normalizeUploadTargetName(item.server) === normalizeUploadTargetName(serverName)
  );

  if (!server) {
    throw new Error(`The selected upload server for ${serverName} was not found.`);
  }
  if (!user) {
    throw new Error(`The selected upload user for ${serverName} was not found.`);
  }

  let password = user.password || user.password_plain || "";
  if (!password && user.password_env) {
    password = process.env[user.password_env] || "";
  }

  const winscpPath = findWinscpExecutable();
  if (!password && (!winscpPath || !user.session_name)) {
    throw new Error(`No usable password is configured for ${userName}.`);
  }

  return {
    server_name: serverName,
    user_name: userName,
    host: server.host || "",
    port: Number(server.port || 22),
    username: user.username || "",
    password,
    session_name: user.session_name || "",
    winscp_path: winscpPath,
  };
}

function resolveUploadTargets(profiles, selectedTargets) {
  return (selectedTargets || []).map((target) => {
    const serverName = (target.server_name || "").trim();
    const userName = (target.user_name || "").trim();
    const remoteDirectory = (target.remote_directory || "").trim();
    if (!serverName) {
      throw new Error("An upload target is missing its server name.");
    }
    if (!userName) {
      throw new Error(`Please choose a user for ${serverName} before using upload.`);
    }
    if (!remoteDirectory) {
      throw new Error(`Please enter the remote upload location for ${serverName}.`);
    }

    return {
      server_name: serverName,
      user_name: userName,
      remote_directory: remoteDirectory,
      connection_details: resolveUploadProfile(profiles, serverName, userName),
    };
  });
}

async function ensureRemoteDirectory(client, remoteDirectory) {
  const parts = remoteDirectory.replace(/^\/+|\/+$/g, "").split("/");
  let currentPath = "";
  for (const part of parts) {
    if (!part) {
      continue;
    }
    currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
    try {
      await client.stat(currentPath);
    } catch (_error) {
      await client.mkdir(currentPath, true);
    }
  }
}

function withTimeout(promise, timeoutMs, description, onTimeout) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try {
        onTimeout?.();
      } catch (_error) {
        // A failed abort must not hide the timeout itself.
      }
      reject(new Error(`${description} timed out after ${Math.ceil(timeoutMs / 1000)} seconds.`));
    }, timeoutMs);
  });

  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

function forceDisconnect(client) {
  try {
    client?.client?.destroy?.();
  } catch (_error) {
    // Nothing else can be done; the caller has already recorded the outcome.
  }
}

async function closeSftpClient(client, timeoutMs = SFTP_CLOSE_TIMEOUT_MS, options = {}) {
  if (options.force) {
    // After a failure or timeout, abort immediately so a half-finished transfer cannot
    // keep writing to the server in the background while the next server starts.
    forceDisconnect(client);
    try {
      Promise.resolve(client.end?.()).catch(() => {});
    } catch (_error) {
      // Already disconnected.
    }
    return;
  }

  let closePromise;
  try {
    closePromise = Promise.resolve(client.end()).catch(() => {});
  } catch (_error) {
    closePromise = Promise.resolve();
  }

  let timer;
  const closedNormally = await Promise.race([
    closePromise.then(() => true),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    }),
  ]);
  clearTimeout(timer);

  if (!closedNormally) {
    forceDisconnect(client);
  }
}

function buildSftpConnectOptions(connectionDetails, connectTimeoutMs) {
  return {
    host: connectionDetails.host,
    port: connectionDetails.port,
    username: connectionDetails.username,
    password: connectionDetails.password,
    readyTimeout: connectTimeoutMs,
    keepaliveInterval: SFTP_KEEPALIVE_INTERVAL_MS,
    keepaliveCountMax: SFTP_KEEPALIVE_COUNT_MAX,
  };
}

function isMissingRemoteFileError(error) {
  const code = String(error?.code ?? "");
  return code === "2" || code === "ENOENT" || /no such file|not exist|not found/i.test(String(error?.message || ""));
}

function normalizeRemoteFilePath(remoteDirectory, localPath) {
  return `${String(remoteDirectory || "").replace(/\/+$/, "")}/${path.basename(localPath)}`;
}

function runWinscp(winscpPath, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(winscpPath, args, { windowsHide: true });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGKILL");
      } catch (_error) {
        // Process already exited.
      }
      reject(new Error(`WinSCP did not finish within ${Math.ceil(timeoutMs / 1000)} seconds and was stopped.`));
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

function buildWinscpScript(sessionName, commands) {
  return [
    // Abort on the first error instead of prompting, never ask to overwrite, and never
    // reconnect automatically: an automatic reconnect can send the same file twice.
    "option batch abort",
    "option confirm off",
    "option reconnecttime off",
    `open "${sessionName}"`,
    ...commands,
    "exit",
  ].join("\n");
}

async function runWinscpScript(sessionName, winscpPath, commands, timeoutMs, label) {
  const iniPath = getExistingWinscpIniPath();
  if (!iniPath) {
    throw new Error("WinSCP.ini was not found in the expected upload_import locations.");
  }

  const scriptPath = path.join(os.tmpdir(), `winscp_${label}_${Date.now()}_${Math.random().toString(16).slice(2)}.txt`);
  fs.writeFileSync(scriptPath, buildWinscpScript(sessionName, commands), "utf8");
  try {
    let result;
    try {
      result = await runWinscp(winscpPath, [`/ini=${iniPath}`, `/script=${scriptPath}`, "/nointeractiveinput"], timeoutMs);
    } catch (error) {
      throw new Error(`WinSCP ${label} failed for session ${sessionName}. ${error.message}`);
    }
    if (result.status !== 0) {
      const details = (result.stderr || result.stdout || "Unknown WinSCP error.").trim().split(/\r?\n/).slice(-6).join(" ");
      throw new Error(`WinSCP ${label} failed for session ${sessionName}. ${details}`);
    }
    return result;
  } finally {
    fs.rmSync(scriptPath, { force: true });
  }
}

async function uploadFileWithWinscp(localPath, remoteDirectory, sessionName, winscpPath) {
  const remotePath = normalizeRemoteFilePath(remoteDirectory, localPath);
  await runWinscpScript(
    sessionName,
    winscpPath,
    [`put "${localPath}" "${remoteDirectory.replace(/\/+$/, "")}/"`],
    SFTP_OPERATION_TIMEOUT_MS,
    "upload"
  );
  return {
    remotePath,
    verification: "winscp",
    message: "WinSCP reported a successful transfer.",
  };
}

async function testConnectionWithWinscp(remoteDirectory, sessionName, winscpPath) {
  const normalizedRemoteDirectory = (remoteDirectory || "").trim();
  const commands = normalizedRemoteDirectory ? [`cd "${normalizedRemoteDirectory}"`, "pwd"] : [];
  await runWinscpScript(sessionName, winscpPath, commands, SFTP_CONNECT_TIMEOUT_MS, "connection test");
  return normalizedRemoteDirectory
    ? `Connected successfully and confirmed ${normalizedRemoteDirectory}.`
    : "Connected successfully.";
}

async function testUploadConnection(connectionDetails, remoteDirectory) {
  const normalizedRemoteDirectory = (remoteDirectory || "").trim();
  if (!normalizedRemoteDirectory) {
    throw new Error("Please enter the remote upload location.");
  }

  if (connectionDetails.winscp_path && connectionDetails.session_name && !connectionDetails.password) {
    return testConnectionWithWinscp(
      normalizedRemoteDirectory,
      connectionDetails.session_name,
      connectionDetails.winscp_path
    );
  }

  const client = new SftpClient();
  let failed = false;
  try {
    await withTimeout(
      client.connect(buildSftpConnectOptions(connectionDetails, SFTP_CONNECT_TIMEOUT_MS)),
      SFTP_CONNECT_TIMEOUT_MS,
      "SFTP connection"
    );
    await withTimeout(client.list(normalizedRemoteDirectory), SFTP_CONNECT_TIMEOUT_MS, "Remote directory check");
    return `Connected successfully and confirmed ${normalizedRemoteDirectory}.`;
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    await closeSftpClient(client, SFTP_CLOSE_TIMEOUT_MS, { force: failed });
  }
}

async function putWithStallGuard(client, localPath, remotePath, operationTimeoutMs, stallTimeoutMs) {
  const reader = fs.createReadStream(localPath);
  let stallTimer;
  let rejectStall;
  const stalled = new Promise((_, reject) => {
    rejectStall = reject;
  });
  const arm = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      forceDisconnect(client);
      rejectStall(new Error(`SFTP upload stalled: the server accepted no data for ${Math.ceil(stallTimeoutMs / 1000)} seconds.`));
    }, stallTimeoutMs);
  };
  // Count bytes as the server pulls them. Backpressure pauses this stream when the server
  // stops accepting data, so a silent connection is caught by the stall timer.
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      arm();
      callback(null, chunk);
    },
  });
  pipeline(reader, counter, (error) => {
    if (error) counter.destroy(error);
  });
  arm();

  try {
    await withTimeout(
      Promise.race([client.put(counter, remotePath), stalled]),
      operationTimeoutMs,
      "SFTP upload",
      () => forceDisconnect(client)
    );
  } finally {
    clearTimeout(stallTimer);
    reader.destroy();
    counter.destroy();
  }
}

/**
 * Uploads one file to one SFTP endpoint exactly once.
 *
 * The file is sent a single time. Afterwards the remote size is checked. A missing file after a
 * successful transfer means the server's inbound job already picked it up, which counts as
 * delivered: reporting it as failed would invite a second, duplicate upload.
 */
async function uploadFileWithSftp(
  localPath,
  remoteDirectory,
  connectionDetails,
  client = new SftpClient(),
  timeouts = {},
  options = {}
) {
  const connectTimeoutMs = timeouts.connectTimeoutMs || SFTP_CONNECT_TIMEOUT_MS;
  const operationTimeoutMs = timeouts.operationTimeoutMs || SFTP_OPERATION_TIMEOUT_MS;
  const closeTimeoutMs = timeouts.closeTimeoutMs || SFTP_CLOSE_TIMEOUT_MS;
  const stallTimeoutMs = timeouts.stallTimeoutMs || SFTP_STALL_TIMEOUT_MS;
  const localSize = fs.statSync(localPath).size;
  const remotePath = normalizeRemoteFilePath(remoteDirectory, localPath);
  let failed = false;

  try {
    await withTimeout(
      client.connect(buildSftpConnectOptions(connectionDetails, connectTimeoutMs)),
      connectTimeoutMs,
      "SFTP connection",
      () => forceDisconnect(client)
    );
    await withTimeout(
      ensureRemoteDirectory(client, remoteDirectory),
      connectTimeoutMs,
      "Remote directory preparation",
      () => forceDisconnect(client)
    );

    if (options.skipIfPresent) {
      const existing = await withTimeout(client.stat(remotePath), connectTimeoutMs, "Remote file check").catch(() => null);
      if (existing && Number(existing.size) === localSize) {
        return {
          remotePath,
          verification: "already-present",
          message: `${path.basename(localPath)} is already on the server with the same size (${localSize} bytes), so it was not sent again.`,
        };
      }
    }

    await putWithStallGuard(client, localPath, remotePath, operationTimeoutMs, stallTimeoutMs);

    let remoteStats;
    try {
      remoteStats = await withTimeout(client.stat(remotePath), connectTimeoutMs, "Uploaded file verification");
    } catch (error) {
      if (isMissingRemoteFileError(error)) {
        return {
          remotePath,
          verification: "picked-up",
          message: `The server accepted all ${localSize} bytes and its inbound job picked the file up right away.`,
        };
      }
      return {
        remotePath,
        verification: "unconfirmed",
        message: `The server accepted all ${localSize} bytes, but the size check could not run (${error.message}). Do not re-send; check the server if needed.`,
      };
    }
    if (Number(remoteStats?.size) !== localSize) {
      throw new Error(
        `Upload verification failed for ${path.basename(localPath)}: expected ${localSize} bytes, found ${remoteStats?.size ?? "unknown"}.`
      );
    }
    return {
      remotePath,
      verification: "size-match",
      message: `Verified ${localSize} bytes on the server.`,
    };
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    await closeSftpClient(client, closeTimeoutMs, { force: failed });
  }
}

async function uploadFile(localPath, remoteDirectory, connectionDetails, options = {}) {
  const normalizedRemoteDirectory = (remoteDirectory || "").trim();
  if (!normalizedRemoteDirectory) {
    throw new Error("Please enter the remote upload location.");
  }

  if (connectionDetails.winscp_path && connectionDetails.session_name && !connectionDetails.password) {
    return uploadFileWithWinscp(
      localPath,
      normalizedRemoteDirectory,
      connectionDetails.session_name,
      connectionDetails.winscp_path
    );
  }

  return uploadFileWithSftp(localPath, normalizedRemoteDirectory, connectionDetails, new SftpClient(), {}, options);
}

function buildUploadEndpointKey(target) {
  const c = target.connection_details || {};
  return [
    String(c.host || c.session_name || target.server_name || "").trim().toLowerCase(),
    Number(c.port || 22),
    String(c.username || c.session_name || target.user_name || "").trim().toLowerCase(),
    String(target.remote_directory || "").trim().replace(/\/+$/, ""),
  ].join("|");
}

function normalizeUploadOutcome(outcome) {
  if (typeof outcome === "string") {
    return { remotePath: outcome, verification: "", message: "" };
  }
  return {
    remotePath: String(outcome?.remotePath || ""),
    verification: String(outcome?.verification || ""),
    message: String(outcome?.message || ""),
  };
}

/**
 * Sends one file to each selected server, one server at a time.
 *
 * - Each distinct endpoint (host, port, account, folder) receives the file exactly once.
 *   Repeated selections of the same endpoint are reported as "skipped" instead of re-sent.
 * - A failure or timeout on one server is recorded and the next server starts right away.
 * - Every server gets a hard deadline so the batch always finishes with a result per server.
 */
async function uploadTargetsSequentially(localPath, targets = [], options = {}) {
  const upload = typeof options.upload === "function" ? options.upload : uploadFile;
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
  const targetTimeoutMs = Math.max(1, Number(options.targetTimeoutMs || UPLOAD_TARGET_DEADLINE_MS));
  const uploadOptions = { skipIfPresent: Boolean(options.skipIfPresent) };
  const allTargets = Array.isArray(targets) ? targets : [];

  const firstTargetByKey = new Map();
  const plan = allTargets.map((target) => {
    const key = buildUploadEndpointKey(target);
    const duplicateOf = firstTargetByKey.get(key) || null;
    if (!duplicateOf) firstTargetByKey.set(key, target);
    return { target, duplicateOf };
  });
  const uploadCount = plan.filter((item) => !item.duplicateOf).length;
  let completedCount = 0;

  onProgress({
    state: "upload-batch-start",
    current: 0,
    total: uploadCount,
    targetNames: plan.filter((item) => !item.duplicateOf).map((item) => item.target.server_name),
  });

  const results = [];
  for (const { target, duplicateOf } of plan) {
    const baseResult = {
      serverName: target.server_name,
      userName: target.user_name || "",
      remoteDirectory: target.remote_directory,
    };

    if (duplicateOf) {
      const result = {
        ...baseResult,
        remotePath: "",
        status: "skipped",
        verification: "duplicate-endpoint",
        durationMs: 0,
        message: `Skipped ${target.server_name}: it is the same server, account, and folder as ${duplicateOf.server_name}, which already received the file once.`,
      };
      results.push(result);
      onProgress({
        state: "upload-target-skipped",
        current: completedCount,
        total: uploadCount,
        uploadTarget: target.server_name,
        detail: result.message,
        result,
      });
      continue;
    }

    onProgress({
      state: "uploading",
      current: completedCount,
      total: uploadCount,
      uploadTarget: target.server_name,
    });
    const startedAt = Date.now();
    try {
      const outcome = normalizeUploadOutcome(await withTimeout(
        upload(localPath, target.remote_directory, target.connection_details, uploadOptions),
        targetTimeoutMs,
        `Upload to ${target.server_name}`
      ));
      completedCount += 1;
      const result = {
        ...baseResult,
        remotePath: outcome.remotePath,
        status: "completed",
        verification: outcome.verification,
        durationMs: Date.now() - startedAt,
        message: `Upload to ${target.server_name} completed.${outcome.message ? ` ${outcome.message}` : ""}`,
      };
      results.push(result);
      onProgress({
        state: "upload-target-complete",
        current: completedCount,
        total: uploadCount,
        uploadTarget: target.server_name,
        detail: result.message,
        result,
      });
    } catch (error) {
      completedCount += 1;
      const result = {
        ...baseResult,
        remotePath: "",
        status: "failed",
        verification: "",
        durationMs: Date.now() - startedAt,
        message: error?.message || "The server did not complete the upload.",
      };
      results.push(result);
      onProgress({
        state: "upload-target-error",
        current: completedCount,
        total: uploadCount,
        uploadTarget: target.server_name,
        detail: result.message,
        result,
      });
    }
  }

  onProgress({
    state: results.some((result) => result.status === "failed") ? "upload-batch-warning" : "upload-complete",
    current: completedCount,
    total: uploadCount,
    results,
  });
  return results;
}

module.exports = {
  buildUploadEndpointKey,
  getServerDisplayForTarget,
  getUploadProfileSourcePath,
  getUploadTargetNames,
  getUserNamesForServer,
  importUploadSourceToConfig,
  loadUploadProfiles,
  resolveUploadTargets,
  summarizeUploadProfiles,
  testUploadConnection,
  closeSftpClient,
  uploadFile,
  uploadFileWithSftp,
  uploadTargetsSequentially,
  withTimeout,
};
