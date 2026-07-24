// @vitest-environment node
/**
 * Liveness and readiness answer different questions, and conflating them is how a
 * dependency's outage becomes an outage of our own: if `/health/live` consults the database,
 * Cloud Run kills the container every time Postgres blips. These tests hold that line.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { Binding } from '../../src/core/logistics/binding.js';
import { FakeRepository } from '../../src/db/fake-repository.js';
import { createServer } from '../../src/server.js';

/** Health never speaks to a platform, so this binding exists only to satisfy the type. */
const silentBinding: Binding = {
  key: 'test',
  send: async () => {},
  establishFace: async () => ({ credential: 'x' }),
  adoptFace: async () => {},
  retireFace: async () => {},
};
const serve = (repo: FakeRepository) =>
  createServer({ repo, binding: silentBinding, applicationId: 'app-1' });

describe('health', () => {
  it('reports live while the process is running', async () => {
    const app = serve(new FakeRepository());
    const res = await request(app).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ live: true });
  });

  it('reports ready when the store is reachable', async () => {
    const app = serve(new FakeRepository());
    const res = await request(app).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
  });

  it('stays LIVE when the store is unreachable, while readiness drops', async () => {
    const repo = new FakeRepository();
    repo.unavailable = true;
    const app = serve(repo);

    const live = await request(app).get('/health/live');
    expect(live.status, 'liveness must not consult the store').toBe(200);

    const ready = await request(app).get('/health/ready');
    expect(ready.status).toBe(503);
    expect(ready.body.ready).toBe(false);
  });

  it('names a subsystem in the readiness reason, never a credential or a tenant', async () => {
    const repo = new FakeRepository();
    repo.unavailable = true;
    const res = await request(serve(repo)).get('/health/ready');
    expect(res.body.reason).toBe('store unreachable');
    expect(JSON.stringify(res.body)).not.toMatch(/postgres:\/\/|token|secret/i);
  });
});
