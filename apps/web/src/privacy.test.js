import {test} from 'node:test'
import assert from 'node:assert/strict'
import {preview,sample,distanceKm} from './privacy.js'
test('aggregates and suppresses sparse cells without source metadata',()=>{const r=preview(sample());assert.deepEqual(r.receipt,{input:22,excluded:0,suppressed:10,retained:12,cells:1,repeatCoordinates:19});assert.equal(r.export.features[0].properties.point_count,12);assert.ok(!JSON.stringify(r.export).includes('synthetic'))})
test('zone excludes nearby points before aggregation',()=>{const r=preview(sample(),{zone:{lon:10.01,lat:20.01,radius:1}});assert.equal(r.receipt.excluded,12);assert.equal(r.receipt.retained,0);assert.equal(r.receipt.suppressed,10)})
test('invalid inputs fail closed',()=>{assert.throws(()=>preview('bad'));assert.throws(()=>preview(sample(),{grid:0}));assert.throws(()=>preview(sample(),{minimum:1}));assert.throws(()=>preview(sample(),{zone:{lon:181,lat:0,radius:1}}));assert.throws(()=>preview(JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[181,0]}}]})))})
test('distance handles antimeridian',()=>assert.ok(distanceKm([179.9,0],[-179.9,0])<23))
