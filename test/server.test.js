const fs = require('fs');
const os = require('os');
const path = require('path');

// Stub os.homedir() so every file-mutation route is sandboxed away from the real
// filesystem. (Setting process.env.HOME doesn't work: Jest hands tests a copy of
// process.env, while os.homedir() reads the real environment.) Must happen before
// requiring server.js, since userHomeDir is captured at module load time.
const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'web-terminal-test-'));
jest.spyOn(os, 'homedir').mockReturnValue(testHome);
process.env.AUTH_USER = 'testuser';
process.env.AUTH_PASS = 'testpass';

const request = require('supertest');
const app = require('../server');

const AUTH = ['testuser', 'testpass'];

afterAll(() => {
    fs.rmSync(testHome, { recursive: true, force: true });
});

describe('auth', () => {
    test('rejects requests with no credentials', async () => {
        const res = await request(app).get('/files');
        expect(res.status).toBe(401);
    });

    test('rejects wrong credentials', async () => {
        const res = await request(app).get('/files').auth('wrong', 'creds');
        expect(res.status).toBe(401);
    });

    test('accepts correct credentials', async () => {
        const res = await request(app).get('/files').auth(...AUTH);
        expect(res.status).toBe(200);
    });
});

describe('path traversal', () => {
    test('rejects ../ escape on /files', async () => {
        const res = await request(app).get('/files').query({ path: '../' }).auth(...AUTH);
        expect(res.status).toBe(403);
    });

    test('rejects ../ escape on /create-folder', async () => {
        const res = await request(app)
            .post('/create-folder')
            .type('form')
            .send({ path: '../escaped-dir' })
            .auth(...AUTH);
        expect(res.status).toBe(403);
        expect(fs.existsSync(path.join(testHome, '..', 'escaped-dir'))).toBe(false);
    });

    test('rejects a sibling directory that merely shares a name prefix', async () => {
        // Regression test: startsWith(userHomeDir) would wrongly treat
        // `${testHome}-evil` as contained within testHome.
        const siblingWithSharedPrefix = `${testHome}-evil`;
        const res = await request(app)
            .get('/files')
            .query({ path: path.relative(testHome, siblingWithSharedPrefix) })
            .auth(...AUTH);
        expect(res.status).toBe(403);
    });
});

describe('file mutation happy path', () => {
    test('create-folder -> files list -> delete-item round trip', async () => {
        const create = await request(app)
            .post('/create-folder')
            .type('form')
            .send({ path: 'roundtrip-test' })
            .auth(...AUTH);
        expect(create.status).toBe(200);
        expect(create.headers['hx-trigger']).toBe('file-list-changed');

        const list = await request(app).get('/files').auth(...AUTH);
        expect(list.status).toBe(200);
        expect(list.text).toContain('roundtrip-test');

        const del = await request(app)
            .post('/delete-item')
            .type('form')
            .send({ path: 'roundtrip-test' })
            .auth(...AUTH);
        expect(del.status).toBe(200);
        expect(del.headers['hx-trigger']).toBe('file-list-changed');
        expect(fs.existsSync(path.join(testHome, 'roundtrip-test'))).toBe(false);
    });

    test('failed mutation does not set HX-Trigger', async () => {
        const res = await request(app)
            .post('/rename-item')
            .type('form')
            .send({ oldPath: 'does-not-exist', newPath: 'still-does-not-exist' })
            .auth(...AUTH);
        expect(res.status).toBe(500);
        expect(res.headers['hx-trigger']).toBeUndefined();
    });
});

describe('global error handler', () => {
    test('an uncaught exception returns a generic message, no stack trace', async () => {
        const res = await request(app)
            .post('/create-folder')
            .type('form')
            .send({ 'path[]': ['a', 'b'] }) // array body forces path.resolve to throw
            .auth(...AUTH);
        expect(res.status).toBe(500);
        expect(res.text).toBe('Internal server error.');
        expect(res.text).not.toMatch(/at .*\.js:\d+/); // no stack trace leaked
    });
});

describe('upload', () => {
    test('moves an over-200MB-default-sized file into the destination and cleans up temp', async () => {
        const big = Buffer.alloc(201 * 1024 * 1024); // above the old 200MB default cap
        const res = await request(app).post('/upload').auth(...AUTH)
            .field('destination', 'uploads')
            .attach('file', big, 'big.bin');
        expect(res.status).toBe(200);
        expect(fs.statSync(path.join(testHome, 'uploads', 'big.bin')).size).toBe(big.length);
        expect(fs.readdirSync(path.join(testHome, '.cache', 'web_terminal_uploads'))).toEqual([]);
    }, 30000);
});
