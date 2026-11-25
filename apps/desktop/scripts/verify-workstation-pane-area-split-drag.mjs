import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {agentUiDriver} from './verify-workstation-agent-ui-driver.mjs';
export async function verifyWorkstationPaneAreaSplitDrag(options,{read,terminal,browser}) {
 const {evaluate,until,menu}=agentUiDriver(options);
 const {nativeDrag,output,screenshot,controls,closeReopen,click,getPage}=options;
 const before=await read(),pane=before.workspace.panes.find(p=>p.resourceId===terminal.id);assert.ok(pane);
 const execution=await controls.inspectPresetTerminal(terminal.id),report={before,execution,gestures:[],phases:[]};
 const save=()=>writeFileSync(join(output,'pane-area-split-drag-ui.json'),JSON.stringify(report,null,2)+'\n');
 const ids=w=>w.panes.map(p=>[p.paneId,p.kind,p.resourceId,p.executionId]).sort((a,b)=>a[0].localeCompare(b[0]));
 const check=async name=>{const view=await read();assert.deepEqual(ids(view.workspace),ids(before.workspace));const current=await controls.inspectPresetTerminal(terminal.id);for(const key of ['id','executionId','pid','cwd'])assert.equal(current[key],execution[key],key);report.phases.push({name,view});await screenshot('pane-area-split-drag-'+name);save();return view;};
 const drag=async(source,target)=>{
  const g=await evaluate(`(()=>{const s=${source},t=${target};if(!s||!t)return null;const a=s.getBoundingClientRect(),b=t.getBoundingClientRect(),start={x:a.x+(s.hasAttribute('data-tab-id')?Math.min(32,a.width/2):s.closest('[data-pane-area]')?.getAttribute('data-pane-area')==='right'?a.width-3:3),y:a.y+a.height/2},end={x:b.x+Math.min(40,b.width/2),y:b.y+b.height/2};return {start,end,source:{x:a.x,y:a.y,width:a.width,height:a.height},target:{x:b.x,y:b.y,width:b.width,height:b.height},sourceHit:s.contains(document.elementFromPoint(start.x,start.y)),targetHit:t.contains(document.elementFromPoint(end.x,end.y))};})()`);
  report.geometryAttempt={source,target,geometry:g};save();
  assert.ok(g?.sourceHit&&g.targetHit,'both native endpoints must own their visible pointer');
  const {start,end}=g,mid={x:(start.x+end.x)/2,y:(start.y+end.y)/2};
  await evaluate(`window.__ownedSplitDragStall=setInterval(()=>{const end=performance.now()+120;while(performance.now()<end){}},400);true`);
  try {report.gestures.push({geometry:g,input:await nativeDrag([start,{x:start.x+Math.sign(end.x-start.x)*12,y:start.y},mid,{x:mid.x+20,y:mid.y},{x:mid.x-20,y:mid.y},mid,end,end])});save();}
  finally {await evaluate(`clearInterval(window.__ownedSplitDragStall);delete window.__ownedSplitDragStall;true`);}
 };
 const header=id=>`document.querySelector('[data-pane-title-id="${id}"]')?.closest('[draggable="true"]')`;
 const bar=area=>`document.querySelector('[data-pane-area="${area}"] [class~="group/root-tabs"]')`;
 const tab=before.workspace.activePaneTabId;
 try {
 await check('before');
 await drag(`document.querySelector('[data-pane-area="center"] [data-tab-id="${tab}"]')`,header(browser.paneId));
 await until(async()=>{const w=(await read()).workspace,t=w.rightPaneLayout?.tabs.find(t=>JSON.stringify(t.layout).includes(browser.paneId));return !w.paneTabs.some(t=>t.tabId===tab)&&t?.layout.type==='split'&&JSON.stringify(t.layout).includes(pane.paneId);},'whole tab accepted by original cross-area pane split target');
 await check('tab-into-split');
 const p=await evaluate(`(()=>{const r=document.querySelector('[data-pane-title-id="${pane.paneId}"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 for(const type of ['mousePressed','mouseReleased'])await getPage().call('Input.dispatchMouseEvent',{type,...p,button:'right',clickCount:1});await menu('Move to Center');
 await until(async()=>(await read()).workspace.paneTabs.some(t=>JSON.stringify(t.layout).includes(pane.paneId)),'original menu extracts only terminal from split');
 await check('extracted-center');
 await drag(header(pane.paneId),bar('right'));
 await until(async()=>(await read()).workspace.rightPaneLayout.tabs.some(t=>JSON.stringify(t.layout).includes(pane.paneId)),'single pane dragged into other area tab bar');
 await check('pane-to-right');
 await drag(header(pane.paneId),bar('center'));
 await until(async()=>(await read()).workspace.paneTabs.some(t=>JSON.stringify(t.layout).includes(pane.paneId)),'single pane dragged back to center');
 const saved=await check('pane-to-center');await closeReopen();
 await until(async()=>{const w=(await read()).workspace;return JSON.stringify(w.paneTabs)===JSON.stringify(saved.workspace.paneTabs)&&JSON.stringify(w.rightPaneLayout)===JSON.stringify(saved.workspace.rightPaneLayout);},'native split and extraction layouts survive real reopen');
 await check('reopened');await click(`[data-pane-area="right"] [data-tab-id="${saved.workspace.rightPaneLayout.activeTabId}"]`);
 assert.deepEqual(getPage().errors,[]);report.completed=true;save();
 } catch(error) {report.error={message:error.message,stack:error.stack};save();throw error;}
}
