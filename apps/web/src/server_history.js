// Explicit same-origin read-only history retrieval. No redirects, cookies, storage or telemetry.
const MAX_BYTES=8*1024*1024, MAX_POINTS=20000, MAX_SECONDS=31*86400
export function historyPath(start,end){
 if(!/^\d{1,10}$/.test(start)||!/^\d{1,10}$/.test(end)||+start>=+end||+end>4102444800||+end-+start>MAX_SECONDS)throw Error('Invalid time range')
 return '/api/v1/privacy_history?'+new URLSearchParams({start_at:start,end_at:end})
}
export function validateServerHistory(raw){
 const doc=JSON.parse(raw)
 if(doc?.type!=='FeatureCollection'||!Array.isArray(doc.features)||doc.features.length>MAX_POINTS)throw Error('Invalid history')
 const features=doc.features.map(f=>{
  const c=f?.geometry?.coordinates,t=f?.properties?.timestamp
  if(f?.type!=='Feature'||f.geometry.type!=='Point'||!Array.isArray(c)||c.length!==2||!c.every(Number.isFinite)||Math.abs(c[0])>180||Math.abs(c[1])>90||!Number.isInteger(t)||t<0||t>4102444800)throw Error('Invalid point')
  return {type:'Feature',geometry:{type:'Point',coordinates:c},properties:{timestamp:t}}
 })
 return JSON.stringify({type:'FeatureCollection',features})
}
export async function fetchHistory(start,end,token,{signal,fetcher=fetch}={}){
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/i.test(token))throw Error('Invalid access key')
 const path=historyPath(start,end)
 const response=await fetcher(path,{headers:{Authorization:'Bearer '+token,Accept:'application/geo+json'},credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal})
 if(!response.ok||!/^application\/geo\+json(?:;|$)/i.test(response.headers.get('content-type')||'')||!response.body)throw Error('History unavailable')
 const reader=response.body.getReader(), decoder=new TextDecoder('utf-8',{fatal:true})
 let size=0,text=''
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES)throw Error('History too large');text+=decoder.decode(value,{stream:true})}
  return validateServerHistory(text+decoder.decode())
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
}
