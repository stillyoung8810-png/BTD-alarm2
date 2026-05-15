import { createClient } from '@supabase/supabase-js';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_SEED_DIR = 'docs2/toss_point/quiz_seed';
const MANIFEST_FILE_NAME = 'manifest.json';
const TARGET_TABLE = 'benefit_quiz_questions';
const UPSERT_CONFLICT_TARGET = 'human_id';
const UPSERT_BATCH_SIZE = 100;
const APPROVED_REVIEW_STATUS = 'approved';
const REQUIRED_SUPABASE_KEY_ROLE = 'service_role';
const VALID_QUESTION_TYPES = new Set(['ox', 'ab']);

function resolveRepoRoot() {
  return resolve(fileURLToPath(import.meta.url), '..', '..');
}

function parseArgs(argv) {
  const args = {
    seedDir: DEFAULT_SEED_DIR,
    isDryRun: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      args.isDryRun = true;
      continue;
    }

    if (arg.startsWith('--seed-dir=')) {
      args.seedDir = arg.slice('--seed-dir='.length);
      continue;
    }

    if (arg.trim() !== '') {
      args.seedDir = arg;
    }
  }

  return args;
}

function readRequiredEnv(name, fallbackName) {
  const primaryValue = process.env[name]?.trim() ?? '';
  if (primaryValue !== '') {
    return primaryValue;
  }

  if (fallbackName == null) {
    throw new Error(`${name}_is_required`);
  }

  const fallbackValue = process.env[fallbackName]?.trim() ?? '';
  if (fallbackValue !== '') {
    return fallbackValue;
  }

  throw new Error(`${name}_or_${fallbackName}_is_required`);
}

function decodeJwtPayload(jwt) {
  const parts = jwt.split('.');
  if (parts.length < 2) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY_must_be_a_valid_jwt');
  }

  try {
    const normalizedPayload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = normalizedPayload.padEnd(
      Math.ceil(normalizedPayload.length / 4) * 4,
      '=',
    );
    const payload = JSON.parse(
      Buffer.from(paddedPayload, 'base64').toString('utf8'),
    );
    assertRecord(payload, 'SUPABASE_SERVICE_ROLE_KEY payload');
    return payload;
  } catch {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY_must_be_a_valid_jwt');
  }
}

function assertServiceRoleKey(jwt) {
  const payload = decodeJwtPayload(jwt);
  if (payload.role !== REQUIRED_SUPABASE_KEY_ROLE) {
    throw new Error(
      `SUPABASE_SERVICE_ROLE_KEY_must_have_role_${REQUIRED_SUPABASE_KEY_ROLE}_current_role_${payload.role ?? 'missing'}`,
    );
  }
}

function assertRecord(value, context) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${context}: expected JSON object`);
  }
}

function readRequiredString(record, key, context) {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${context}: ${key} must be a non-empty string`);
  }

  return value.trim();
}

function validateChoices(choices, correctChoiceId, context) {
  if (!Array.isArray(choices) || choices.length !== 2) {
    throw new Error(`${context}: choices must contain exactly 2 items`);
  }

  const choiceIds = new Set();
  for (const choice of choices) {
    assertRecord(choice, `${context}: choice`);

    const id = readRequiredString(choice, 'id', context);
    readRequiredString(choice, 'label', context);
    choiceIds.add(id);
  }

  if (!choiceIds.has(correctChoiceId)) {
    throw new Error(`${context}: correct_choice_id must exist in choices[].id`);
  }
}

function normalizeOptionalString(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue === '' ? null : normalizedValue;
}

function parseQuestionLine(line, context) {
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown parse error';
    throw new Error(`${context}: invalid JSONL row (${message})`);
  }

  assertRecord(parsed, context);

  const humanId = readRequiredString(parsed, 'human_id', context);
  const phase = readRequiredString(parsed, 'phase', context);
  const category = readRequiredString(parsed, 'category', context);
  const difficulty = readRequiredString(parsed, 'difficulty', context);
  const questionType = readRequiredString(parsed, 'question_type', context);
  const question = readRequiredString(parsed, 'question', context);
  const correctChoiceId = readRequiredString(parsed, 'correct_choice_id', context);
  const explanation = readRequiredString(parsed, 'explanation', context);
  readRequiredString(parsed, 'review_status', context);

  if (!VALID_QUESTION_TYPES.has(questionType)) {
    throw new Error(`${context}: question_type must be ox or ab`);
  }

  validateChoices(parsed.choices, correctChoiceId, context);

  return {
    human_id: humanId,
    phase,
    category,
    difficulty,
    question_type: questionType,
    question,
    choices: parsed.choices,
    correct_choice_id: correctChoiceId,
    explanation,
    topic: normalizeOptionalString(parsed.topic),
    source_note: normalizeOptionalString(parsed.source_note),
    review_status: APPROVED_REVIEW_STATUS,
    is_active: true,
  };
}

async function readManifest(seedDirPath) {
  const manifestPath = join(seedDirPath, MANIFEST_FILE_NAME);

  try {
    const rawManifest = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(rawManifest);
    assertRecord(manifest, MANIFEST_FILE_NAME);
    if (!Array.isArray(manifest.files)) {
      throw new Error(`${MANIFEST_FILE_NAME}: files must be an array`);
    }

    return manifest;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

async function listJsonlFiles(seedDirPath) {
  const entries = await readdir(seedDirPath, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function validateManifestCounts(manifest, fileCounts, totalCount) {
  if (manifest == null) {
    return;
  }

  if (manifest.total_count !== totalCount) {
    throw new Error(
      `manifest total_count mismatch: expected ${manifest.total_count}, got ${totalCount}`,
    );
  }

  for (const fileEntry of manifest.files) {
    assertRecord(fileEntry, `${MANIFEST_FILE_NAME}: file entry`);

    const fileName = readRequiredString(fileEntry, 'file', MANIFEST_FILE_NAME);
    const expectedCount = fileEntry.count;
    if (!Number.isInteger(expectedCount) || expectedCount < 0) {
      throw new Error(`${MANIFEST_FILE_NAME}: ${fileName} count must be a non-negative integer`);
    }

    const actualCount = fileCounts.get(fileName);
    if (actualCount == null) {
      throw new Error(`${MANIFEST_FILE_NAME}: ${fileName} is missing from seed directory`);
    }

    if (actualCount !== expectedCount) {
      throw new Error(
        `${MANIFEST_FILE_NAME}: ${fileName} count mismatch, expected ${expectedCount}, got ${actualCount}`,
      );
    }
  }
}

async function readSeedRecords(seedDirPath) {
  const manifest = await readManifest(seedDirPath);
  const fileNames = await listJsonlFiles(seedDirPath);
  if (fileNames.length === 0) {
    throw new Error(`No .jsonl files found in ${seedDirPath}`);
  }

  const records = [];
  const fileCounts = new Map();
  const humanIds = new Set();

  for (const fileName of fileNames) {
    const filePath = join(seedDirPath, fileName);
    const rawFile = await readFile(filePath, 'utf8');
    const lines = rawFile.split(/\r?\n/).filter((line) => line.trim() !== '');

    fileCounts.set(fileName, lines.length);

    lines.forEach((line, lineIndex) => {
      const context = `${fileName}:${lineIndex + 1}`;
      const record = parseQuestionLine(line, context);

      if (humanIds.has(record.human_id)) {
        throw new Error(`${context}: duplicate human_id ${record.human_id}`);
      }

      humanIds.add(record.human_id);
      records.push(record);
    });
  }

  validateManifestCounts(manifest, fileCounts, records.length);

  return {
    fileNames,
    records,
  };
}

function createSupabaseAdminClient() {
  const supabaseUrl = readRequiredEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const serviceRoleKey = readRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  assertServiceRoleKey(serviceRoleKey);

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        'X-Client-Info': 'btd-alarm-benefit-quiz-seed-import',
      },
    },
  });
}

async function upsertRecords(supabase, records) {
  for (let startIndex = 0; startIndex < records.length; startIndex += UPSERT_BATCH_SIZE) {
    const batch = records.slice(startIndex, startIndex + UPSERT_BATCH_SIZE);
    const { error } = await supabase
      .from(TARGET_TABLE)
      .upsert(batch, { onConflict: UPSERT_CONFLICT_TARGET });

    if (error != null) {
      throw new Error(`Supabase upsert failed at row ${startIndex + 1}: ${error.message}`);
    }
  }
}

async function main() {
  const repoRoot = resolveRepoRoot();
  const args = parseArgs(process.argv.slice(2));
  const seedDirPath = resolve(repoRoot, args.seedDir);
  const { fileNames, records } = await readSeedRecords(seedDirPath);

  const approvedCount = records.filter(
    (record) => record.review_status === APPROVED_REVIEW_STATUS,
  ).length;

  if (args.isDryRun) {
    console.log(
      `[BenefitQuizSeed] dry-run ok: files=${fileNames.length}, rows=${records.length}, approved=${approvedCount}, inactive=${records.length - approvedCount}`,
    );
    return;
  }

  const supabase = createSupabaseAdminClient();
  await upsertRecords(supabase, records);

  console.log(
    `[BenefitQuizSeed] upsert complete: table=${TARGET_TABLE}, files=${fileNames.length}, rows=${records.length}, approved=${approvedCount}, inactive=${records.length - approvedCount}, conflict=${UPSERT_CONFLICT_TARGET}`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[BenefitQuizSeed] failed: ${message}`);
  process.exitCode = 1;
});
