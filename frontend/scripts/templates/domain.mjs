// @ts-check
import { GeneratorError, pluralize } from './shared.mjs';

/**
 * @param {import('./shared.mjs').Context} ctx
 * @returns {import('./shared.mjs').Plan}
 */
export function plan(ctx) {
  if (ctx.module !== undefined) {
    throw new GeneratorError(
      'A domain lives in the shared api and queries layers, not in a module.',
    );
  }
  const { kebab, pascal, camel } = ctx.names;
  const path = `/${pluralize(kebab)}`;
  const api = `src/api/${kebab}`;
  const queries = `src/queries/${kebab}`;

  return {
    files: [
      { path: `${api}/${kebab}.api.ts`, content: apiFile(pascal, camel, path) },
      {
        path: `${api}/${kebab}.api.test.ts`,
        content: apiTest(pascal, camel, kebab, path),
      },
      {
        path: `${api}/index.ts`,
        content: `export { ${camel}Api } from './${kebab}.api';\nexport type { Create${pascal}Request, ${pascal} } from './${kebab}.api';\n`,
      },
      {
        path: `${queries}/${kebab}.queries.ts`,
        content: queriesFile(pascal, camel, kebab),
      },
      {
        path: `${queries}/${kebab}.queries.test.tsx`,
        content: queriesTest(pascal, camel, kebab),
      },
      {
        path: `${queries}/${kebab}.mutations.ts`,
        content: mutationsFile(pascal, camel, kebab),
      },
      {
        path: `${queries}/${kebab}.mutations.test.tsx`,
        content: mutationsTest(pascal, camel, kebab),
      },
      {
        path: `${queries}/index.ts`,
        content: `export {\n  ${camel}DetailQueryOptions,\n  ${camel}Keys,\n  ${camel}ListQueryOptions,\n} from './${kebab}.queries';\nexport { useCreate${pascal}Mutation } from './${kebab}.mutations';\n`,
      },
    ],
    edits: [],
    notes: [],
    hints: [
      `The ${camel} api uses placeholder schemas defined in ${api}/${kebab}.api.ts.`,
      `Replace them (and ${path}) with the schemas and types from @airremote/contracts once the backend defines them; the contract is the source of the types.`,
      `Call the queries and mutations from hooks (src/hooks) or screens; they don't know about stores or the UI.`,
    ],
  };
}

/**
 * @param {string} pascal
 * @param {string} camel
 * @param {string} path
 */
export function apiFile(pascal, camel, path) {
  return `import { z } from 'zod';

import type { RequestOptions } from '@app-types';
import { httpClient } from '@api/http-client';

// Placeholder shapes. Replace them with the schemas and types from
// @airremote/contracts, which the backend defines.
const ${camel}Schema = z.object({
  id: z.string(),
  name: z.string(),
});
const ${camel}ListSchema = z.array(${camel}Schema);

export type ${pascal} = z.infer<typeof ${camel}Schema>;
export type Create${pascal}Request = { name: string };

export const ${camel}Api = {
  /** Reads take the request options so TanStack Query can cancel them. */
  list(options?: RequestOptions): Promise<${pascal}[]> {
    return httpClient.get('${path}', ${camel}ListSchema, options);
  },

  get(id: string, options?: RequestOptions): Promise<${pascal}> {
    return httpClient.get(
      \`${path}/\${encodeURIComponent(id)}\`,
      ${camel}Schema,
      options,
    );
  },

  create(body: Create${pascal}Request): Promise<${pascal}> {
    return httpClient.post('${path}', body, ${camel}Schema);
  },
};
`;
}

/**
 * @param {string} pascal
 * @param {string} camel
 * @param {string} kebab
 * @param {string} path
 */
export function apiTest(pascal, camel, kebab, path) {
  return `import { httpClient } from '@api/http-client';

import { ${camel}Api, type ${pascal} } from './${kebab}.api';

jest.mock('@api/http-client', () => ({
  httpClient: { get: jest.fn(), post: jest.fn() },
}));

const get = jest.mocked(httpClient.get);
const post = jest.mocked(httpClient.post);
const item: ${pascal} = { id: 'a1', name: 'First' };

describe('${camel}Api', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  it('lists, passing the request options on', async () => {
    get.mockResolvedValueOnce([item]);
    const { signal } = new AbortController();

    await expect(${camel}Api.list({ signal })).resolves.toEqual([item]);
    expect(get).toHaveBeenCalledWith('${path}', expect.anything(), { signal });
  });

  it('gets one by id', async () => {
    get.mockResolvedValueOnce(item);

    await expect(${camel}Api.get('a/1')).resolves.toBe(item);
    expect(get).toHaveBeenCalledWith(
      '${path}/a%2F1',
      expect.anything(),
      undefined,
    );
  });

  it('creates from the request body', async () => {
    post.mockResolvedValueOnce(item);
    const body = { name: 'First' };

    await expect(${camel}Api.create(body)).resolves.toBe(item);
    expect(post).toHaveBeenCalledWith('${path}', body, expect.anything());
  });

  it('passes the client rejection through', async () => {
    const apiError = {
      status: 404,
      code: 'NOT_FOUND',
      message: 'Not found',
      isNetworkError: false,
    };
    get.mockRejectedValueOnce(apiError);

    await expect(${camel}Api.get('missing')).rejects.toBe(apiError);
  });
});
`;
}

/**
 * @param {string} pascal
 * @param {string} camel
 * @param {string} kebab
 */
export function queriesFile(pascal, camel, kebab) {
  return `import { queryOptions } from '@tanstack/react-query';

import { ${camel}Api } from '@api/${kebab}';

export const ${camel}Keys = {
  all: ['${kebab}'] as const,
  lists: () => [...${camel}Keys.all, 'list'] as const,
  detail: (id: string) => [...${camel}Keys.all, 'detail', id] as const,
};

/** Passes TanStack Query's \`signal\` on, so a query nobody needs any more is cancelled. */
export const ${camel}ListQueryOptions = () =>
  queryOptions({
    queryKey: ${camel}Keys.lists(),
    queryFn: ({ signal }) => ${camel}Api.list({ signal }),
  });

export const ${camel}DetailQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ${camel}Keys.detail(id),
    queryFn: ({ signal }) => ${camel}Api.get(id, { signal }),
  });
`;
}

/**
 * @param {string} pascal
 * @param {string} camel
 * @param {string} kebab
 */
export function queriesTest(pascal, camel, kebab) {
  return `import { useQuery } from '@tanstack/react-query';

import { createQueryWrapper, renderHook, waitFor } from '@utils/tests';
import { ${camel}Api, type ${pascal} } from '@api/${kebab}';

import {
  ${camel}DetailQueryOptions,
  ${camel}Keys,
  ${camel}ListQueryOptions,
} from './${kebab}.queries';

jest.mock('@api/${kebab}');

const api = jest.mocked(${camel}Api);
const item: ${pascal} = { id: 'a1', name: 'First' };

beforeEach(() => {
  jest.resetAllMocks();
});

describe('${camel}Keys', () => {
  it('nests every key under the domain', () => {
    expect(${camel}Keys.lists()).toEqual(['${kebab}', 'list']);
    expect(${camel}Keys.detail('a1')).toEqual(['${kebab}', 'detail', 'a1']);
  });
});

describe('${camel} queries', () => {
  it('loads the list, passing the cancellation signal on', async () => {
    api.list.mockResolvedValueOnce([item]);

    const { result } = await renderHook(
      () => useQuery(${camel}ListQueryOptions()),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual([item]);
    expect(api.list).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
  });

  it('loads one by id, passing the cancellation signal on', async () => {
    api.get.mockResolvedValueOnce(item);

    const { result } = await renderHook(
      () => useQuery(${camel}DetailQueryOptions('a1')),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toBe(item);
    expect(api.get).toHaveBeenCalledWith('a1', {
      signal: expect.any(AbortSignal),
    });
  });
});
`;
}

/**
 * @param {string} pascal
 * @param {string} camel
 * @param {string} kebab
 */
export function mutationsFile(pascal, camel, kebab) {
  return `import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ${camel}Api, type Create${pascal}Request } from '@api/${kebab}';

import { ${camel}Keys } from './${kebab}.queries';

/** Creates one and refreshes the lists, which now miss it. */
export function useCreate${pascal}Mutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...${camel}Keys.all, 'create'],
    mutationFn: (body: Create${pascal}Request) => ${camel}Api.create(body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ${camel}Keys.lists() }),
  });
}
`;
}

/**
 * @param {string} pascal
 * @param {string} camel
 * @param {string} kebab
 */
export function mutationsTest(pascal, camel, kebab) {
  return `import type { ApiError } from '@app-types';
import {
  createQueryWrapper,
  createTestQueryClient,
  renderHook,
  waitFor,
} from '@utils/tests';
import { ${camel}Api, type ${pascal} } from '@api/${kebab}';

import { useCreate${pascal}Mutation } from './${kebab}.mutations';
import { ${camel}Keys } from './${kebab}.queries';

jest.mock('@api/${kebab}');

const api = jest.mocked(${camel}Api);
const created: ${pascal} = { id: 'a1', name: 'First' };

beforeEach(() => {
  jest.resetAllMocks();
});

describe('useCreate${pascal}Mutation', () => {
  it('creates from the request body', async () => {
    api.create.mockResolvedValueOnce(created);

    const { result } = await renderHook(() => useCreate${pascal}Mutation(), {
      wrapper: createQueryWrapper(),
    });
    result.current.mutate({ name: 'First' });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(api.create).toHaveBeenCalledWith({ name: 'First' });
    expect(result.current.data).toBe(created);
  });

  it('marks the cached lists stale after creating', async () => {
    api.create.mockResolvedValueOnce(created);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(${camel}Keys.lists(), []);

    const { result } = await renderHook(() => useCreate${pascal}Mutation(), {
      wrapper: createQueryWrapper(queryClient),
    });
    result.current.mutate({ name: 'First' });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(queryClient.getQueryState(${camel}Keys.lists())?.isInvalidated).toBe(
      true,
    );
  });

  it('exposes the ApiError of a rejected create', async () => {
    const apiError: ApiError = {
      status: 400,
      code: 'BAD_REQUEST',
      message: 'Bad request',
      isNetworkError: false,
    };
    api.create.mockRejectedValueOnce(apiError);

    const { result } = await renderHook(() => useCreate${pascal}Mutation(), {
      wrapper: createQueryWrapper(),
    });
    result.current.mutate({ name: '' });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).toBe(apiError);
  });
});
`;
}
