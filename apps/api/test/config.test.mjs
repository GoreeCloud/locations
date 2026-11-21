import test from 'node:test';
import assert from 'node:assert/strict';
import { checkConfiguration } from '../../../scripts/verify-config.mjs';

const valid = {
  POSTGRES_PASSWORD:'db-' + 'f8A6_-e91R7a4M2g6T8w0H9B1p3R4Y5x',
  BOOTSTRAP_TOKEN:'owner-' + '9F4u_K7t0B1aZ8p6c2Q3d5E7g0R9w2',
  PORT:'8080',
  NODE_ENV:'production',
  WEB_ORIGIN:'https://locations.example.invalid'
};

test('strong independent secrets, HTTPS and valid port pass without disclosure', () => {
  assert.deepEqual(checkConfiguration(valid),[]);
  assert.deepEqual(checkConfiguration({...valid, WEB_ORIGIN:''}),[]);
});

test('operator preflight rejects placeholders, common and URI-breaking secrets', () => {
  for (const changes of [
    { POSTGRES_PASSWORD:'REPLACE_WITH_UNIQUE_RANDOM_DB_PASSWORD' },
    { BOOTSTRAP_TOKEN:'CHANGEME_fake_value_1234567890123456789' },
    { POSTGRES_PASSWORD:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    { POSTGRES_PASSWORD:valid.BOOTSTRAP_TOKEN },
    { POSTGRES_PASSWORD:'a:b/@#&x'.repeat(6) },
    { BOOTSTRAP_TOKEN:'' }
  ]) assert.ok(checkConfiguration({...valid,...changes}).length>0);
});

test('operator preflight forbids nonloopback HTTP or smuggled URL components', () => {
  for (const url of [
    'http://example.invalid','http://192.168.1.2:5173','http://localhost:5173',
    'https://user:pw@example.invalid','https://example.invalid/path',
    'https://example.invalid?token=fake','https://example.invalid#fragment',
    'https://example.invalid/'
  ]) assert.ok(checkConfiguration({...valid, WEB_ORIGIN:url}).length>0, url);
  assert.deepEqual(checkConfiguration({...valid,NODE_ENV:'development',WEB_ORIGIN:'http://localhost:5173'}),[]);
});

test('invalid TCP port and secret lengths fail in closed form', () => {
  for (const port of ['0','65536','NaN','1.2','-1','','123456']) {
    assert.ok(checkConfiguration({...valid,PORT:port}).length>0,port);
  }
  assert.ok(checkConfiguration({...valid,POSTGRES_PASSWORD:'short'}).length>0);
});
