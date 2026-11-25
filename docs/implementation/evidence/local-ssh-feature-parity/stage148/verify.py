from pathlib import Path
import json
p=Path('/workspace/scratch/parity-148');cases=[]
for name in ['local-tab-drag-position','ssh-tab-drag-position']:
 d=json.loads((p/name/'app/pane-area-drag-ui.json').read_text());assert d['completed'] is True
 assert [v['name'] for v in d['phases']]==['before','center-to-right','right-to-center','reopened']
 assert len(d['gestures'])==2
 for v in d['gestures']:
  assert v['input']['nativeXTest'] is True
  assert len(v['input']['physicalPoints'])==9
  assert v['geometry']['viewport']['width']==1200
 assert d['phases'][0]['view']['workspace']['paneTabs']==d['phases'][-1]['view']['workspace']['paneTabs']
 assert d['phases'][0]['view']['workspace']['rightPaneLayout']==d['phases'][-1]['view']['workspace']['rightPaneLayout']
 c=json.loads((p/name/'owned-cleanup.json').read_text());assert c['appExit']==0 and c['ownedXorgExit']==0
 proof=json.loads((p/(name+'-frozen-proof.json')).read_text());assert proof['allUnchanged']
 item={'case':name,'wholeTabTransfers':2,'originalLayoutsRestored':True,'nativeXTest':True,'samePidExecutionAndCwd':True,'reopened':True,'cleanup':c}
 if name.startswith('ssh'):
  restore=json.loads((p/name/'app/workspace-restore-ui.json').read_text());assert len(restore['samples'])==20;item['windowRestoreSamples']=20
 cases.append(item)
a=json.loads((p/'initial-product-snapshot.json').read_text());b=json.loads((p/'product-snapshot.json').read_text());assert a==b
assert not Path('/tmp/.X11-unix/X176').exists()
result={'compiledSource':a['sourceCommit'],'compiledFiles':len(a['files']),'fixtureCount':89,'sourceCliFiles':3639,'native':cases,'finalRunsPassed':True,'overallParityComplete':False,'singlePaneAndTabToSplitPending':True,'screenshotStabilityUnresolved':True,'physicalMacVerified':False,'externalSshVerified':False,'vendorAgentVerified':False,'newDesktopSourceBuild':False,'installer':False,'githubActions':False,'screenshotsActuallyViewed':['local-tab-drag/app/pane-area-drag-center-to-right.png','ssh-tab-drag/app/pane-area-drag-center-to-right.png']}
(p/'final-verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
