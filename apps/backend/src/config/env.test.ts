import { describe, expect, test } from 'bun:test';
import { resolveBackendPort } from './env';

describe('resolveBackendPort', () => {
    test('defaults to 4243 in development even when PORT is set', () => {
        expect(resolveBackendPort({ NODE_ENV: 'development', PORT: '3001' })).toBe(4243);
    });

    test('uses backend-specific env vars in development', () => {
        expect(
            resolveBackendPort({
                NODE_ENV: 'development',
                PORT: '3001',
                BACKEND_PORT: '5000',
            }),
        ).toBe(5000);

        expect(
            resolveBackendPort({
                NODE_ENV: 'development',
                PORT: '3001',
                BACKEND_PORT: '5000',
                AURELIUS_BACKEND_PORT: '6000',
            }),
        ).toBe(6000);
    });

    test('still honors generic PORT in production', () => {
        expect(resolveBackendPort({ NODE_ENV: 'production', PORT: '3001' })).toBe(3001);
    });
});