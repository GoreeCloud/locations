import {test} from 'node:test'
import assert from 'node:assert/strict'
import {preview,sample,distanceKm} from './privacy.js'
test('aggregates and suppresses sparse cells without source metadata',()=>{const r=preview(sample());assert.deepEqual(r.receipt,{input:22,excluded:0,suppressed:10,retained:12,cells:1,repeatCoordinates:19});assert.equal(r.export.features[0].properties.point_count,12);assert.ok(!JSON.stringify(r.export).includes('synthetic'))})
test('zone excludes nearby points before aggregation',()=>{const r=preview(sample(),{zone:{lon:10.01,lat:20.01,radius:1}});assert.equal(r.receipt.excluded,12);assert.equal(r.receipt.retained,0);assert.equal(r.receipt.suppressed,10)})
test('invalid inputs fail closed',()=>{assert.throws(()=>preview('bad'));assert.throws(()=>preview(sample(),{grid:0}));assert.throws(()=>preview(sample(),{minimum:1}));assert.throws(()=>preview(sample(),{zone:{lon:181,lat:0,radius:1}}));assert.throws(()=>preview(JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[181,0]}}]})))})
test('distance handles antimeridian',()=>assert.ok(distanceKm([179.9,0],[-179.9,0])<23))
test('enhanced zone suppresses overlapping cells even when all points outside radius',()=>{
 const doc=JSON.stringify({type:'FeatureCollection',features:Array.from({length:10},()=>({type:'Feature',geometry:{type:'Point',coordinates:[10.09,20.09]}}))})
 const zone={lon:10.01,lat:20.01,radius:1}
 assert.equal(preview(doc,{zone}).receipt.retained,10)
 const r=preview(doc,{zone,protectCells:true})
 assert.equal(r.receipt.excluded,0);assert.equal(r.receipt.protectedCellPoints,10);assert.equal(r.receipt.retained,0);assert.equal(r.export.features.length,0)
})
test('enhanced zone protects across the antimeridian and conserves counts',()=>{
 const doc=JSON.stringify({type:'FeatureCollection',features:Array.from({length:10},()=>({type:'Feature',geometry:{type:'Point',coordinates:[179.95,0.05]}}))})
 const r=preview(doc,{zone:{lon:-179.99,lat:0.05,radius:2},protectCells:true})
 assert.equal(r.receipt.protectedCellPoints,10)
 assert.equal(r.receipt.input,r.receipt.excluded+r.receipt.protectedCellPoints+r.receipt.suppressed+r.receipt.retained)
})
test('route audit counts time gaps, non-increasing time and advisory speeds; never exported',()=>{
 const points=[[0,0,100],[1,0,101],[1,0,101],[0,0,null],[50,0,102]]
 const text=JSON.stringify({type:'FeatureCollection',features:points.map(([x,y,t])=>({type:'Feature',geometry:{type:'Point',coordinates:[x,y]},properties:{timestamp:t}}))})
 const r=preview(text,{auditRoute:true})
 assert.deepEqual(r.routeAudit,{timedPoints:4,untimedPoints:1,nonIncreasingTimestamps:1,highSpeedSegments:1})
 assert.ok(!JSON.stringify(r.export).includes('timestamp'));assert.ok(!JSON.stringify(r.export).includes('routeAudit'))
 assert.equal(preview(text).routeAudit,undefined)
})
import {normalizeHistory} from './history.js'
test('portable CSV preserves explicit coordinates, optional seconds and audit behavior',()=>{
 const raw='longitude,latitude,timestamp\r\n10,20,100\r\n11,20,101\r\n12,20,'
 const out=JSON.parse(normalizeHistory(raw))
 assert.equal(out.features.length,3);assert.deepEqual(out.features[0].geometry.coordinates,[10,20])
 assert.equal(out.features[0].properties.timestamp,100);assert.deepEqual(out.features[2].properties,{})
 assert.equal(preview(normalizeHistory(raw),{auditRoute:true}).routeAudit.highSpeedSegments,1)
})
test('CSV rejects ambiguous headers, invalid coordinates, units, extra columns and quoted data',()=>{
 for(const raw of ['lat,lon\n20,10','longitude,latitude\n181,0','longitude,latitude,timestamp\n10,20,1700000000000','longitude,latitude\n1,2,3','longitude,latitude\n"1",2','longitude,latitude\n,2','longitude,latitude\n1,2\n\n3,4'])assert.throws(()=>normalizeHistory(raw))
 assert.equal(normalizeHistory('longitude,latitude\n1,2').includes('timestamp'),false)
})
test('Dawarich API point array imports only coordinates and timestamps',()=>{
 const raw=JSON.stringify([{id:123,longitude:'10.5',latitude:'-20.5',timestamp:150,tracker_id:'private',raw_data:{secret:'ignored'}}])
 const out=JSON.parse(normalizeHistory(raw))
 assert.deepEqual(out,{type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[10.5,-20.5]},properties:{timestamp:150}}]})
 assert.equal(preview(normalizeHistory(raw),{auditRoute:true}).routeAudit.timedPoints,1)
})
test('Dawarich array rejects malformed or ambiguous point data',()=>{
 for(const row of [{longitude:'',latitude:'0',timestamp:100},{longitude:'0',latitude:'NaN',timestamp:100},{longitude:0,latitude:0,timestamp:'100'},{longitude:0,latitude:0,timestamp:1700000000000},{longitude:181,latitude:0,timestamp:100},null]) assert.throws(()=>normalizeHistory(JSON.stringify([row])))
})
import {historyPath,validateServerHistory,fetchHistory} from './server_history.js'
test('server history uses bounded same-origin path and minimal point payload',()=>{
 assert.equal(historyPath('100','200'),'/api/v1/privacy_history?start_at=100&end_at=200')
 for(const [a,b] of [['0','3000000'],['200','100'],['1x','200'],['100','1700000000000']])assert.throws(()=>historyPath(a,b))
 const raw=JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[10,20]},properties:{timestamp:150,private:'discard'},id:1}]})
 assert.deepEqual(JSON.parse(validateServerHistory(raw)).features[0],{type:'Feature',geometry:{type:'Point',coordinates:[10,20]},properties:{timestamp:150}})
})
test('explicit server retrieval blocks redirects and cookies and rejects invalid responses',async()=>{
 const key='a'.repeat(64), raw='{"type":"FeatureCollection","features":[]}'
 const result=await fetchHistory('100','200',key,{fetcher:async(path,opts)=>{assert.equal(path,'/api/v1/privacy_history?start_at=100&end_at=200');assert.equal(opts.credentials,'omit');assert.equal(opts.redirect,'error');assert.equal(opts.headers.Authorization,'Bearer '+key);return new Response(raw,{headers:{'content-type':'application/geo+json'}})}})
 assert.equal(result,raw)
 await assert.rejects(()=>fetchHistory('100','200',key,{fetcher:async()=>new Response(raw,{headers:{'content-type':'text/html'}})}))
 await assert.rejects(()=>fetchHistory('100','200','bad',{fetcher:()=>assert.fail('network called')}))
})
