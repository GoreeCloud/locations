import test from 'node:test';
import assert from 'node:assert/strict';
import { nearbyBody } from '../src/nearby.mjs';

test('private vicinity request puts finite numbers in a bounded JSON body', () => {
  assert.deepEqual(nearbyBody('32.7','-86.7','1000'), {
    latitude:32.7, longitude:-86.7, radiusMeters:1000, limit:100
  });
  assert.deepEqual(nearbyBody('-90','180','250'), {
    latitude:-90, longitude:180, radiusMeters:250, limit:100
  });
});

test('missing, malicious, nonfinite and out-of-range coordinates fail before network calls', () => {
  for (const latitude of ['', ' ', '91', '-90.0001', 'Infinity', 'NaN', '1e2',
    '0?token=abc', '1;DROP TABLE', 'abc', '1.23456789012']) {
    assert.throws(() => nearbyBody(latitude,'0','1000'),Error,latitude);
  }
  for (const longitude of ['', '-181','180.01','NaN','http://example.invalid','Infinity']) {
    assert.throws(() => nearbyBody('0',longitude,'1000'),Error,longitude);
  }
});

test('only explicitly offered distance options are accepted', () => {
  for (const radius of ['0','100','25001','-1','10000','1e3','NaN','']) {
    assert.throws(() => nearbyBody('0','0',radius),Error,radius);
  }
  for (const radius of ['250','1000','5000','25000']) {
    assert.equal(nearbyBody('0','0',radius).radiusMeters,Number(radius));
  }
});
