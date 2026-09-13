import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

test('HTTP API enforces identity on memories, profiles and journeys',async()=>{
 const child=spawn(process.execPath,['backend/server.js'],{env:{...process.env,PORT:'17869',HOST:'127.0.0.1',TRIPTUNE_DB_PATH:':memory:'},stdio:['ignore','pipe','pipe']});
 try {
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw new Error('Test server failed to start');})]);
  const call=async(path,body,cookie)=>fetch('http://127.0.0.1:17869'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(cookie?{cookie}: {})},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal((await call('/api/memories')).status,401);
  const a=await call('/api/auth/register',{username:'account_a',password:'password-long-a'});assert.equal(a.status,200);
  const cookieA=a.headers.get('set-cookie').split(';')[0],profileA=(await a.json()).profileId;
  const b=await call('/api/auth/register',{username:'account_b',password:'password-long-b'});assert.equal(b.status,200);
  const cookieB=b.headers.get('set-cookie').split(';')[0];
  assert.equal((await call(`/api/profiles/${profileA}`,null,cookieB)).status,404);
  const saved=await call('/api/memories',{date:'2026-09-13',place:'北京',text:'私密测试',draft:true},cookieA);assert.equal(saved.status,200);const {id}=await saved.json();
  assert.deepEqual(await(await call('/api/memories',null,cookieB)).json(),[]);
  assert.equal((await call(`/api/memories/${id}/delete`,{},cookieB)).status,404);
  const trip=await call('/api/itinerary/generate',{profileId:'demo-linmo',destination:'北京',durationDays:2,budget:5000,partySize:1,interests:['独立书店'],pace:'balanced'},cookieA);
  assert.equal(trip.status,201);const payload=await trip.json();assert.equal(payload.itinerary.profileId,profileA);
  assert.equal((await call(`/api/itineraries/${payload.itinerary.id}`,null,cookieB)).status,404);
  await call('/api/auth/logout',{},cookieA);assert.equal((await call('/api/memories',null,cookieA)).status,401);
 } finally {if(child.exitCode===null){child.kill();await once(child,'exit');}}
});
