// @ts-check
/**
 * What every template shares: the name forms, where a kind's files go, and the
 * shapes a template returns.
 */

/** Thrown for anything the user can fix; the CLI prints it without a stack. */
export class GeneratorError extends Error {}

/**
 * @typedef {object} Names
 * @property {string} kebab   product-card
 * @property {string} pascal  ProductCard
 * @property {string} camel   productCard
 * @property {string} constant PRODUCT_CARD
 * @property {string} words   Product card
 */

/**
 * @typedef {object} Context
 * @property {Names} names
 * @property {string | undefined} module  kebab-case module name, when the files go inside a module
 * @property {boolean} persisted
 */

/**
 * @typedef {object} Edit
 * @property {string} path  relative to the frontend root
 * @property {(current: string | null) => string} update  gets the file's text (null when it doesn't exist) and returns the new text
 */

/**
 * @typedef {object} Plan
 * @property {{ path: string, content: string }[]} files  new files; the run fails if one exists
 * @property {Edit[]} edits  changes to files that may exist already
 * @property {string[]} notes  lines the user must add by hand for the code to compile
 * @property {string[]} hints  advice that is not required
 */

const PASCAL = /^[A-Z][A-Za-z0-9]*$/;
const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * @param {string} input PascalCase or kebab-case
 * @param {string} what  for the error message
 * @returns {Names}
 */
export function toNames(input, what) {
  if (!PASCAL.test(input) && !KEBAB.test(input)) {
    throw new GeneratorError(
      `Invalid ${what} "${input}": use PascalCase (ProductCard) or kebab-case (product-card).`,
    );
  }
  const kebab = input
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
  const parts = kebab.split('-');
  const pascal = parts.map(capitalize).join('');
  return {
    kebab,
    pascal,
    camel: pascal.charAt(0).toLowerCase() + pascal.slice(1),
    constant: parts.join('_').toUpperCase(),
    words: capitalize(parts.join(' ')),
  };
}

/** @param {string} text */
export function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Naive English plural, for REST paths. Edit the generated path if it is wrong.
 * @param {string} word
 */
export function pluralize(word) {
  if (/[^aeiou]y$/.test(word)) {
    return `${word.slice(0, -1)}ies`;
  }
  if (/(s|x|z|ch|sh)$/.test(word)) {
    return `${word}es`;
  }
  return `${word}s`;
}

/**
 * The folder of a layer: `src/<layer>`, or inside the module.
 * @param {Context} ctx
 * @param {string} layer
 */
export function layerDir(ctx, layer) {
  return ctx.module ? `src/modules/${ctx.module}/${layer}` : `src/${layer}`;
}

/**
 * The import path of a folder of a layer.
 * @param {Context} ctx
 * @param {string} layer
 * @param {string} folder
 */
export function layerAlias(ctx, layer, folder) {
  return ctx.module
    ? `@modules/${ctx.module}/${layer}/${folder}`
    : `@${layer}/${folder}`;
}

/**
 * An edit that adds a line to a barrel file, once.
 * @param {string} path
 * @param {string} line
 * @returns {Edit}
 */
export function appendLine(path, line) {
  return {
    path,
    update(current) {
      const text = current ?? '';
      if (text.split('\n').includes(line)) {
        return text;
      }
      const separator = text === '' || text.endsWith('\n') ? '' : '\n';
      return `${text}${separator}${line}\n`;
    },
  };
}

/**
 * An edit that adds `{ [key]: { title } }` to a translation file, so the
 * screen's `t('<key>.title')` type-checks. An existing entry is kept.
 * @param {string} path
 * @param {string} key
 * @param {string} title
 * @returns {Edit}
 */
export function addScreenTitle(path, key, title) {
  return {
    path,
    update(current) {
      /** @type {Record<string, unknown>} */
      const json = current === null ? {} : JSON.parse(current);
      const existing = json[key];
      if (existing === undefined) {
        json[key] = { title };
        return `${JSON.stringify(json, null, 2)}\n`;
      }
      const hasTitle =
        typeof existing === 'object' &&
        existing !== null &&
        'title' in existing &&
        typeof existing.title === 'string';
      if (!hasTitle) {
        throw new GeneratorError(
          `${path} already has a "${key}" entry that is not { "title": "..." }. Rename the screen or change the entry.`,
        );
      }
      return current ?? '';
    },
  };
}

/** @returns {Plan} */
export function emptyPlan() {
  return { files: [], edits: [], notes: [], hints: [] };
}
