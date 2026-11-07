import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { isDraftStale, discardVolatileDraft, retainPreparingDraft, prepareRecoveryDrafts, getRecoveryDrafts, loadNewLogDraft, saveNewLogDraft, clearNewLogDraft, draftKey, restoreDraftPicture, type NewLogDraft } from '../src/lib/newLogDraft.ts';
const memory = new Map<string,string>();let fail=false;
beforeEach(()=>{for(const owner of ['owner','other','wrong-owner'])for(const dog of ['dog','broken'])discardVolatileDraft(owner,dog);memory.clear();fail=false;});
Object.defineProperty(globalThis,'localStorage',{value:{getItem:(key:string)=>memory.get(key)??null,setItem:(key:string,value:string)=>{if(fail)throw Error('quota');memory.set(key,value)},removeItem:(key:string)=>memory.delete(key)},configurable:true});
const draft:NewLogDraft={version:1,savedAt:'2026-11-07T12:00:00Z',newLocationName:'New yard',pictureFile:{name:'synthetic.png',type:'image/png',dataUrl:'data:image/png;base64,AQID'},report:{id:'stable',dogId:'dog',authorInstructorId:'owner',createdDate:'2026-11-07T12:00:00Z',updatedDate:'2026-11-07T12:00:00Z',sessionDate:'2026-11-06',phase:'Phase 1',notes:'exact notes',redFlag:true,visibility:'private',locationId:null,picture:null,skillIds:['one'],milestoneIds:['two'],distractions:[{distractionId:'noise',severity:'Moderate'}]}};
test('full draft and selected picture round trip without a server-save claim',async()=>{memory.clear();fail=false;assert.equal(saveNewLogDraft('owner','dog',draft),true);assert.deepEqual(loadNewLogDraft('owner','dog'),{draft,blocked:false});const file=restoreDraftPicture(draft.pictureFile)!;assert.equal(file.name,'synthetic.png');assert.deepEqual([...new Uint8Array(await file.arrayBuffer())],[1,2,3]);});
test('failed replacement preserves previous persisted bytes',()=>{memory.clear();fail=false;saveNewLogDraft('owner','dog',draft);const before=memory.get(draftKey('owner','dog'));fail=true;assert.equal(saveNewLogDraft('owner','dog',{...draft,report:{...draft.report,notes:'new unsaved'}}),false);assert.equal(memory.get(draftKey('owner','dog')),before);fail=false;});
test('owner/dog isolation and malformed existing input fail closed',()=>{memory.clear();saveNewLogDraft('owner','dog',draft);assert.equal(loadNewLogDraft('other','dog').draft,null);assert.equal(loadNewLogDraft('owner','other').draft,null);memory.set(draftKey('owner','dog'),'{broken');assert.deepEqual(loadNewLogDraft('owner','dog'),{draft:null,blocked:true});assert.equal(memory.get(draftKey('owner','dog')),'{broken');});
test('wrong owner or schema rejected; clear targets only one draft',()=>{memory.clear();memory.set(draftKey('other','dog'),JSON.stringify(draft));assert.equal(loadNewLogDraft('other','dog').blocked,true);saveNewLogDraft('owner','dog',draft);assert.equal(clearNewLogDraft('owner','dog'),true);assert.equal(memory.has(draftKey('other','dog')),true);});
test('failed-write recovery is owner scoped, copied, volatile and cleared only after persistence',()=>{
  fail=true;const latest={...draft,report:{...draft.report,notes:'latest memory-only'}};
  assert.equal(saveNewLogDraft('owner','dog',latest),false);
  const restored=loadNewLogDraft('owner','dog');assert.equal(restored.memoryOnly,true);assert.deepEqual(restored.draft,latest);
  restored.draft!.report.notes='caller mutation';assert.equal(loadNewLogDraft('owner','dog').draft!.report.notes,latest.report.notes);
  assert.equal(loadNewLogDraft('another','dog').draft,null);
  assert.equal(saveNewLogDraft('wrong-owner','dog',latest),false);assert.equal(loadNewLogDraft('wrong-owner','dog').blocked,true);
  fail=false;assert.equal(saveNewLogDraft('owner','dog',latest),true);assert.equal(loadNewLogDraft('owner','dog').memoryOnly,undefined);
  clearNewLogDraft('owner','dog');clearNewLogDraft('wrong-owner','dog');assert.equal(loadNewLogDraft('owner','dog').draft,null);
});

test('recovery enumerates only this owner and refuses an incomplete malformed draft export',()=>{
  memory.clear(); fail=true; saveNewLogDraft('owner','dog',draft);
  const other={...draft,report:{...draft.report,authorInstructorId:'other',notes:'private other'}};
  saveNewLogDraft('other','dog',other);
  assert.deepEqual(getRecoveryDrafts('owner'),[{draft,memoryOnly:true}]);
  const key=draftKey('owner','broken');memory.set(key,'{broken');
  Object.defineProperty(localStorage,key,{value:'{broken',enumerable:true,configurable:true});
  assert.throws(()=>getRecoveryDrafts('owner'),/could not be read/);
  assert.equal(memory.get(key),'{broken');delete localStorage[key];memory.delete(key);
  fail=false;clearNewLogDraft('owner','dog');clearNewLogDraft('other','dog');
});

test('unfinished selected File and latest fields remain scoped without replacing older durable bytes',()=>{
 memory.clear();fail=false;saveNewLogDraft('owner','dog',draft);const old=memory.get(draftKey('owner','dog'));
 const file=new File([new Uint8Array([4,5,6])],'original.png',{type:'image/png'}), latest={...draft,pictureFile:null,report:{...draft.report,notes:'latest while preparing'}};
 retainPreparingDraft('owner','dog',latest,file);const loaded=loadNewLogDraft('owner','dog');assert.deepEqual(loaded.draft,latest);assert.equal(loaded.selectedFile,file);assert.equal(loaded.memoryOnly,true);assert.equal(memory.get(draftKey('owner','dog')),old);assert.equal(loadNewLogDraft('other','dog').draft,null);assert.equal(loadNewLogDraft('owner','other-dog').draft,null);assert.throws(()=>getRecoveryDrafts('owner'));
 loaded.draft!.report.notes='caller mutation';assert.equal(loadNewLogDraft('owner','dog').draft!.report.notes,latest.report.notes);clearNewLogDraft('owner','dog');assert.equal(loadNewLogDraft('owner','dog').draft,null);
});

test('late recovery serialization captures its File but cannot overwrite a newer selection; failure retains it',async()=>{
 memory.clear();fail=false;const first=new File(['first'],'first.png',{type:'image/png'}),second=new File(['second'],'second.png',{type:'image/png'});let finish:()=>Promise<void>=async()=>{};
 class Reader {result='';onload:(()=>void)|null=null;onerror:(()=>void)|null=null;readAsDataURL(file:File){finish=async()=>{this.result='data:image/png;base64,'+Buffer.from(await file.arrayBuffer()).toString('base64');this.onload?.()}}}
 Object.defineProperty(globalThis,'FileReader',{value:Reader,configurable:true});
 retainPreparingDraft('owner','dog',{...draft,pictureFile:null},first);const pending=prepareRecoveryDrafts('owner');const newer={...draft,pictureFile:null,report:{...draft.report,notes:'newer'}};retainPreparingDraft('owner','dog',newer,second);await finish();const backup=await pending;assert.equal(backup[0].draft.pictureFile!.dataUrl,'data:image/png;base64,Zmlyc3Q=');assert.equal(loadNewLogDraft('owner','dog').selectedFile,second);assert.equal(loadNewLogDraft('owner','dog').draft!.report.notes,'newer');
 class FailedReader extends Reader {readAsDataURL(){queueMicrotask(()=>this.onerror?.())}}
 Object.defineProperty(globalThis,'FileReader',{value:FailedReader,configurable:true});await assert.rejects(prepareRecoveryDrafts('owner'),/Could not read/);assert.equal(loadNewLogDraft('owner','dog').selectedFile,second);clearNewLogDraft('owner','dog');
});

test('stale volatile draft cannot overwrite or clear changed durable bytes; explicit discard preserves newer draft',()=>{
 saveNewLogDraft('owner','dog',draft);const file=new File(['earlier'],'earlier.png',{type:'image/png'});retainPreparingDraft('owner','dog',{...draft,pictureFile:null,report:{...draft.report,notes:'earlier memory'}},file);
 const newer={...draft,report:{...draft.report,notes:'newer from other tab'}};const bytes=JSON.stringify(newer);memory.set(draftKey('owner','dog'),bytes);
 assert.equal(isDraftStale('owner','dog'),true);assert.equal(loadNewLogDraft('owner','dog').stale,true);assert.equal(loadNewLogDraft('owner','dog').selectedFile,file);assert.equal(saveNewLogDraft('owner','dog',draft),false);assert.equal(clearNewLogDraft('owner','dog'),false);assert.equal(memory.get(draftKey('owner','dog')),bytes);
 assert.equal(isDraftStale('other','dog'),false);assert.equal(isDraftStale('owner','different-dog'),false);discardVolatileDraft('owner','dog');assert.deepEqual(loadNewLogDraft('owner','dog').draft,newer);assert.equal(memory.get(draftKey('owner','dog')),bytes);
});

test('a newer owner clearing the slot cannot be undone by old failed-write memory',()=>{
 saveNewLogDraft('owner','dog',draft);fail=true;saveNewLogDraft('owner','dog',{...draft,report:{...draft.report,notes:'old unsent'}});fail=false;memory.delete(draftKey('owner','dog'));
 assert.equal(loadNewLogDraft('owner','dog').deviceDraftMissing,true);assert.equal(saveNewLogDraft('owner','dog',draft),false);assert.equal(clearNewLogDraft('owner','dog'),false);assert.equal(memory.has(draftKey('owner','dog')),false);assert.equal(loadNewLogDraft('owner','dog').draft!.report.notes,'old unsent');discardVolatileDraft('owner','dog');assert.equal(loadNewLogDraft('owner','dog').draft,null);
});
