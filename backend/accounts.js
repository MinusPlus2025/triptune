import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { db } from './database.js';

db.exec(`CREATE TABLE IF NOT EXISTS accounts (
 id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL,
 profile_id TEXT UNIQUE NOT NULL REFERENCES profiles(id));
 CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS memories (id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), date TEXT NOT NULL, place TEXT NOT NULL, text TEXT NOT NULL, photo TEXT NOT NULL, draft INTEGER NOT NULL, updated TEXT NOT NULL);`);
const digest = token => createHash('sha256').update(token).digest('hex');
export function accountFor(req) {
 const token = (req.headers.cookie || '').match(/(?:^|;\s*)triptune_session=([a-f0-9]{64})(?:;|$)/)?.[1];
 if (!token) return null;
 return db.prepare('SELECT a.id,a.username,a.profile_id FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires>?').get(digest(token),Date.now()) || null;
}
export function login(username,password,register=false) {
 if (typeof username!=='string'||! /^[a-zA-Z0-9_]{3,30}$/.test(username)||typeof password!=='string'||password.length<10||password.length>128) throw new Error('用户名用3—30位字母、数字或下划线，密码至少10位。');
 username=username.toLowerCase();
 let account=db.prepare('SELECT * FROM accounts WHERE username=?').get(username);
 if(register){
  if(account) throw new Error('无法注册该用户名，请换一个或登录。');
  const salt=randomBytes(16).toString('hex');
  account={id:randomUUID(),username,salt,hash:scryptSync(password,salt,64).toString('hex'),profile_id:randomUUID()};
  db.exec('BEGIN IMMEDIATE');
  try {
   db.prepare('INSERT INTO profiles (id,name,avatar,default_budget_cents,default_pace,avoid_json,created_at) VALUES (?,?,?,?,?,?,?)').run(account.profile_id,username,'',500000,'balanced','[]',new Date().toISOString());
   db.prepare('INSERT INTO accounts VALUES (?,?,?,?,?)').run(account.id,username,salt,account.hash,account.profile_id);
   db.exec('COMMIT');
  } catch(error){db.exec('ROLLBACK');throw error;}
 } else {
  const hash=scryptSync(password,account?.salt || 'unregistered-account',64);
  if(!account||!timingSafeEqual(hash,Buffer.from(account.hash,'hex'))) throw new Error('用户名或密码不正确。');
 }
 const token=randomBytes(32).toString('hex');
 db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
 db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(token),account.id,Date.now()+7*86400000);
 return {token,profileId:account.profile_id};
}
export function logout(req){
 const token=(req.headers.cookie||'').match(/triptune_session=([a-f0-9]{64})/)?.[1];
 if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));
}
export function listMemories(accountId){return db.prepare('SELECT id,date,place,text,photo,draft,updated FROM memories WHERE account_id=? ORDER BY date DESC,updated DESC').all(accountId);}
export function saveMemory(accountId,raw){
 if(typeof raw.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(raw.date)||!Number.isFinite(Date.parse(raw.date))||new Date(raw.date).toISOString().slice(0,10)!==raw.date)throw new Error('请填写日期。');
 if(typeof raw.text!=='string'||raw.text.length>2000||typeof raw.place!=='string'||raw.place.length>100)throw new Error('文字最多2000字，地点最多100字。');
 const photo=raw.photo||'';
 if(typeof photo!=='string'||photo.length>48000||(photo&&!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo)))throw new Error('请使用压缩后的 JPEG 照片。');
 if(!raw.text.trim()&&!photo)throw new Error('写几句话，或添加一张照片。');
 const id=raw.id||randomUUID();
 if(raw.id&&!db.prepare('SELECT id FROM memories WHERE id=? AND account_id=?').get(id,accountId))throw new Error('找不到这条回忆。');
 db.prepare('INSERT INTO memories VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET date=excluded.date,place=excluded.place,text=excluded.text,photo=excluded.photo,draft=excluded.draft,updated=excluded.updated WHERE memories.account_id=excluded.account_id').run(id,accountId,raw.date,raw.place.trim(),raw.text.trim(),photo,raw.draft?1:0,new Date().toISOString());
 return id;
}
export function deleteMemory(accountId,id){return db.prepare('DELETE FROM memories WHERE id=? AND account_id=?').run(id,accountId).changes>0;}
