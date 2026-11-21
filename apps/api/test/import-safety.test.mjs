import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  privateApiBase, privateBearerToken, readJsonFileBounded,
  readJsonResponseBounded, submitBatch
} from '../../../scripts/import-utils.mjs';

const token = 'A1a9F0b2_C3D4e5F6g7H8i9J0k1L2m3N4o5P6q7';
test('import destination URL requires private HTTPS or explicit loopback HTTP', () => {
  assert.equal(privateApiBase('https://locations.example.invalid/api'),'https://locations.example.invalid/api');
  assert.equal(privateApiBase('http://127.0.0.1:8080/api'),'http://127.0.0.1:8080/api');
  assert.equal(privateApiBase('http://localhost:8080/api/'),'http://localhost:8080/api');
  for (const invalid of [
    'http://192.0.2.14/api', 'http://locations.example.invalid/api',
    'ftp://locations.example.invalid/api', 'https://user:pw@example.invalid/api',
    'https://locations.example.invalid/api?token=x', 'https://locations.example.invalid/api#fragment',
    'https://locations.example.invalid/not-api', 'javascript:alert(1)', ''
  ]) assert.throws(() => privateApiBase(invalid),Error,invalid);
});
test('import token syntax validates without printing secrets', () => {
  assert.equal(privateBearerToken(token),token);
  for (const invalid of ['', 'token', 'bearer?query', 'A'.repeat(129), 'A'.repeat(20), null, {}]) {
    assert.throws(() => privateBearerToken(invalid),Error);
  }
});

test('size-bounded regular file parser rejects oversized and malformed JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(),'gclocations-import-limits-'));
  try {
    const file = join(dir,'data.json');
    await writeFile(file,JSON.stringify({type:'FeatureCollection',features:[]}),{mode:0o600});
    assert.deepEqual((await readJsonFileBounded(file)).features,[]);
    await assert.rejects(readJsonFileBounded(file,12),/size limit|permitted size/);
    await writeFile(file,'{bad json');
    await assert.rejects(readJsonFileBounded(file),SyntaxError);
  } finally {
    await rm(dir,{recursive:true,force:true});
  }
});

test('remote response size guard checks declared length and streamed bytes', async () => {
  const large = JSON.stringify({positions:Array(80).fill(1)});
  await assert.rejects(
    readJsonResponseBounded(new Response(large,{headers:{'content-length':'10000'}}),64),
    /size/
  );
  await assert.rejects(readJsonResponseBounded(new Response(large),64),/size/);
  assert.deepEqual(await readJsonResponseBounded(new Response('[1,2,3]')), [1,2,3]);
});

test('bounded submission validates response and rejects cross-origin HTTP redirects', async () => {
  let route = 'ok';
  let seen = 0;
  const server = createServer(async (req,res) => {
    seen++;
    const chunks=[];
    for await (const chunk of req) chunks.push(chunk);
    assert.equal(req.headers.authorization,'Bearer '+token);
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    assert.equal(input.positions.length,1);
    res.setHeader('content-type','application/json');
    if (route === 'redirect') {
      res.writeHead(302,{location:'https://example.invalid/steal'}).end(); return;
    }
    if (route === 'invalid') {
      res.writeHead(200).end(JSON.stringify({accepted:999})); return;
    }
    if (route === 'rejected') {
      res.writeHead(403).end(JSON.stringify({error:'secret-should-not-log'})); return;
    }
    res.writeHead(201).end(JSON.stringify({accepted:1,duplicates:0}));
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const api = 'http://127.0.0.1:'+server.address().port+'/api';
  const sample = {latitude:32.7,longitude:-86.7,capturedAt:'2026-11-20T00:00:00Z'};
  try {
    assert.equal(await submitBatch(api,token,[sample]),1);
    route='invalid';
    await assert.rejects(submitBatch(api,token,[sample]),/acknowledgement/);
    route='rejected';
    await assert.rejects(submitBatch(api,token,[sample]),/HTTP 403/);
    route='redirect';
    await assert.rejects(submitBatch(api,token,[sample]));
    assert.equal(seen,4);
    await assert.rejects(submitBatch(api,token,Array(251).fill(sample)),/batch size/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
