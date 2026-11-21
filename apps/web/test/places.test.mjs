import test from 'node:test';
import assert from 'node:assert/strict';
import { privatePlaceBody } from '../src/places.mjs';

test('account private place form returns only supported JSON fields', () => {
  assert.deepEqual(privatePlaceBody('  Own favorite spot ', '33.512', '-86.792', '250'),{
    name:'Own favorite spot',latitude:33.512,longitude:-86.792,radiusMeters:250
  });
});
test('saved place form rejects unbounded radius, invalid labels or coordinates',()=>{
  const errors=[
    ['', '33','-86','250'],
    ['x'.repeat(81),'33','-86','250'],
    ['new\nline','33','-86','250'],
    ['Home','91','0','250'],
    ['Home','32','-181','250'],
    ['Home','32','-86','25000'],
    ['Home','32','-86','0'],
    ['Home','not-coordinates','-86','250']
  ];
  for (const args of errors) assert.throws(()=>privatePlaceBody(...args),Error);
});
