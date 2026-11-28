// Strict, bounded portable numeric CSV; never infer column or timestamp units.
const MAX_BYTES=8*1024*1024, MAX_POINTS=100000
const decimal=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/
export function normalizeHistory(text) {
 if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_BYTES)throw Error('Input too large')
 const trimmed=text.replace(/^\uFEFF/,'').trim()
 if(trimmed.startsWith('{'))return trimmed
 if(trimmed.startsWith('[')){
  const rows=JSON.parse(trimmed)
  if(!Array.isArray(rows)||rows.length>MAX_POINTS)throw Error('Invalid point array')
  const features=rows.map(row=>{
   if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Invalid point record')
   const coordinate=(n)=>{
    if(typeof n==='string'&&decimal.test(n))n=Number(n)
    if(typeof n!=='number'||!Number.isFinite(n))throw Error('Invalid coordinate')
    return n
   }
   const lon=coordinate(row.longitude),lat=coordinate(row.latitude),t=row.timestamp
   if(Math.abs(lon)>180||Math.abs(lat)>90||!Number.isInteger(t)||t<0||t>4102444800)throw Error('Invalid point record')
   return {type:'Feature',geometry:{type:'Point',coordinates:[lon,lat]},properties:{timestamp:t}}
  })
  const out=JSON.stringify({type:'FeatureCollection',features})
  if(new TextEncoder().encode(out).length>MAX_BYTES)throw Error('Converted input too large')
  return out
 }
 const lines=trimmed.split(/\r?\n/)
 const header=lines.shift()?.split(',').map(x=>x.trim())
 const timed=header?.join(',')==='longitude,latitude,timestamp'
 if(!timed&&header?.join(',')!=='longitude,latitude')throw Error('Unsupported CSV header')
 if(lines.length>MAX_POINTS)throw Error('Too many points')
 const features=lines.map(line=>{
  const fields=line.split(',').map(x=>x.trim())
  if(fields.length!==(timed?3:2)||!decimal.test(fields[0])||!decimal.test(fields[1]))throw Error('Invalid CSV row')
  const lon=Number(fields[0]),lat=Number(fields[1])
  if(!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lon)>180||Math.abs(lat)>90)throw Error('Invalid coordinates')
  const properties={}
  if(timed&&fields[2]!==''){
   if(!/^\d{1,10}$/.test(fields[2]))throw Error('Invalid Unix seconds')
   const t=Number(fields[2]);if(t>4102444800)throw Error('Invalid Unix seconds')
   properties.timestamp=t
  }
  return {type:'Feature',geometry:{type:'Point',coordinates:[lon,lat]},properties}
 })
 const out=JSON.stringify({type:'FeatureCollection',features})
 if(new TextEncoder().encode(out).length>MAX_BYTES)throw Error('Converted input too large')
 return out
}
