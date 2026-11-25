import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {agentUiDriver} from './verify-workstation-agent-ui-driver.mjs';

const program=String.raw`import os,sys,json,re,tty,termios,urllib.request,urllib.parse,uuid,time
from pathlib import Path
root=Path(sys.argv[2]).resolve();assert Path.cwd().resolve()==root and os.environ.get('SUPERSET_WORKSPACE_ID')==sys.argv[1]
terminal=os.environ['SUPERSET_TERMINAL_ID'];hook=os.environ['SUPERSET_HOST_AGENT_HOOK_URL'];url=urllib.parse.urlparse(hook)
assert url.scheme=='http' and url.hostname=='127.0.0.1' and re.fullmatch(r'/agent-hook/[a-f0-9]{64}',url.path)
launch='owned-'+str(uuid.uuid4());session='owned-'+str(uuid.uuid4());proof=root/'.superset/owned-agent-status.json';proof.parent.mkdir(exist_ok=True)
state={'terminalId':terminal,'pid':os.getpid(),'cwd':str(root),'events':[],'running':True}
def save():
 temp=proof.with_suffix('.tmp');temp.write_text(json.dumps(state));temp.replace(proof)
def notify(event):
 body={'json':{'terminalId':terminal,'eventType':event,'launchId':launch,'agent':{'agentId':'claude','sessionId':session}}}
 request=urllib.request.Request(hook,data=json.dumps(body).encode(),headers={'Content-Type':'application/json'},method='POST')
 with urllib.request.urlopen(request,timeout=5) as response:
  result=json.load(response)['result']['data']['json'];assert result['success'] and not result.get('ignored',False)
 state['events'].append(event);save()
fd=sys.stdin.fileno();old=termios.tcgetattr(fd)
try:
 tty.setraw(fd);sys.stdout.write('\x1b[?1049h\x1b[?2004l\x1b[2J\x1b[HOWNED AGENT STATUS\r\nControlled hook fixture; no vendor service.\r\n');sys.stdout.flush()
 notify('Attached');notify('Start')
 while True:
  data=os.read(fd,4096)
  if not data or b'q' in data or b'\x03' in data:break
  for char in data:
   event={119:'Start',112:'PermissionRequest',115:'Stop',102:'Failed'}.get(char)
   if event:
    if event=='Stop':time.sleep(.4)
    notify(event);sys.stdout.write(event+'\r\n');sys.stdout.flush()
finally:
 notify('Detached');state['running']=False;save();sys.stdout.write('\x1b[?1049l');sys.stdout.flush();termios.tcsetattr(fd,termios.TCSADRAIN,old)
`;
const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
export async function verifyWorkstationAgentStatusUi(options,{scope}) {
 const {getPage,click,screenshot,output,controls,closeReopen}=options;
 const {evaluate,until,menu}=agentUiDriver(options);
 const read=()=>evaluate(`(async()=>{const r=await window.directWorkstation.getWorkspaceViewV3();if(r.invalid||r.snapshot?.schemaVersion!==3)throw Error('Expected V3');const t=r.snapshot.targets.find(t=>t.connectionId===${JSON.stringify(scope.d.connectionId)}),w=t?.workspaces.find(w=>w.workspaceId===${JSON.stringify(scope.w.workspaceId)});if(!w)throw Error('Missing owned workspace');return w;})()`);
 const query=(path,input)=>evaluate(`window.directWorkstation.rpc(${JSON.stringify({connectionId:scope.d.connectionId,generation:scope.d.generation,path,type:'query',input})})`);
 const before=await read(),browser=before.panes.find(p=>p.kind==='browser'&&p.paneId===before.activePaneId);assert.ok(browser);
 const workspaceTabsEnabled=process.argv.includes('--workspace-agent-status-ui');
 const report={workspaceTabsEnabled,before,vendorAgentVerified:false,actualBackendHooks:true,phases:[]};
 const save=()=>writeFileSync(join(output,'agent-status-ui.json'),JSON.stringify(report,null,2)+'\n');
 const rightClick=async id=>{const p=await evaluate(`(()=>{const e=document.querySelector('[data-pane-title-id="${id}"]'),r=e?.getBoundingClientRect();if(!r)return null;const x=r.x+r.width/2,y=r.y+r.height/2;return e.contains(document.elementFromPoint(x,y))?{x,y}:null;})()`);assert.ok(p);for(const type of ['mousePressed','mouseReleased'])await getPage().call('Input.dispatchMouseEvent',{type,...p,button:'right',clickCount:1});};
 const tab=(w,id)=>[...(w.paneTabs??[]),...(w.rightPaneLayout?.tabs??[])].find(t=>JSON.stringify(t.layout).includes(id))?.tabId;
 await rightClick(browser.paneId);await menu('Move to Right Side');await until(async()=>{const w=await read();return w.rightPaneOpen&&w.activePaneArea==='right';},'owned browser moved right');
 await click('text:New terminal');
 const agent=await until(async()=>{const w=await read();return w.panes.find(p=>p.kind==='terminal'&&!before.panes.some(old=>old.paneId===p.paneId));},'explicit new terminal for actual hook fixture');
 const placed=await read();
 if(!placed.rightPaneLayout?.tabs.some(t=>JSON.stringify(t.layout).includes(agent.paneId))) {await rightClick(agent.paneId);await menu('Move to Right Side');await until(async()=>(await read()).rightPaneLayout?.tabs.some(t=>JSON.stringify(t.layout).includes(agent.paneId)),'owned hook terminal moved right through original menu');}
 const selector=`[data-terminal-id="${agent.resourceId}"]`;
 await until(()=>evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}+'[data-restore-state="attached"] .xterm-screen'))`),'owned hook terminal attached');
 const execution=await controls.inspectPresetTerminal(agent.resourceId);report.agent=agent;report.execution=execution;
 const observeEvents=()=>evaluate(`(()=>{if(window.__ownedAgentStatusEvents)return;const records=[];window.__ownedAgentStatusEvents=records;window.directWorkstation.onSocket(event=>{if(event.kind!=='message'||typeof event.data!=='string')return;let message;try{message=JSON.parse(event.data);}catch{return;}if(message.workspaceId!==${JSON.stringify(scope.w.workspaceId)}||!['agent:lifecycle','agent:bindings-changed','terminal:lifecycle'].includes(message.type))return;if(message.type!=='agent:bindings-changed'&&message.terminalId!==${JSON.stringify(agent.resourceId)})return;if(records.length<128)records.push({type:message.type,eventType:message.eventType,terminalId:message.terminalId,workspaceId:message.workspaceId,occurredAt:message.occurredAt});});})()`);
 await observeEvents();
 const serviceUid=await evaluate(`(async()=>{const r=await window.directWorkstation.getWorkspaceViewV3();return r.snapshot.targets.find(t=>t.connectionId===${JSON.stringify(scope.d.connectionId)}).serviceUid;})()`);assert.ok(Number.isSafeInteger(serviceUid)&&serviceUid>0);report.serviceUid=serviceUid;
 const seenKey=createHash('sha256').update(JSON.stringify(['workstation-agent-seen-v1',scope.d.backendId,scope.d.namespaceId,serviceUid,scope.w.workspaceId,agent.resourceId])).digest('hex');report.seenKey=seenKey;
 const proof=async()=>{try{const f=await query('filesystem.readFile',{workspaceId:scope.w.workspaceId,absolutePath:scope.root+'/.superset/owned-agent-status.json',maxBytes:65536});return JSON.parse(f.kind==='text'?f.content:Buffer.from(f.content,'base64').toString());}catch{return null;}};
 const binding=async()=>{const rows=await query('terminalAgents.listByWorkspace',{workspaceId:scope.w.workspaceId});return rows.find(row=>row.terminalId===agent.resourceId);};
 const waitRestored=async visible=>until(async()=>{try {const b=await binding(),p=await proof();if(b?.lastEventType!=='Stop'||!p?.running||p.pid!==report.initialProof.pid)return false;if(visible&&!await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}+'[data-restore-state="attached"] .xterm-screen'))`))return false;return b;}catch{return false;}},'same live Agent binding and terminal restore before checking seen state');
 const mark=async()=>{const p=await evaluate('window.directWorkstation.getPreferences()');assert.equal(p.invalid,false);return {revision:p.revision,mark:p.values.agentSeenMarks?.find(m=>m.key===seenKey)??null};};
 const badge=async(status,where='tab')=>{const w=await read(),id=tab(w,agent.paneId);return evaluate(where==='tab'?`Boolean(document.querySelector('[data-tab-id="${id}"] [data-workstation-agent-status="${status}"]'))`:`Boolean(document.querySelector('[data-pane-title-id="${agent.paneId}"]')?.closest('[draggable="true"]')?.querySelector('[data-workstation-agent-status="${status}"]'))`);};
 const workspaceBadge=()=>evaluate(`document.querySelector('.ws-workspace-tabs [data-tab-id="${before.tabId}"] [data-workstation-agent-status]')?.dataset.workstationAgentStatus??null`);
 const selectWorkspace=async id=>{await click(`.ws-workspace-tabs [data-tab-id="${id}"]`);await until(()=>evaluate(`(async()=>{const r=await window.directWorkstation.getWorkspaceViewV3();return r.snapshot.targets.find(t=>t.connectionId===${JSON.stringify(scope.d.connectionId)})?.activeTabId===${JSON.stringify(id)};})()`),'explicit workspace tab selection');};
 const capture=async name=>{if(workspaceTabsEnabled){const expected=name.includes('unread')?'review':name.includes('failed')?'failed':name==='permission'?'permission':name==='working'?'working':null;await until(async()=>(await workspaceBadge())===expected,'original workspace tab aggregate '+name);}const current=await controls.inspectPresetTerminal(agent.resourceId);for(const key of ['id','executionId','pid','cwd'])assert.equal(current[key],execution[key],key);report.phases.push({name,workspaceTabStatus:workspaceTabsEnabled?await workspaceBadge():undefined,events:await evaluate('window.__ownedAgentStatusEvents??[]'),view:await read(),binding:await binding(),seen:await mark(),proof:await proof(),execution:current});await screenshot('agent-status-'+name);save();};
 const selectAgent=async()=>{const w=await read(),id=tab(w,agent.paneId);if(w.activePaneTabId!==id&&w.rightPaneLayout?.activeTabId!==id)await click(`[data-tab-id="${id}"]`);await click(selector+' .xterm-screen');};
 const browserTab=async()=>{const w=await read();await click(`[data-tab-id="${tab(w,browser.paneId)}"]`);await until(async()=>(await read()).activePaneId===browser.paneId,'browser owns focus before background Stop');};
 const send=async text=>{await click(selector+' .xterm-screen');await getPage().call('Input.insertText',{text});};
 let running=false;
 try {
  await click(selector+' .xterm-screen');await getPage().call('Input.insertText',{text:`python3 -u -c "exec(bytes.fromhex('${Buffer.from(program).toString('hex')}').decode())" ${quote(scope.w.workspaceId)} ${quote(scope.root)}`});for(const type of ['keyDown','keyUp'])await getPage().call('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13});running=true;
  await until(async()=>{const p=await proof(),b=await binding();return p?.events.includes('Start')&&b?.lastEventType==='Start';},'actual scoped agent hook starts');report.initialProof=await proof();
  await until(()=>badge('working','header'),'original working indicator on visible terminal header');await until(()=>badge('working'),'original working indicator on nested tab');await capture('working');
  await send('p');await until(()=>badge('permission','header'),'permission indicator from real host hook');assert.equal((await mark()).mark,null);await capture('permission');
  await send('s');await browserTab();const stopped=await until(async()=>{const b=await binding();return b?.lastEventType==='Stop'&&b;},'background Stop recorded by host');
  await until(()=>badge('review'),'background completion is unread on original tab');assert.ok(((await mark()).mark?.at??-1)<stopped.lastEventAt);await capture('unread');
  await closeReopen();await observeEvents();await waitRestored(false);await until(()=>badge('review'),'unread review survives normal reopen');assert.ok(((await mark()).mark?.at??-1)<stopped.lastEventAt);await capture('unread-reopened');
  if(workspaceTabsEnabled){
   await click('.ws-workspace-tabs [data-slot="dropdown-menu-trigger"]');await menu('New session');await click('[role=dialog] input');await getPage().call('Input.insertText',{text:'Owned background status workspace'});await click('[role=dialog] button[type=submit]');
   const other=await until(()=>evaluate(`(async()=>{const r=await window.directWorkstation.getWorkspaceViewV3(),t=r.snapshot.targets.find(t=>t.connectionId===${JSON.stringify(scope.d.connectionId)});return t.activeTabId!==${JSON.stringify(before.tabId)}&&t.workspaces.find(w=>w.tabId===t.activeTabId);})()`),'new workspace selected through original add menu');report.otherWorkspace=other;
   assert.ok(((await mark()).mark?.at??-1)<stopped.lastEventAt);await capture('workspace-background-unread');await selectWorkspace(before.tabId);
  }

  await selectAgent();await until(async()=>(await mark()).mark?.at===stopped.lastEventAt,'visible active terminal acknowledges exact host clock');await until(async()=>!(await badge('review')),'acknowledged review clears original tab');await capture('seen');
  await closeReopen();await observeEvents();await waitRestored(true);await until(async()=>(await mark()).mark?.at===stopped.lastEventAt,'seen timestamp persists across real reopen');await until(async()=>!(await badge('review')),'persisted seen timestamp prevents old review');await capture('seen-reopened');
  await selectAgent();await send('f');await until(()=>badge('failed','header'),'failed indicator is never seen-gated');assert.equal((await mark()).mark.at,stopped.lastEventAt);await capture('failed');
  await rightClick(agent.paneId);await menu('Move to Center');await until(async()=>{const w=await read();return w.activePaneArea==='center'&&w.paneTabs.some(t=>JSON.stringify(t.layout).includes(agent.paneId));},'same agent moved to center through original menu');await until(()=>badge('failed','header'),'failure indicator follows same resource between areas');await capture('failed-center');
  await send('w');await until(()=>badge('working'),'same hook session starts another turn');await send('s');if(workspaceTabsEnabled)await selectWorkspace(report.otherWorkspace.tabId);else await browserTab();const second=await until(async()=>{const b=await binding();return b?.lastEventType==='Stop'&&b.lastEventAt>stopped.lastEventAt&&b;},'new host-clock Stop');if(workspaceTabsEnabled)await until(async()=>(await workspaceBadge())==='review','background workspace completion is unread');else await until(()=>badge('review'),'inactive center terminal remains unread while right browser active');assert.equal((await mark()).mark.at,stopped.lastEventAt);await capture('second-unread');
  if(workspaceTabsEnabled){await closeReopen();await observeEvents();await waitRestored(false);assert.equal((await mark()).mark.at,stopped.lastEventAt);await capture('workspace-background-unread-reopened');await selectWorkspace(before.tabId);}

  await selectAgent();await until(async()=>(await mark()).mark?.at===second.lastEventAt,'selecting center terminal acknowledges newer host event');await capture('second-seen');
  await send('q');await until(async()=>(await proof())?.running===false,'controlled hook fixture exits');running=false;
  await rightClick(agent.paneId);await menu('Close pane');await until(async()=>!(await read()).panes.some(p=>p.paneId===agent.paneId),'only owned hook terminal closed');
  await browserTab();await rightClick(browser.paneId);await menu('Move to Center');await until(async()=>(await read()).paneTabs.some(t=>JSON.stringify(t.layout).includes(browser.paneId)),'original browser returns to center');await click('[data-pane-area="right"] button[aria-label="Toggle sidebar"]');
  if(workspaceTabsEnabled){await click(`.ws-workspace-tabs [data-tab-id="${report.otherWorkspace.tabId}"] button[aria-label="Close tab"]`);await until(()=>evaluate(`!document.querySelector('.ws-workspace-tabs [data-tab-id="${report.otherWorkspace.tabId}"]')`),'only newly created workspace tab closed');}
  const final=await read();assert.deepEqual(final.panes.map(p=>p.paneId).sort(),before.panes.map(p=>p.paneId).sort());assert.deepEqual(getPage().errors,[]);assert.ok(report.phases.some(p=>p.events.some(e=>e.type==='agent:lifecycle'&&e.eventType==='Start')),'actual authenticated Agent lifecycle event observed');assert.ok(report.phases.some(p=>p.events.some(e=>e.type==='agent:lifecycle'&&e.eventType==='Stop')),'actual authenticated completion event observed');report.actualLifecycleEventsObserved=true;report.completed=true;report.final=final;save();
 } catch(error) {report.error={message:error.message,stack:error.stack};try{report.failedObservation={binding:await binding(),proof:await proof(),view:await read(),seen:await mark()};}catch{}save();throw error;}
 finally {if(running){try{await selectAgent();await send('q');}catch{}}save();}
}
