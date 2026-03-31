const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../expressApp');

describe('HTTP API smoke', () => {
  test('GET /health returns ok', async () => {
    const res = await request(app).get('/health').expect(200);
    assert.equal(res.body.status, 'ok');
  });

  test('CORS rejects unknown Origin', async () => {
    await request(app).get('/health').set('Origin', 'https://evil.example').expect(500);
  });

  test('CORS allows configured origin', async () => {
    const origin = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',')[0].trim();
    await request(app).get('/health').set('Origin', origin).expect(200);
  });
});
