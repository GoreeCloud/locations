import test from 'node:test';
import assert from 'node:assert/strict';
import { privatePlaceInput } from '../src/places.mjs';
import { HttpError } from '../src/security.mjs';

test('personal place names and coordinates are normalized without geocoding', () => {
  assert.deepEqual(privatePlaceInput({name:'  Home  ',latitude:33.51,longitude:-86.8}),{
    name:'Home',latitude:33.51,longitude:-86.8,radiusMeters:125
  });
  assert.deepEqual(privatePlaceInput({name:'Green space',latitude:90,longitude:-180,radiusMeters:5000}),{
    name:'Green space',latitude:90,longitude:-180,radiusMeters:5000
  });
});
test('invalid names, radius and out-of-range or nonnumeric location input fail closed', () => {
  const baseline={name:'Personal location',latitude:33.51,longitude:-86.8};
  const invalid=[
    {name:''},{name:' '.repeat(81)},{name:'name\nline'},{name:34},
    {latitude:NaN},{latitude:91},{latitude:'33.51'},{longitude:-181},
    {longitude:Infinity},{radiusMeters:0},{radiusMeters:5001},
    {radiusMeters:12.5},{radiusMeters:'200'},{userId:'other-person'},
    {circleId:'other-circle'}
  ];
  for(const item of invalid) {
    assert.throws(()=>privatePlaceInput({...baseline,...item}),e=>e instanceof HttpError && e.status===400);
  }
  assert.throws(()=>privatePlaceInput([]),HttpError);
  assert.throws(()=>privatePlaceInput(null),HttpError);
});
