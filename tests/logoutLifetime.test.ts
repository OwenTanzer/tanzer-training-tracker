import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

async function harness() {
  const storage = new Map<string,string>([['draft-sentinel','useful draft'],['outbox-sentinel','pending']]);
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)}});
  Object.defineProperty(globalThis,'window',{configurable:true,value:{addEventListener:()=>{}}});
  const originalFetch=globalThis.fetch;const deletes:string[]=[];let serial=0,release:()=>void=()=>{},held=false,fail=false;
  globalThis.fetch=async(_url,options)=>{
    if(options?.method==='POST'){const name=JSON.parse(options.body as string).name;return new Response(JSON.stringify({token:`synthetic-${name}-${++serial}`,instructorId:name,name,createdAt:'2026-01-01',trainerSince:'2026-01-01',profilePhotoUrl:null}));}
    deletes.push((options?.headers as Record<string,string>).Authorization);
    if(held)await new Promise<void>(r=>{release=r});if(fail)throw Error('synthetic response failure');return new Response('{"ok":true}');
  };
  const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,ws:false},define:{'import.meta.env.VITE_API_BASE_URL':JSON.stringify('https://synthetic.invalid')}});
  const auth=await vite.ssrLoadModule('/src/lib/auth.ts');
  return {auth,storage,deletes,hold:()=>{held=true},fail:()=>{fail=true},release:()=>release(),close:async()=>{assert.equal(storage.get('draft-sentinel'),'useful draft');assert.equal(storage.get('outbox-sentinel'),'pending');await vite.close();globalThis.fetch=originalFetch;Reflect.deleteProperty(globalThis,'window')}};
}
for(const failed of [false,true])test(`current intentional logout clears only its session, failed response=${failed}`,async()=>{const h=await harness();try{await h.auth.login('A','synthetic');const token=h.storage.get('abbys-dog-chej:session-token');if(failed)h.fail();await h.auth.logout();assert.deepEqual(h.deletes,[`Bearer ${token}`]);assert.equal(h.storage.has('abbys-dog-chej:session'),false);assert.equal(h.storage.has('abbys-dog-chej:session-token'),false);}finally{await h.close()}});
test('late logout cannot clear a newer same-page login',async()=>{const h=await harness();try{await h.auth.login('A','synthetic');h.hold();const pending=h.auth.logout();await new Promise(r=>setImmediate(r));await h.auth.login('B','synthetic');const newer=[h.storage.get('abbys-dog-chej:session'),h.storage.get('abbys-dog-chej:session-token')];h.release();await pending;assert.deepEqual([h.storage.get('abbys-dog-chej:session'),h.storage.get('abbys-dog-chej:session-token')],newer);assert.equal(h.deletes.length,1);}finally{await h.close()}});
test('other-tab credentials survive completion even before its storage event is handled',async()=>{const h=await harness();try{await h.auth.login('A','synthetic');h.hold();const pending=h.auth.logout();await new Promise(r=>setImmediate(r));h.storage.set('abbys-dog-chej:session','newer shared session');h.storage.set('abbys-dog-chej:session-token','newer-shared-token');h.release();await pending;assert.equal(h.storage.get('abbys-dog-chej:session'),'newer shared session');assert.equal(h.storage.get('abbys-dog-chej:session-token'),'newer-shared-token');await h.auth.logout();assert.equal(h.deletes.length,1);}finally{await h.close()}});
test('stale tab cannot revoke a newer shared token at logout invocation',async()=>{const h=await harness();try{await h.auth.login('A','synthetic');h.storage.set('abbys-dog-chej:session','newer shared session');h.storage.set('abbys-dog-chej:session-token','newer-shared-token');await h.auth.logout();assert.equal(h.deletes.length,0);assert.equal(h.storage.get('abbys-dog-chej:session'),'newer shared session');assert.equal(h.storage.get('abbys-dog-chej:session-token'),'newer-shared-token');}finally{await h.close()}});
