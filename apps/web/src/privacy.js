// Local-only privacy workspace; no source metadata copied.
export const LIMIT = 100000
const finite = n => typeof n === 'number' && Number.isFinite(n)
const valid = (lon, lat) => finite(lon) && finite(lat) && Math.abs(lon)<=180 && Math.abs(lat)<=90
const rad = n => n*Math.PI/180
export function distanceKm(a,b) {
  const h = Math.sin(rad(b[1]-a[1])/2)**2 + Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(rad(b[0]-a[0])/2)**2
  return 12742*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))))
}
export function preview(text, {grid=0.1, minimum=10, zone=null, protectCells=false, auditRoute=false}={}) {
  if(typeof text !== 'string' || text.length>8*1024*1024) throw Error('Input exceeds preview limit')
  if(!finite(grid)||grid<0.1||grid>10||!Number.isInteger(minimum)||minimum<5||minimum>LIMIT) throw Error('Invalid grid or threshold')
  if(zone && (!valid(zone.lon,zone.lat)||!finite(zone.radius)||zone.radius<=0||zone.radius>1000)) throw Error('Invalid privacy zone')
  const doc=JSON.parse(text)
  if(doc?.type!=='FeatureCollection'||!Array.isArray(doc.features)||doc.features.length>LIMIT) throw Error('Expected bounded Point FeatureCollection')
  const counts=new Map(); let excluded=0; const unique=new Set()
  const route={timedPoints:0,untimedPoints:0,nonIncreasingTimestamps:0,highSpeedSegments:0}
  let previous=null
  for(const f of doc.features){
    const p=f?.geometry?.coordinates
    if(f?.type!=='Feature'||f.geometry?.type!=='Point'||!Array.isArray(p)||p.length<2||p.length>3||!p.every(finite)||!valid(...p)) throw Error('Invalid point')
    if(auditRoute){
      // Explicit Unix seconds only; do not infer time units or reorder records.
      const t=f.properties?.timestamp
      if(!Number.isInteger(t)||t<0||t>4102444800){route.untimedPoints++;previous=null}
      else{
        route.timedPoints++
        if(previous){const dt=t-previous.t;if(dt<=0)route.nonIncreasingTimestamps++;else if(distanceKm(previous.p,p)*3600/dt>350)route.highSpeedSegments++}
        previous={p,t}
      }
    }
    if(zone && distanceKm(p,[zone.lon,zone.lat])<=zone.radius){excluded++;continue}
    unique.add(p.slice(0,2).join(','))
    const x=Math.min(Math.floor((p[0]+180)/grid),Math.ceil(360/grid)-1),y=Math.min(Math.floor((p[1]+90)/grid),Math.ceil(180/grid)-1)
    const key=x+','+y;counts.set(key,(counts.get(key)||0)+1)
  }
  const features=[];let suppressed=0, retained=0, protectedCellPoints=0
  for(const [key,count] of counts){
    const [x,y]=key.split(',').map(Number),w=Number((-180+x*grid).toFixed(8)),s=Number((-90+y*grid).toFixed(8)),e=Math.min(180,Number((w+grid).toFixed(8))),n=Math.min(90,Number((s+grid).toFixed(8)))
    if(zone && protectCells && distanceKm([(w+e)/2,(s+n)/2],[zone.lon,zone.lat]) <= zone.radius + 6371*rad((e-w+n-s)/2)+0.00001){protectedCellPoints+=count;continue}
    if(count<minimum){suppressed+=count;continue}
    features.push({type:'Feature',geometry:{type:'Polygon',coordinates:[[[w,s],[e,s],[e,n],[w,n],[w,s]]]},properties:{point_count:count}})
    retained+=count
  }
  return {receipt:{input:doc.features.length,excluded,suppressed,retained,cells:features.length,repeatCoordinates:doc.features.length-excluded-unique.size,...(protectCells?{protectedCellPoints}:{})},...(auditRoute?{routeAudit:route}:{}),export:{type:'FeatureCollection',features}}
}
export const sample=()=>JSON.stringify({type:'FeatureCollection',features:Array.from({length:22},(_,i)=>({type:'Feature',geometry:{type:'Point',coordinates:i<12?[10.01,20.01]:i<20?[11.01,21.01]:[30,40]},properties:{synthetic:true}}))})
