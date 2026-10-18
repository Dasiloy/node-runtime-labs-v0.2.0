import { existsSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const labsDir = path.join(rootDir, "labs");
const indexFile = path.join(rootDir, "index.html");
const progressFile = path.join(rootDir, ".nodebook-lab-progress.json");

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3217);

const phaseSections = [
  "Goal",
  "What you'll build",
  "What you’ll build",
  "What you'll prove",
  "What you’ll prove",
  "Files you'll touch",
  "Files you’ll touch",
  "Final verification",
  "Why this matters",
  "Build",
  "Run",
  "Expected behavior",
  "Hints",
  "Debugging notes",
  "Checkpoint",
  "Reflection",
];

const checkMode = process.argv.includes("--check");

if (checkMode) {
  try {
    await runCheck();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
} else {
  startServer();
}

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

      if (
        req.method === "GET" &&
        (url.pathname === "/" || url.pathname === "/index.html")
      ) {
        await sendFile(res, indexFile, "text/html; charset=utf-8");
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/state") {
        const labs = await readLabs();
        const progress = await readProgress(labs);
        await sendJson(res, { labs, progress });
        return;
      }

      if (req.method === "PATCH" && url.pathname === "/api/progress") {
        const labs = await readLabs();
        const body = await readJson(req);
        const progress = await updateProgress(labs, body);
        await sendJson(res, { progress });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/reset") {
        const labs = await readLabs();
        const body = await readJson(req);
        const progress = await resetProgress(labs, body);
        await sendJson(res, { progress });
        return;
      }

      await sendJson(res, { error: "Not found" }, 404);
    } catch (error) {
      console.error(error);
      await sendJson(res, { error: error.message }, 500);
    }
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        `Port ${port} is already in use. Try PORT=3218 node labs.js.`,
      );
    } else if (error.code === "EPERM") {
      console.error(
        `Cannot listen on ${host}:${port}. Try a different PORT or host.`,
      );
    } else {
      console.error(error);
    }
    process.exit(1);
  });

  server.listen(port, host, () => {
    console.log(`Node Runtime Labs running at http://${host}:${port}`);
    console.log(`Progress file: ${progressFile}`);
  });
}

async function runCheck() {
  const requestedLabs = process.argv
    .slice(2)
    .filter((arg) => arg !== "--check");
  const labs = await readLabs({ requestedLabs });
  const challengeCount = labs.reduce(
    (total, lab) => total + lab.challengeCount,
    0,
  );
  const phaseCount = labs.reduce((total, lab) => total + lab.phaseCount, 0);

  console.log(
    `Validated ${labs.length} lab${plural(labs.length)}, ${challengeCount} challenge${plural(challengeCount)}, ${phaseCount} phase${plural(phaseCount)}.`,
  );

  for (const lab of labs) {
    console.log(
      `- ${lab.id}: ${lab.challengeCount} challenge${plural(lab.challengeCount)}, ${lab.phaseCount} phase${plural(lab.phaseCount)}`,
    );
  }
}

async function sendFile(res, file, contentType) {
  const data = await readFile(file);
  res.writeHead(200, {
    "content-type": contentType,
    "cache-control": "no-store",
  });
  res.end(data);
}

async function sendJson(res, data, status = 200) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) {
      throw new Error("Request body too large");
    }
  }
  return body ? JSON.parse(body) : {};
}

async function readLabs(options = {}) {
  const entries = await readDirectoryOrEmpty(labsDir);
  let labFolders = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith(".") && !name.startsWith("_"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (options.requestedLabs?.length) {
    labFolders = labFolders.filter((folderName) => {
      return options.requestedLabs.some((requested) =>
        matchesRequestedFolder(folderName, requested),
      );
    });
  }

  const labs = [];
  for (const folderName of labFolders) {
    try {
      labs.push(await readLab(folderName));
    } catch (error) {
      if (
        !options.requestedLabs?.length &&
        error.code === "LAB_CONFIG_MISSING"
      ) {
        continue;
      }
      throw error;
    }
  }

  assertUnique(labs, "id");
  assertUnique(labs, "slug");

  if (!options.requestedLabs?.length) {
    return labs;
  }

  const requested = new Set(options.requestedLabs);
  const filtered = labs.filter((lab) => {
    return (
      requested.has(lab.id) ||
      requested.has(lab.slug) ||
      requested.has(lab.number)
    );
  });
  const matched = new Set(
    filtered.flatMap((lab) => [lab.id, lab.slug, lab.number].filter(Boolean)),
  );
  const missing = options.requestedLabs.filter((id) => !matched.has(id));
  if (missing.length > 0) {
    throw new Error(`Unknown lab: ${missing.join(", ")}`);
  }

  return filtered;
}

function matchesRequestedFolder(folderName, requested) {
  const number = parseLabNumber(folderName);
  const slug = stripLabNumber(folderName);
  return requested === folderName || requested === number || requested === slug;
}

async function readLab(folderName) {
  const folder = path.join(labsDir, folderName);
  const config = await readJsonFile(path.join(folder, "lab.config.json"));
  const id = stringValue(config.id, folderName);

  if (id !== folderName) {
    throw new Error(
      `${relativePath(folder)}/lab.config.json id must match its folder name.`,
    );
  }

  const challenges = await readChallenges(folder, config);
  const defaultChallenge = stringValue(
    config.defaultChallenge,
    challenges[0]?.id ?? "",
  );

  if (
    defaultChallenge &&
    !challenges.some((challenge) => challenge.id === defaultChallenge)
  ) {
    throw new Error(
      `${relativePath(folder)}/lab.config.json defaultChallenge does not exist.`,
    );
  }

  return {
    id,
    number: stringValue(config.number, parseLabNumber(id)),
    slug: stringValue(config.slug, stripLabNumber(id)),
    title: requiredString(
      config.title,
      `${relativePath(folder)}/lab.config.json title`,
    ),
    status: stringValue(
      config.status,
      challenges.length > 0 ? "draft" : "planned",
    ),
    difficulty: stringValue(config.difficulty, ""),
    concepts: stringArray(config.concepts),
    summary: stringValue(config.summary, ""),
    defaultChallenge,
    challengeCount: challenges.length,
    phaseCount: challenges.reduce(
      (total, challenge) => total + challenge.phaseCount,
      0,
    ),
    challenges,
  };
}

async function readChallenges(folder, config) {
  const challengeDir = path.join(folder, "challenges");
  const entries = await readDirectoryOrEmpty(challengeDir);
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter(
      (name) =>
        name.endsWith(".md") && !name.startsWith(".") && !name.startsWith("_"),
    )
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const challenges = [];
  for (const fileName of files) {
    challenges.push(await readChallenge(path.join(challengeDir, fileName)));
  }

  return orderChallenges(
    challenges,
    stringArray(config.challengeOrder),
    folder,
  );
}

async function readChallenge(file) {
  const id = path.basename(file, ".md");
  const markdown = await readFile(file, "utf8");
  const parseableMarkdown = stripFencedCode(markdown);
  const phases = parseGuidePhases(markdown);

  return {
    id,
    title: parseTitle(parseableMarkdown) ?? humanizeId(id),
    summary: parseLead(parseableMarkdown),
    phaseCount: phases.length,
    phases,
  };
}

function orderChallenges(challenges, order, folder) {
  if (order.length === 0) {
    return challenges;
  }

  const byId = new Map(
    challenges.map((challenge) => [challenge.id, challenge]),
  );
  const unknown = order.filter((id) => !byId.has(id));
  if (unknown.length > 0) {
    throw new Error(
      `${relativePath(folder)}/lab.config.json challengeOrder includes unknown challenge: ${unknown.join(", ")}`,
    );
  }

  const ordered = order.map((id) => byId.get(id));
  const orderedIds = new Set(order);
  const remaining = challenges.filter(
    (challenge) => !orderedIds.has(challenge.id),
  );
  return [...ordered, ...remaining];
}

async function readDirectoryOrEmpty(dir) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function readJsonFile(file) {
  let raw;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      const missing = new Error(`${relativePath(file)} is missing.`);
      missing.code = "LAB_CONFIG_MISSING";
      throw missing;
    }
    throw error;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `${relativePath(file)} contains invalid JSON: ${error.message}`,
    );
  }
}

function parseTitle(markdown) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
}

function parseLead(markdown) {
  const withoutTitle = markdown.replace(/^#\s+.+$/m, "").trim();
  const beforeFirstPhase =
    withoutTitle.split(/^## Phase\s+\d+:/m)[0]?.trim() ?? "";
  const firstParagraph = beforeFirstPhase
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .find((part) => part && !part.startsWith("#"));
  return firstParagraph ?? "";
}

function stripFencedCode(markdown) {
  return markdown.replace(/```[\s\S]*?```/g, (block) => {
    return block.replace(/[^\n]/g, " ");
  });
}

function parseGuidePhases(markdown) {
  const headingMarkdown = stripFencedCode(markdown);
  const matches = [...headingMarkdown.matchAll(/^## Phase\s+(\d+):\s+(.+)$/gm)];
  return matches.map((match, position) => {
    const start = match.index + match[0].length;
    const end = matches[position + 1]?.index ?? markdown.length;
    const raw = markdown.slice(start, end).trim();

    return {
      index: Number(match[1]),
      title: match[2].trim(),
      sections: parsePhaseSections(raw),
    };
  });
}

function parsePhaseSections(raw) {
  const parseableRaw = stripFencedCode(raw);
  const headingPattern = new RegExp(
    `^### (${phaseSections.map(escapeRegex).join("|")})[ \\t]*$`,
    "gm",
  );
  const matches = [...parseableRaw.matchAll(headingPattern)];
  const sections = {};

  for (let index = 0; index < matches.length; index++) {
    const match = matches[index];
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? raw.length;
    sections[match[1]] = raw.slice(start, end).trim();
  }

  return sections;
}

async function readProgress(labs) {
  const existing = existsSync(progressFile)
    ? JSON.parse(await readFile(progressFile, "utf8"))
    : { version: 2, labs: {} };

  return normalizeProgress(labs, existing);
}

function normalizeProgress(labs, progress) {
  const next = {
    version: 2,
    updatedAt: progress.updatedAt ?? new Date().toISOString(),
    labs: {},
  };

  for (const lab of labs) {
    const saved = progress.labs?.[lab.id] ?? {};
    const currentChallenge =
      validChallengeId(lab, saved.currentChallenge) ?? lab.defaultChallenge;

    next.labs[lab.id] = {
      currentChallenge,
      challenges: {},
    };

    for (const challenge of lab.challenges) {
      const savedChallenge =
        saved.challenges?.[challenge.id] ??
        (challenge.id === lab.defaultChallenge ? saved : {});

      next.labs[lab.id].challenges[challenge.id] = normalizeChallengeProgress(
        challenge,
        savedChallenge,
      );
    }
  }

  return next;
}

function normalizeChallengeProgress(challenge, saved) {
  const completed = new Set(
    Array.isArray(saved.completedPhases) ? saved.completedPhases : [],
  );
  const validCompleted = [...completed]
    .filter(
      (index) =>
        Number.isInteger(index) && index >= 0 && index < challenge.phaseCount,
    )
    .sort((a, b) => a - b);

  return {
    currentPhase: clampPhase(saved.currentPhase ?? 0, challenge.phaseCount),
    completedPhases: validCompleted,
    stepProgress: normalizeStepProgress(saved.stepProgress),
    notes: typeof saved.notes === "object" && saved.notes ? saved.notes : {},
  };
}

function normalizeStepProgress(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const normalized = {};
  for (const [phaseIndex, stepIds] of Object.entries(value)) {
    const index = Number(phaseIndex);
    if (!Number.isInteger(index) || index < 0) continue;
    if (!Array.isArray(stepIds)) continue;

    const unique = new Set();
    for (const stepId of stepIds) {
      if (typeof stepId === "string" && stepId.trim()) {
        unique.add(stepId.trim());
      }
    }

    if (unique.size > 0) {
      normalized[index] = [...unique].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      );
    }
  }

  return normalized;
}

function clampPhase(value, phaseCount) {
  if (phaseCount === 0) return 0;
  const number = Number(value);
  if (!Number.isInteger(number)) return 0;
  return Math.min(Math.max(number, 0), phaseCount - 1);
}

async function updateProgress(labs, body) {
  const progress = await readProgress(labs);
  const lab = labs.find((item) => item.id === body.labId);
  if (!lab) throw new Error("Unknown lab");

  const labProgress = progress.labs[lab.id];
  const challengeId =
    validChallengeId(lab, body.challengeId) ?? labProgress.currentChallenge;
  const challenge = lab.challenges.find((item) => item.id === challengeId);

  if (challenge) {
    labProgress.currentChallenge = challenge.id;
    const challengeProgress = labProgress.challenges[challenge.id];
    const completed = new Set(challengeProgress.completedPhases);

    if (Number.isInteger(body.phaseIndex) && challenge.phaseCount > 0) {
      const phaseIndex = clampPhase(body.phaseIndex, challenge.phaseCount);
      if (body.completed === true) completed.add(phaseIndex);
      if (body.completed === false) completed.delete(phaseIndex);
    }

    if (Number.isInteger(body.currentPhase)) {
      challengeProgress.currentPhase = clampPhase(
        body.currentPhase,
        challenge.phaseCount,
      );
    }

    if (Number.isInteger(body.notePhase)) {
      const notePhase = clampPhase(body.notePhase, challenge.phaseCount);
      challengeProgress.notes[notePhase] = String(body.note ?? "");
    }

    if (Number.isInteger(body.stepPhase) && typeof body.stepId === "string") {
      const stepPhase = clampPhase(body.stepPhase, challenge.phaseCount);
      const stepId = body.stepId.trim();
      if (stepId) {
        challengeProgress.stepProgress ??= {};
        const completedSteps = new Set(
          challengeProgress.stepProgress[stepPhase] ?? [],
        );
        if (body.stepCompleted === true) completedSteps.add(stepId);
        if (body.stepCompleted === false) completedSteps.delete(stepId);
        const nextSteps = [...completedSteps].sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true }),
        );

        if (nextSteps.length > 0) {
          challengeProgress.stepProgress[stepPhase] = nextSteps;
        } else {
          delete challengeProgress.stepProgress[stepPhase];
        }
      }
    }

    challengeProgress.completedPhases = [...completed].sort((a, b) => a - b);
  }

  progress.updatedAt = new Date().toISOString();
  await writeProgress(progress);
  return progress;
}

async function resetProgress(labs, body) {
  const progress = await readProgress(labs);

  if (body.labId) {
    const lab = labs.find((item) => item.id === body.labId);
    if (!lab) throw new Error("Unknown lab");

    if (body.challengeId) {
      const challenge = lab.challenges.find(
        (item) => item.id === body.challengeId,
      );
      if (!challenge) throw new Error("Unknown challenge");
      progress.labs[lab.id].challenges[challenge.id] =
        normalizeChallengeProgress(challenge, {});
    } else {
      progress.labs[lab.id] = normalizeProgress([lab], {
        version: 2,
        labs: {},
      }).labs[lab.id];
    }
  } else {
    for (const lab of labs) {
      progress.labs[lab.id] = normalizeProgress([lab], {
        version: 2,
        labs: {},
      }).labs[lab.id];
    }
  }

  progress.updatedAt = new Date().toISOString();
  await writeProgress(progress);
  return progress;
}

async function writeProgress(progress) {
  await writeFile(progressFile, `${JSON.stringify(progress, null, 2)}\n`);
}

function validChallengeId(lab, challengeId) {
  if (typeof challengeId !== "string") return null;
  return lab.challenges.some((challenge) => challenge.id === challengeId)
    ? challengeId
    : null;
}

function assertUnique(items, key) {
  const seen = new Set();
  for (const item of items) {
    const value = item[key];
    if (!value) continue;
    if (seen.has(value)) {
      throw new Error(`Duplicate lab ${key}: ${value}`);
    }
    seen.add(value);
  }
}

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function stringValue(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function stringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => item.trim());
}

function parseLabNumber(id) {
  return id.match(/^(\d+)/)?.[1] ?? "";
}

function stripLabNumber(id) {
  return id.replace(/^\d+-/, "");
}

function humanizeId(id) {
  return id
    .replace(/^\d+-/, "")
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function relativePath(file) {
  return path.relative(rootDir, file);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function plural(count) {
  return count === 1 ? "" : "s";
}
