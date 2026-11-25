from pathlib import Path
import json
p=Path('/workspace/scratch/parity-149');cases=[]
assert 'whole tab accepted by original cross-area pane split target' in (p/'local-split-baseline/native.log').read_text()
for name in ['local-split-bounded','ssh-split-bounded']:
 d=json.loads((p/name/'app/pane-area-split-drag-ui.json').read_text());assert d['completed'] is True;assert not d.get('error')
 assert [v['name'] for v in d['phases']]==['before','tab-into-split','extracted-center','pane-to-right','pane-to-center','reopened']
 assert len(d['gestures'])==3
 for v in d['gestures']:
  assert v['input']['nativeXTest'] is True and len(v['input']['physicalPoints'])==8
  assert v['geometry']['sourceHit'] and v['geometry']['targetHit']
 ids=lambda w: sorted((v['paneId'],v['kind'],v['resourceId'],v.get('executionId')) for v in w['panes'])
 for v in d['phases']:assert ids(v['view']['workspace'])==ids(d['before']['workspace'])
 saved=d['phases'][-2]['view']['workspace'];reopened=d['phases'][-1]['view']['workspace']
 for key in ['paneTabs','rightPaneLayout']:assert saved[key]==reopened[key]
 c=json.loads((p/name/'owned-cleanup.json').read_text());assert c['appExit']==0 and c['ownedXorgExit']==0
 assert json.loads((p/(name+'-frozen-proof.json')).read_text())['allUnchanged']
 item={'case':name,'nativeGestures':3,'sixPhases':True,'sameResourcesAndPidExecutionCwd':True,'realReopen':True,'cleanup':c}
 if name.startswith('ssh'):
  restore=json.loads((p/name/'app/workspace-restore-ui.json').read_text());assert len(restore['samples'])==20;item['windowRestoreSamples']=20
 cases.append(item)
assert not Path('/tmp/.X11-unix/X177').exists()
live=[]
for e in Path('/proc').iterdir():
 if not e.name.isdigit():continue
 try:env=(e/'environ').read_bytes().split(b'\0')
 except (FileNotFoundError,PermissionError,ProcessLookupError):continue
 if any(v.startswith(b'SUPERSET_WORKSPACE_ID=parity149-') or v.startswith(b'XDG_CONFIG_HOME=/workspace/scratch/parity-149/') for v in env):live.append(int(e.name))
assert not live,live
result={'compiledSource':json.loads((p/'product-proof.json').read_text())['compiledSource'],'compiledFiles':2420,'fixtureCount':90,'sourceCliFiles':3639,'native':cases,'finalRunsPassed':True,'unitTests':42,'unitAssertions':248,'typeCheckPassed':True,'scopedLiveProcesses':live,'overallParityComplete':False,'screenshotStabilityUnresolved':True,'physicalMacVerified':False,'externalSshVerified':False,'vendorAgentVerified':False,'installer':False,'githubActions':False,'screenshotsActuallyViewed':['local-split-baseline/app/agent-management-failure.png','local-split-fixed/app/pane-area-split-drag-tab-into-split.png','local-split-fixed/app/pane-area-split-drag-pane-to-right.png','ssh-split-bounded/app/pane-area-split-drag-tab-into-split.png']}
(p/'final-verification.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
