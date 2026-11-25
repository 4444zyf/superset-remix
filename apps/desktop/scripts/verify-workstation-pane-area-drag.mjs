import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {agentUiDriver} from './verify-workstation-agent-ui-driver.mjs';

export async function verifyWorkstationPaneAreaDrag(options,{read,terminal,browser}) {
 const {evaluate,until}=agentUiDriver(options);
 const {nativeDrag,output,screenshot,controls,click,closeReopen,getPage}=options;
 assert.equal(typeof nativeDrag,'function');
 const before=await read(),w=before.workspace,tabId=w.activePaneTabId;
 assert.ok(w.paneTabs.some(t=>t.tabId===tabId));
 const resources=v=>v.workspace.panes.map(p=>[p.paneId,p.kind,p.resourceId,p.executionId]).sort((a,b)=>a[0].localeCompare(b[0]));
 const execution=await controls.inspectPresetTerminal(terminal.id);
 const report={before,execution,gestures:[],phases:[],nativeXTest:true};
 const save=()=>writeFileSync(join(output,'pane-area-drag-ui.json'),JSON.stringify(report,null,2)+'\n');
 const capture=async name=>{const view=await read();assert.deepEqual(resources(view),resources(before));report.phases.push({name,view});await screenshot('pane-area-drag-'+name);save();return view;};
 const drag=async(from,to)=>{
  const geometry=await evaluate(`(()=>{const source=document.querySelector('[data-pane-area="${from}"] [data-tab-id="${tabId}"]'),bar=document.querySelector('[data-pane-area="${to}"] [class~="group/root-tabs"]');if(!source||!bar)return null;const s=source.getBoundingClientRect(),b=bar.getBoundingClientRect();const start={x:s.x+Math.min(50,s.width/2),y:s.y+s.height/2},end={x:b.x+24,y:b.y+b.height/2};return {start,end,bar:{x:b.x,y:b.y,width:b.width,height:b.height},viewport:{width:innerWidth,height:innerHeight},hit:source.contains(document.elementFromPoint(start.x,start.y))};})()`);
  assert.ok(geometry?.hit,'source tab must own its visible pointer');
  const {start,end}=geometry,mid={x:(start.x+end.x)/2,y:end.y};
  const points=[start,{x:start.x+12,y:start.y},mid,{x:mid.x-25,y:mid.y},{x:mid.x+25,y:mid.y},mid,end,{x:end.x+8,y:end.y},end];
  await evaluate(`window.__ownedPaneDragStall=setInterval(()=>{const end=performance.now()+120;while(performance.now()<end){}},400);true`);
  try {report.gestures.push({from,to,geometry,input:await nativeDrag(points)});save();}
  finally {await evaluate(`clearInterval(window.__ownedPaneDragStall);delete window.__ownedPaneDragStall;true`);}
  await until(async()=>{const v=(await read()).workspace;const src=from==='center'?v.paneTabs:v.rightPaneLayout?.tabs,dst=to==='center'?v.paneTabs:v.rightPaneLayout?.tabs;return !src?.some(t=>t.tabId===tabId)&&dst?.some(t=>t.tabId===tabId);},'native original tab transfer '+from+' to '+to);
  const current=await controls.inspectPresetTerminal(terminal.id);for(const key of ['id','executionId','pid','cwd'])assert.equal(current[key],execution[key],key);
  await capture(from+'-to-'+to);
 };
 save();await capture('before');
 await drag('center','right');
 await drag('right','center');
 const restored=await read();assert.deepEqual(restored.workspace.paneTabs,w.paneTabs);assert.deepEqual(restored.workspace.rightPaneLayout,w.rightPaneLayout);
 await closeReopen();
 await until(async()=>{const v=(await read()).workspace;return JSON.stringify(v.paneTabs)===JSON.stringify(w.paneTabs)&&JSON.stringify(v.rightPaneLayout)===JSON.stringify(w.rightPaneLayout);},'both original layouts survive native transfer and real reopen');
 await capture('reopened');
 const current=await controls.inspectPresetTerminal(terminal.id);for(const key of ['id','executionId','pid','cwd'])assert.equal(current[key],execution[key],key);
 await click(`[data-pane-area="right"] [data-tab-id="${w.rightPaneLayout.activeTabId}"]`);
 await until(()=>evaluate(`Boolean(document.querySelector('[data-pane-area="right"] [data-pane-id="${browser.paneId}"]'))`),'original right guest visible again');
 assert.deepEqual(getPage().errors,[]);report.completed=true;save();
}
