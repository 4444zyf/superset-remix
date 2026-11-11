import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {agentUiDriver} from './verify-workstation-agent-ui-driver.mjs';

export async function verifyWorkstationPaneAreasUi(options, {scope, terminal, guestRead}) {
 const {getPage, click, screenshot, output, closeReopen, controls} = options;
 const {evaluate, until, menu} = agentUiDriver(options);
 const report={source:'original pane engine and resizer, physical host input, real private V3 storage',phases:[]};
 const save=()=>writeFileSync(join(output,'pane-areas-ui.json'),JSON.stringify(report,null,2)+'\n');
 const read=()=>evaluate(`(async()=>{const r=await window.directWorkstation.getWorkspaceViewV3();if(r.invalid||r.snapshot?.schemaVersion!==3)throw Error('Expected valid V3 storage');const t=r.snapshot.targets.find(t=>t.connectionId===${JSON.stringify(scope.d.connectionId)}),w=t?.workspaces.find(w=>w.workspaceId===${JSON.stringify(scope.w.workspaceId)});if(!w)throw Error('Missing owned workspace');return {revision:r.revision,workspace:w};})()`);
 const point=selector=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);return {x,y,width:r.width,height:r.height,hit:e===hit||e.contains(hit)};})()`);
 const mouse=async(position,button='left',count=1)=>{
  assert.ok(position?.hit,'physical target must own its visible hit point');
  for(const type of ['mousePressed','mouseReleased'])await getPage().call('Input.dispatchMouseEvent',{type,x:position.x,y:position.y,button,clickCount:count});
 };
 const toolbar=async text=>{
  const p=await until(()=>evaluate(`(()=>{const e=[...document.querySelectorAll('.ws-window-toolbar button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!e)return null;const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);return {x,y,hit:hit===e||e.contains(hit)};})()`),'visible original toolbar '+text);await mouse(p);
 };
 const geometry=()=>evaluate(`(()=>{const root=document.querySelector('[data-workstation-pane-areas]'),right=root?.children[1];if(!right)return null;return {viewport:innerWidth,root:root.getBoundingClientRect().width,right:right.getBoundingClientRect().width,passthrough:document.documentElement.hasAttribute('data-pointer-passthrough')};})()`);
 const ids=w=>w.panes.map(p=>[p.paneId,p.kind,p.resourceId,p.executionId]).sort((a,b)=>a[0].localeCompare(b[0]));
 const installFocusTrace=()=>evaluate(`(()=>{window.__ownedAreaFocusTrace=[];window.__ownedAreaFocusListener=e=>{const t=e.target;if(window.__ownedAreaFocusTrace.length<80)window.__ownedAreaFocusTrace.push({time:performance.now(),tag:t.tagName,area:t.closest?.('[data-pane-area]')?.getAttribute('data-pane-area')??null,pane:t.closest?.('[data-pane-id]')?.getAttribute('data-pane-id')??null,label:t.getAttribute?.('aria-label')??null,stack:new Error('Owned passive focus trace').stack});};document.addEventListener('focusin',window.__ownedAreaFocusListener,true);return true;})()`);
 const focusTrace=()=>evaluate(`({events:window.__ownedAreaFocusTrace??[],active:{tag:document.activeElement?.tagName,area:document.activeElement?.closest?.('[data-pane-area]')?.getAttribute('data-pane-area')??null,pane:document.activeElement?.closest?.('[data-pane-id]')?.getAttribute('data-pane-id')??null}})`);
 await installFocusTrace();
 const original=await read(),browser=original.workspace.panes.find(p=>p.kind==='browser'&&p.paneId===original.workspace.activePaneId);
 assert.ok(browser);report.before=original;report.terminalBefore=await controls.inspectPresetTerminal(terminal.id);save();
 const browserSelector=`[data-pane-title-id="${browser.paneId}"]`;
 try {
  await mouse(await point(browserSelector),'right');await menu('Move to Right Side');
  await until(async()=>{const r=await read();return r.workspace.rightPaneOpen&&r.workspace.activePaneArea==='right'&&r.workspace.rightPaneLayout?.tabs.some(t=>JSON.stringify(t.layout).includes(browser.paneId));},'browser moved through the original right-side menu');
  await until(()=>evaluate(`Boolean(document.querySelector('[data-pane-area="right"] [data-pane-id="${browser.paneId}"]'))`),'right browser visible');
  const moved=await read();assert.deepEqual(ids(moved.workspace),ids(original.workspace));report.phases.push({name:'moved-right',view:moved,geometry:await geometry()});await screenshot('pane-areas-moved-right');save();
  const handle='[data-workstation-pane-areas] > div:nth-child(2) > [role="separator"]';
  const start=await point(handle);assert.ok(start?.hit,'sidebar handle owns the actual mid-body hit point');
  await getPage().call('Input.dispatchMouseEvent',{type:'mousePressed',x:start.x,y:start.y,button:'left',clickCount:1});
  assert.equal((await geometry()).passthrough,true);
  await evaluate(`window.__ownedAreaResizeStall=setInterval(()=>{const until=performance.now()+120;while(performance.now()<until){}},400);true`);
  try {
   for(const dx of [-80,-25,-105,-70]) {await getPage().call('Input.dispatchMouseEvent',{type:'mouseMoved',x:start.x+dx,y:start.y,button:'left',buttons:1});await delay(dx===-105?600:100);}
   await getPage().call('Input.dispatchMouseEvent',{type:'mouseReleased',x:start.x-70,y:start.y,button:'left',clickCount:1});
  } finally {await evaluate(`clearInterval(window.__ownedAreaResizeStall);delete window.__ownedAreaResizeStall;true`);}
  const resized=await until(async()=>{const g=await geometry();return !g.passthrough&&Math.abs(g.right-report.phases[0].geometry.right-70)<2?g:null;},'original RAF resizer keeps the final oscillating gesture');
  report.phases.push({name:'resized',geometry:resized,view:await read(),focus:await focusTrace()});await screenshot('pane-areas-resized');save();
  if(process.argv.includes('--pane-area-width')) {
   report.widthPreference={resized:await until(async()=>{const p=await evaluate('window.directWorkstation.getPreferences()');return !p.invalid&&Math.abs(p.values.rightPaneAreaWidth-resized.right)<2?p:null;},'final width persisted through existing private preference CAS')};save();
   await closeReopen();await installFocusTrace();
   await until(async()=>String(await guestRead('document.title')).includes('Owned browser'),'original right guest reconnects before observing saved user width');
   const restored=await until(async()=>{const g=await geometry();return g&&Math.abs(g.right-resized.right)<2?g:null;},'custom user width restored on a normal window reopen');
   assert.deepEqual(ids((await read()).workspace),ids(original.workspace));
   report.phases.push({name:'width-reopened',geometry:restored,view:await read()});await screenshot('pane-areas-width-reopened');save();
  }
  await mouse(await point(handle),'left',2);
  await until(async()=>!(await geometry()).passthrough,'double click ends its resize gesture');
  const reset=await geometry();report.phases.push({name:'reset',geometry:reset,view:await read(),focus:await focusTrace()});await screenshot('pane-areas-reset');save();
  assert.ok(Math.abs(reset.right-Math.round(reset.viewport*0.4))<2,'double click restores the original viewport-based default width');
  if(process.argv.includes('--pane-area-width')) {report.widthPreference.reset=await until(async()=>{const p=await evaluate('window.directWorkstation.getPreferences()');return !p.invalid&&p.values.rightPaneAreaWidth===Math.round(reset.viewport*0.4)?p:null;},'double click persists the original viewport default');save();}
  await toolbar('Files');report.afterFilesClick={view:await read(),focus:await focusTrace()};save();
  await until(async()=>{const r=await read();return r.workspace.activeTool==='files'&&r.workspace.activePaneArea==='right';},'Files is a center tool while the right browser stays active');
  assert.ok(await evaluate(`Boolean(document.querySelector('[data-pane-area="right"] [data-workstation-browser-pane]'))`));
  assert.ok((await guestRead('document.title')).includes('Owned browser'));
  report.phases.push({name:'files-with-right',view:await read()});await screenshot('pane-areas-files-with-right');save();
  await closeReopen();await installFocusTrace();
  await until(async()=>{const r=await read();return r.workspace.activeTool==='files'&&r.workspace.rightPaneOpen&&r.workspace.rightPaneLayout?.tabs.some(t=>JSON.stringify(t.layout).includes(browser.paneId));},'both saved areas survive a normal window reopen');
  await until(async()=>String(await guestRead('document.title')).includes('Owned browser'),'original right guest restored');
  report.phases.push({name:'reopened',view:await read(),geometry:await geometry()});await screenshot('pane-areas-reopened');save();
  if(process.argv.includes('--pane-area-width')) {assert.ok(Math.abs((await geometry()).right-report.widthPreference.reset.values.rightPaneAreaWidth)<2);report.widthPreference.completed=true;save();}
  await click('[data-pane-area="right"] button[aria-label="Merge into center"]');
  await until(async()=>{const r=await read();return !r.workspace.rightPaneOpen&&r.workspace.paneTabs?.some(t=>JSON.stringify(t.layout).includes(browser.paneId));},'original merge moves all tabs and closes the sidebar');
  const merged=await read();assert.equal(merged.workspace.activeTool,'terminal','merging a right browser reveals its center content');assert.deepEqual(ids(merged.workspace),ids(original.workspace));
  report.phases.push({name:'merged-center',view:merged});await screenshot('pane-areas-merged-center');save();
  await click('[data-pane-area="center"] button[aria-label="Toggle sidebar"]');
  await until(()=>evaluate(`Boolean(document.querySelector('[data-pane-area="right"]'))`),'empty right area revealed');
  await click('[data-pane-area="right"] button[data-slot="dropdown-menu-trigger"]');await menu('Browser');
  const added=await until(async()=>{const r=await read(),pane=r.workspace.panes.find(p=>p.kind==='browser'&&!original.workspace.panes.some(old=>old.paneId===p.paneId));return pane&&r.workspace.activePaneArea==='right'?{view:r,pane}:null;},'new browser is created in the explicitly selected empty right area');
  report.phases.push({name:'created-in-empty-right',view:added.view});await screenshot('pane-areas-created-right');save();
  await mouse(await point(`[data-pane-title-id="${added.pane.paneId}"]`),'right');await menu('Close pane');
  await until(async()=>!(await read()).workspace.panes.some(p=>p.paneId===added.pane.paneId),'only the new right browser is closed');
  await click('[data-pane-area="right"] button[aria-label="Toggle sidebar"]');
  report.terminalAfter=await controls.inspectPresetTerminal(terminal.id);
  for(const key of ['id','executionId','pid','cwd'])assert.equal(report.terminalAfter[key],report.terminalBefore[key],key);
  assert.deepEqual(getPage().errors,[]);report.completed=true;save();
 } finally {
  report.finalView=await read();report.finalFocus=await focusTrace();
  await evaluate(`document.removeEventListener('focusin',window.__ownedAreaFocusListener,true);delete window.__ownedAreaFocusListener;delete window.__ownedAreaFocusTrace;true`);
  const view=await read();if(view.workspace.activeTool==='files') {await toolbar('Terminal');await until(async()=>(await read()).workspace.activeTool!=='files','center terminal restored for owned HTTP cleanup');}
  save();
 }
}
