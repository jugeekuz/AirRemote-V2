// @ts-check
/**
 * Scaffolds the files of a new component, screen, hook, store, domain, helper
 * or module so they match the code that is already there. Node built-ins only.
 *
 *   pnpm --filter @airremote/frontend create-new <kind> [name] [--module <m>] [--persisted]
 *
 * With a kind and a name it asks nothing (global, not persisted, unless
 * flagged). Without them it asks.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { styleText } from 'node:util';

import * as component from './templates/component.mjs';
import * as domain from './templates/domain.mjs';
import * as helper from './templates/helper.mjs';
import * as hook from './templates/hook.mjs';
import * as moduleKind from './templates/module.mjs';
import * as screen from './templates/screen.mjs';
import { GeneratorError, toNames } from './templates/shared.mjs';
import * as store from './templates/store.mjs';

/** @typedef {import('./templates/shared.mjs').Context} Context */
/** @typedef {import('./templates/shared.mjs').Plan} Plan */

/** @type {Record<string, (ctx: Context) => Plan>} */
const PLANNERS = {
  component: component.plan,
  screen: screen.plan,
  hook: hook.plan,
  store: store.plan,
  domain: domain.plan,
  helper: helper.plan,
  module: moduleKind.plan,
};

const KINDS = Object.keys(PLANNERS);
/** Kinds whose files can go inside a module. */
const MODULE_KINDS = ['component', 'screen', 'hook', 'store', 'helper'];

const USAGE = `Usage: create-new <kind> [name] [--module <m>] [--persisted]

  kind     ${KINDS.join(' | ')}
  name     PascalCase or kebab-case (ProductCard, product-card)
  --module put a component, screen, hook, store or helper inside src/modules/<m>
  --persisted  a store kept across restarts (adds a STORE_PERSIST_KEY entry)

With a kind and a name nothing is asked: the files are global and the store
is not persisted unless flagged. Run it from frontend/.`;

/**
 * @typedef {object} GenerateOptions
 * @property {string} kind
 * @property {string} name  the module's name for the `module` kind
 * @property {string} [module]  put the files inside this existing module
 * @property {boolean} [persisted]  stores only
 * @property {string} [root]  the frontend folder (default: the current directory)
 */

/**
 * Writes the files of one new thing. Everything is checked before anything is
 * written, so a refusal leaves the project as it was.
 * @param {GenerateOptions} options
 * @returns {{ files: string[], updated: string[], notes: string[], hints: string[] }}
 *   `files` are the new files and `updated` the existing files that changed,
 *   both relative to `root`; `notes` are the lines to add by hand
 *   for the code to compile and `hints` further advice.
 */
export function generate({
  kind,
  name,
  module,
  persisted = false,
  root = process.cwd(),
}) {
  const planner = PLANNERS[kind];
  if (!planner) {
    throw new GeneratorError(
      `Unknown kind "${kind}": use one of ${KINDS.join(', ')}.`,
    );
  }
  if (!name) {
    throw new GeneratorError(`The ${kind} needs a name.`);
  }
  if (!fs.existsSync(path.join(root, 'src'))) {
    throw new GeneratorError(
      `${root} has no src folder: run create-new from frontend/.`,
    );
  }
  if (persisted && kind !== 'store') {
    throw new GeneratorError('--persisted only applies to a store.');
  }

  const names = toNames(name, `${kind} name`);
  const moduleName = resolveModule(kind, module, root);
  if (
    kind === 'module' &&
    fs.existsSync(path.join(root, 'src/modules', names.kebab))
  ) {
    throw new GeneratorError(
      `Module "${names.kebab}" already exists (src/modules/${names.kebab}).`,
    );
  }

  const plan = planner({ names, module: moduleName, persisted });
  if (kind === 'domain') {
    const contract = `../packages/contracts/src/${names.kebab}`;
    if (fs.existsSync(path.join(root, contract))) {
      plan.hints.unshift(
        `A contract exists at packages/contracts/src/${names.kebab}: use its schemas instead of the placeholders.`,
      );
    }
  }

  for (const file of plan.files) {
    if (fs.existsSync(path.join(root, file.path))) {
      throw new GeneratorError(
        `${file.path} already exists; create-new never overwrites. Nothing was written.`,
      );
    }
  }

  /** What each touched file will contain. */
  const contents = new Map(plan.files.map((file) => [file.path, file.content]));
  const created = new Set(contents.keys());
  /** @type {Set<string>} */
  const updated = new Set();
  for (const edit of plan.edits) {
    const current = contents.get(edit.path) ?? readIfExists(root, edit.path);
    const next = edit.update(current);
    if (next !== current) {
      contents.set(edit.path, next);
      if (!created.has(edit.path)) {
        updated.add(edit.path);
      }
    }
  }

  for (const [file, content] of contents) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return {
    files: [...created],
    updated: [...updated],
    notes: plan.notes,
    hints: plan.hints,
  };
}

/**
 * @param {string} kind
 * @param {string | undefined} module
 * @param {string} root
 * @returns {string | undefined} the module's kebab-case name
 */
function resolveModule(kind, module, root) {
  if (module === undefined) {
    return undefined;
  }
  if (!MODULE_KINDS.includes(kind)) {
    throw new GeneratorError(`A ${kind} cannot go inside a module.`);
  }
  const { kebab } = toNames(module, 'module name');
  if (!fs.existsSync(path.join(root, 'src/modules', kebab))) {
    throw new GeneratorError(
      `Module "${kebab}" does not exist (src/modules/${kebab}). Create it first: create-new module ${kebab}`,
    );
  }
  return kebab;
}

/**
 * @param {string} root
 * @param {string} file
 * @returns {string | null}
 */
function readIfExists(root, file) {
  const target = path.join(root, file);
  return fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
}

/**
 * @typedef {object} Args
 * @property {string | undefined} kind
 * @property {string | undefined} name
 * @property {string | undefined} module
 * @property {boolean} persisted
 * @property {string | undefined} root
 * @property {boolean} help
 */

/**
 * @param {string[]} argv
 * @returns {Args}
 */
function parseArgs(argv) {
  /** @type {Args} */
  const args = {
    kind: undefined,
    name: undefined,
    module: undefined,
    persisted: false,
    root: undefined,
    help: false,
  };
  /** @type {string[]} */
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    const [flag, inline] = arg.split(/=(.*)/s, 2);
    /** The flag's value: `--module x` or `--module=x`. */
    const value = () => {
      const next = inline ?? argv[++i];
      if (next === undefined || next.startsWith('--')) {
        throw new GeneratorError(`${flag} needs a value.`);
      }
      return next;
    };
    if (flag === '--module') {
      args.module = value();
    } else if (flag === '--root') {
      args.root = value();
    } else if (flag === '--persisted') {
      args.persisted = true;
    } else if (flag === '--help' || flag === '-h') {
      args.help = true;
    } else if (arg.startsWith('-')) {
      throw new GeneratorError(`Unknown option ${arg}.\n\n${USAGE}`);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length > 2) {
    throw new GeneratorError(`Too many arguments.\n\n${USAGE}`);
  }
  [args.kind, args.name] = positional;
  return args;
}

/**
 * Asks for what the command line left out. Only for a person at a terminal.
 * @param {Args} args
 * @returns {Promise<Args>}
 */
async function promptForMissing(args) {
  if (args.kind !== undefined && args.name !== undefined) {
    return args;
  }
  if (!process.stdin.isTTY) {
    const missing = args.kind === undefined ? 'kind' : 'name';
    throw new GeneratorError(`The ${missing} is missing.\n\n${USAGE}`);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answers = { ...args };
    answers.kind ??= (await rl.question(`Kind (${KINDS.join(', ')}): `)).trim();
    answers.name ??= (
      await rl.question('Name (PascalCase or kebab-case): ')
    ).trim();
    if (MODULE_KINDS.includes(answers.kind) && answers.module === undefined) {
      const module = (
        await rl.question('Module (empty for a global one): ')
      ).trim();
      answers.module = module === '' ? undefined : module;
    }
    if (answers.kind === 'store' && !answers.persisted) {
      const persisted = await rl.question('Persisted across restarts? (y/N): ');
      answers.persisted = /^y(es)?$/i.test(persisted.trim());
    }
    return answers;
  } finally {
    rl.close();
  }
}

/** @param {string[]} argv */
async function main(argv) {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    console.log(USAGE);
    return;
  }
  const args = await promptForMissing(parsed);
  const root = path.resolve(args.root ?? process.cwd());
  const { files, updated, notes, hints } = generate({
    kind: args.kind ?? '',
    name: args.name ?? '',
    module: args.module,
    persisted: args.persisted,
    root,
  });

  for (const file of files) {
    console.log(`${styleText('green', 'created')} ${file}`);
  }
  for (const file of updated) {
    console.log(`${styleText('cyan', 'updated')} ${file}`);
  }
  const formattable = files.filter((file) => /\.(tsx?|json)$/.test(file));
  if (notes.length > 0) {
    console.log(`\n${styleText('yellow', 'Add by hand:')}`);
    for (const note of notes) {
      console.log(note);
    }
  }
  const next = [...hints];
  if (formattable.length > 0) {
    next.push(
      `Long names can need wrapping: pnpm exec prettier --write ${formattable.join(' ')}`,
    );
  }
  if (next.length > 0) {
    console.log(`\n${styleText('cyan', 'Next:')}`);
    for (const hint of next) {
      console.log(hint);
    }
  }
}

// Run only as a command, not when another script imports `generate`.
if (path.basename(process.argv[1] ?? '') === 'create-new.mjs') {
  main(process.argv.slice(2)).catch((error) => {
    if (error instanceof GeneratorError) {
      console.error(
        styleText('red', error.message, { stream: process.stderr }),
      );
      process.exitCode = 1;
      return;
    }
    throw error;
  });
}
