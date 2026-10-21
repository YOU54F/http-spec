import { setSkipHashing } from '../../hash';
import { getOperationObject, isOas3_2 } from '../../oas/operation';
import { transformOas3Operations, transformOas3WebhookOperations } from '../operation';
import * as oas32 from './fixtures/oas3_2-methods.json';

setSkipHashing(true);

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe('OpenAPI 3.2', () => {
  it('detects 3.2 documents', () => {
    expect(isOas3_2({ openapi: '3.2.0' })).toBe(true);
    expect(isOas3_2({ openapi: '3.2' })).toBe(true);
    expect(isOas3_2({ openapi: '3.1.0' })).toBe(false);
    expect(isOas3_2({ swagger: '2.0' })).toBe(false);
  });

  it('maps the query method and additionalOperations (lowercased) to operations', () => {
    const operations = transformOas3Operations(clone(oas32) as any);
    expect(operations.map(op => [op.method, op.iid])).toEqual([
      ['get', 'getSearch'],
      ['query', 'querySearch'],
      ['copy', 'copySearch'],
    ]);
  });

  it('translates the query operation request body and responses', () => {
    const query = transformOas3Operations(clone(oas32) as any).find(op => op.method === 'query')!;
    expect(query.path).toBe('/search');
    expect(query.tags!.map(t => t.name)).toEqual(['search']);
    expect(query.request?.body?.contents?.[0]).toMatchObject({ mediaType: 'application/json' });
    expect(query.responses[0]).toMatchObject({ code: '200', description: 'results' });
  });

  it('translates custom additionalOperations', () => {
    const copy = transformOas3Operations(clone(oas32) as any).find(op => op.method === 'copy')!;
    expect(copy).toMatchObject({ deprecated: true, iid: 'copySearch', path: '/search' });
    expect(copy.responses.map(r => r.code)).toEqual(['201']);
  });

  it('ignores querystring parameters (no slot in IHttpOperationRequest yet) without failing', () => {
    const get = transformOas3Operations(clone(oas32) as any).find(op => op.method === 'get')!;
    expect(get.request?.query).toEqual([]);
  });

  it('maps query on webhooks', () => {
    const webhooks = transformOas3WebhookOperations(clone(oas32) as any);
    expect(webhooks.map(w => [w.method, w.iid])).toEqual([['query', 'webhookQuery']]);
  });

  it('does not treat query / additionalOperations as methods in 3.0 / 3.1 documents', () => {
    for (const openapi of ['3.0.3', '3.1.0']) {
      const operations = transformOas3Operations({ ...clone(oas32), openapi } as any);
      expect(operations.map(op => op.method)).toEqual(['get']);
    }
  });

  it('maps query and additionalOperations inside callbacks', () => {
    const doc: any = {
      openapi: '3.2.0',
      info: { title: '', version: '1' },
      paths: {
        '/subscribe': {
          post: {
            responses: { '200': { description: 'ok' } },
            callbacks: {
              onEvent: {
                '{$request.body#/url}': {
                  query: { responses: { '200': { description: 'ok' } } },
                  additionalOperations: { PURGE: { responses: { '204': { description: 'gone' } } } },
                },
              },
            },
          },
        },
      },
    };
    const [op] = transformOas3Operations(doc);
    expect(op.callbacks?.map(cb => ('method' in cb ? cb.method : undefined))).toEqual(['query', 'purge']);
  });

  it('getOperationObject resolves additionalOperations case-insensitively', () => {
    const pathItem = { get: { a: 1 }, additionalOperations: { COPY: { b: 2 } } };
    expect(getOperationObject(pathItem, 'get')).toEqual({ a: 1 });
    expect(getOperationObject(pathItem, 'copy')).toEqual({ b: 2 });
    expect(getOperationObject(pathItem, 'move')).toBeUndefined();
    expect(getOperationObject(pathItem, 'additionalOperations')).toBeUndefined();
  });
});
