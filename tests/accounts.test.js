import test from 'node:test';
import assert from 'node:assert/strict';
process.env.TRIPTUNE_DB_PATH = ':memory:';
const {login,accountFor,logout,saveMemory,listMemories,deleteMemory}=await import('../backend/accounts.js');

test('accounts isolate private memories and revoke sessions',()=>{
 const a=login('alice_test','long-password-a',true);
 const b=login('bob_test','long-password-b',true);
 const req=token=>({headers:{cookie:`triptune_session=${token}`}});
 const owner=accountFor(req(a.token)),other=accountFor(req(b.token));
 assert.notEqual(owner.profile_id,other.profile_id);
 assert.equal(accountFor(req('0'.repeat(64))),null);
 assert.throws(()=>login('alice_test','wrong-password'));
 const record={date:'2026-09-13',place:'北京',text:'我的回忆',photo:'',draft:true};
 const id=saveMemory(owner.id,record);
 assert.equal(listMemories(other.id).length,0);
 assert.throws(()=>saveMemory(other.id,{...record,id,text:'篡改'}));
 assert.equal(deleteMemory(other.id,id),false);
 saveMemory(owner.id,{...record,id,text:'编辑后的回忆'});
 assert.equal(listMemories(owner.id)[0].text,'编辑后的回忆');
 assert.equal(deleteMemory(owner.id,id),true);
 logout(req(a.token));
 assert.equal(accountFor(req(a.token)),null);
 assert.ok(accountFor(req(b.token)));
});
