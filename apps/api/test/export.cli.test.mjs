import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const script = fileURLToPath(new URL('../../../scripts/export-geojson.mjs', import.meta.url));
const token = 'synthetic-export-session-only-no-private-data';
const fix = (id, lat) => ({
  type:'Feature',
  id:String(id),
  geometry:{type:'Point', coordinates:[-86.6,lat]},
  properties:{source:'synthetic',capturedAt:'2026-11-20T10:00:00.000Z'}
});
test('private GeoJSON CLI handles bounded pages, exclusive file publication, and partial-failure cleanup', async () => {
  let failSecondPage = false;
  const server = createServer((req,res) => {
    res.setHeader('content-type','application/json');
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.headers.authorization !== 'Bearer '+token ||
        url.pathname !== '/api/v1/export/geojson/page') {
      res.writeHead(401).end(JSON.stringify({error:'unauthorized'})); return;
    }
    const cursor = url.searchParams.get('beforeId');
    if (failSecondPage && cursor) {
      res.writeHead(503).end(JSON.stringify({error:'synthetic failure'})); return;
    }
    const data = cursor === null ?
      {type:'FeatureCollection',features:[fix(10,32.7),fix(9,32.8)],hasMore:true,nextBeforeId:'9'} :
      {type:'FeatureCollection',features:[fix(8,32.9)],hasMore:false,nextBeforeId:null};
    res.writeHead(200).end(JSON.stringify(data));
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const dir = await mkdtemp(join(tmpdir(),'gclocations-export-cli-test-'));
  const env = { ...process.env, EXPORT_API_TOKEN:token,
    API_URL:'http://127.0.0.1:'+server.address().port+'/api', EXPORT_PAGE_SIZE:'2' };
  async function run(output) {
    try {
      const x=await exec(process.execPath,[script,output],{env,timeout:12000});
      return {code:0,stdout:x.stdout,stderr:x.stderr};
    } catch (e) {
      return {code:e.code ?? -1,stdout:e.stdout||'',stderr:e.stderr||''};
    }
  }
  try {
    const out=join(dir,'private-export.geojson');
    const result=await run(out);
    assert.equal(result.code,0,result.stderr);
    assert.match(result.stdout,/Exported 3 private location records/);
    const raw=JSON.parse(await readFile(out,'utf8'));
    assert.equal(raw.type,'FeatureCollection');
    assert.deepEqual(raw.features.map(p=>p.id),['10','9','8']);
    assert.equal((await stat(out)).mode & 0o777,0o600);
    // If a file already exists, the CLI may not replace it; neither output nor token leaks.
    const blocked=await run(out);
    assert.notEqual(blocked.code,0);
    assert.deepEqual((await readFile(out,'utf8')).startsWith('{"type":"FeatureCollection"'),true);
    assert.equal(blocked.stderr.includes(token),false);
    failSecondPage = true;
    const failedFile=join(dir,'incomplete.geojson');
    const failed=await run(failedFile);
    assert.notEqual(failed.code,0);
    assert.match(failed.stderr,/HTTP 503/);
    assert.equal(failed.stderr.includes(token),false);
    const remaining=await readdir(dir);
    assert.deepEqual(remaining,['private-export.geojson']);
  } finally {
    await new Promise(resolve=>server.close(resolve));
    await rm(dir,{recursive:true,force:true});
  }
});
