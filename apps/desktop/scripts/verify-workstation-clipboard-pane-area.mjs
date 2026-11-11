import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {agentUiDriver} from './verify-workstation-agent-ui-driver.mjs';

export async function verifyClipboardPaneArea(options,terminal,action) {
 const {getPage,click,output,scope,controls:providedControls}=options,{evaluate,until,menu}=agentUiDriver(options);
 const controls=providedControls?.forNamespace?.(scope.d.namespaceId)??providedControls;
 const id=terminal.terminalId??terminal.id;
 const read=()=>evaluate(`(async()=>{const r=await window.directWorkstation.getWorkspaceViewV3();if(r.invalid||r.snapshot?.schemaVersion!==3)throw Error('Expected valid owned V3 view');const t=r.snapshot.targets.find(t=>t.connectionId===${JSON.stringify(scope.d.connectionId)});if(t?.backendId!==${JSON.stringify(scope.d.backendId)}||t.namespaceId!==${JSON.stringify(scope.d.namespaceId)})throw Error('Wrong clipboard target');const w=t.workspaces.find(w=>w.workspaceId===${JSON.stringify(scope.w.workspaceId)});if(!w)throw Error('Missing owned clipboard workspace');return w;})()`);
 const before=await read(),pane=before.panes.find(p=>p.resourceId===id);assert.ok(pane);
 const resources=w=>w.panes.map(p=>[p.paneId,p.kind,p.resourceId,p.executionId]).sort((a,b)=>a[0].localeCompare(b[0]));
 const inspect=async()=>{if(!controls?.inspectPresetTerminal)return null;const r=await controls.inspectPresetTerminal(id);return {id:r.id,executionId:r.executionId,pid:r.pid,cwd:r.cwd};};
 const terminalBefore=await inspect();
 const move=async label=>{const p=await until(()=>evaluate(`(()=>{const e=document.querySelector('[data-pane-title-id="${pane.paneId}"]');if(!e)return null;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);return (hit===e||e.contains(hit))&&{x,y};})()`),'owned clipboard terminal title');for(const type of ['mousePressed','mouseReleased'])await getPage().call('Input.dispatchMouseEvent',{type,...p,button:'right',clickCount:1});await menu(label);};
 if(action==='right') {
  await move('Move to Right Side');
  await until(async()=>{const w=await read();return w.activePaneArea==='right'&&w.rightPaneLayout.tabs.some(t=>JSON.stringify(t.layout).includes(pane.paneId));},'clipboard terminal moved to actual right area');
 } else if(action==='expand') {
  await click('[data-pane-area="right"] button[aria-label="Expand"]');
  await until(async()=>Boolean((await read()).rightPaneAreaExpansion),'clipboard terminal expansion saved');
 } else if(action==='center') {
  if(before.rightPaneAreaExpansion){await click('[data-pane-area="right"] button[aria-label="Restore width"]');await until(async()=>!(await read()).rightPaneAreaExpansion,'clipboard split restored');}
  await move('Move to Center');
  await until(async()=>{const w=await read();return w.activePaneArea==='center'&&w.paneTabs.some(t=>JSON.stringify(t.layout).includes(pane.paneId));},'same clipboard terminal moved into center');
  if((await read()).rightPaneOpen){await click('[data-pane-area="center"] button[aria-label="Toggle sidebar"]');await until(async()=>!(await read()).rightPaneOpen,'empty clipboard sidebar closed before actual center remount');}
 } else throw Error('Unknown owned clipboard area action');
 const after=await read();assert.deepEqual(resources(after),resources(before));const terminalAfter=await inspect();if(terminalBefore)assert.deepEqual(terminalAfter,terminalBefore);
 await until(()=>evaluate(`Boolean(document.querySelector('[data-terminal-id="${id}"][data-restore-state="attached"] .xterm-screen'))`),'same clipboard terminal resource reattached');
 const path=join(output,'clipboard-pane-area-ui.json'),rows=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):[];rows.push({action,before,after,terminalBefore,terminalAfter});writeFileSync(path,JSON.stringify(rows,null,2)+'\n');
}
