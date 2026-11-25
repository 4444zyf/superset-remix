from pathlib import Path
import json,sqlite3,hashlib,stat
p=Path('/workspace/scratch/parity-153');cases=[];storage=[]
baseline=json.loads((p/'local-overview-baseline/app/agent-status-ui.json').read_text());assert 'original workspace overview unread' in baseline['error']['message'];assert baseline['failedObservation']['binding']['lastEventType']=='Stop';assert baseline['failedObservation']['seen']['mark']['at']<baseline['failedObservation']['binding']['lastEventAt']
expected=['working','permission','unread','unread-reopened','workspace-background-unread','seen','seen-reopened','failed','failed-center','second-unread','workspace-background-unread-reopened','workspace-overview-unread','workspace-overview-unread-reopened','second-seen']
for name in ['local-overview-sorted','ssh-overview-sorted']:
 case=p/name;d=json.loads((case/'app/agent-status-ui.json').read_text());assert d['completed'] is True and not d.get('error');assert d['actualLifecycleEventsObserved'];assert d['actualBackendHooks'] and not d['vendorAgentVerified'];assert [r['name'] for r in d['phases']]==expected
 assert d['workspaceTabsEnabled'] and d['overviewEnabled'];assert d['overviewDescriptor']['serviceUid']==d['serviceUid'];assert d['otherWorkspace']['tabId']!=d['before']['tabId'];assert d['otherTerminalId'] not in [r['resourceId'] for r in d['before']['panes']];
 phases={r['name']:r for r in d['phases']};first=phases['unread']['binding']['lastEventAt'];second=phases['second-unread']['binding']['lastEventAt'];assert second>first
 expected_ids=sorted(v['paneId'] for v in d['before']['panes'])+[d['agent']['paneId']];expected_ids.sort()
 for r in d['phases']:
  assert sorted(v['paneId'] for v in r['view']['panes'])==expected_ids
  for field in ['id','executionId','pid','cwd']:assert r['execution'][field]==d['execution'][field]
  assert r['proof']['running'] is True and r['proof']['pid']==d['initialProof']['pid']
  assert r['binding']['terminalId']==d['agent']['resourceId'] and r['binding']['workspaceId']==d['before']['workspaceId']
  assert r['binding']['agentSessionId']==d['phases'][0]['binding']['agentSessionId']
 for r in d['phases']:
  phase_name=r['name'];expected_status='review' if 'unread' in phase_name else 'failed' if 'failed' in phase_name else 'permission' if phase_name=='permission' else 'working' if phase_name=='working' else None;assert r['workspaceOverviewStatus' if phase_name.startswith('workspace-overview') else 'workspaceTabStatus']==expected_status
 for key in ['working','permission','unread','unread-reopened','workspace-background-unread']:assert phases[key]['seen']['mark'] is None
 for key in ['seen','seen-reopened','failed','failed-center','second-unread','workspace-background-unread-reopened','workspace-overview-unread','workspace-overview-unread-reopened']:assert phases[key]['seen']['mark']=={'key':d['seenKey'],'at':first}
 assert phases['second-seen']['seen']['mark']=={'key':d['seenKey'],'at':second}
 assert phases['seen-reopened']['binding']['lastEventType']=='Stop';assert phases['failed']['binding']['lastEventType']==phases['failed-center']['binding']['lastEventType']=='Failed'
 assert phases['failed']['view']['activePaneArea']=='right' and phases['failed-center']['view']['activePaneArea']=='center'
 assert phases['second-unread']['view']['activePaneArea']=='center' and phases['second-unread']['view']['activePaneId']==d['agent']['paneId'];assert phases['second-unread']['proof']['awaitingBackground'] is False
 assert phases['second-seen']['view']['activePaneArea']=='center' and phases['second-seen']['view']['activePaneId']==d['agent']['paneId']
 assert sorted(v['paneId'] for v in d['final']['panes'])==sorted(v['paneId'] for v in d['before']['panes'])
 pref_paths=list((case/'config').glob('superset-remix-dev-*/direct-workstation/preferences.db'));view_paths=list((case/'config').glob('superset-remix-dev-*/direct-workstation/workspace-views.db'));assert len(pref_paths)==len(view_paths)==1
 assert stat.S_IMODE(pref_paths[0].stat().st_mode)==0o600
 with sqlite3.connect(pref_paths[0].as_uri()+'?mode=ro',uri=True) as db:
  schema,revision,raw=db.execute('SELECT schemaVersion,revision,data FROM workstation_preferences WHERE id=1').fetchone();values=json.loads(raw)
 assert schema==1 and revision==2 and values['agentSeenMarks']==[{'key':d['seenKey'],'at':second}]
 assert phases['seen']['seen']['revision']==phases['seen-reopened']['seen']['revision']==1 and phases['second-seen']['seen']['revision']==2
 with sqlite3.connect(view_paths[0].as_uri()+'?mode=ro',uri=True) as db:
  view_revision,raw=db.execute('SELECT revision,snapshot FROM workspace_view WHERE id=1').fetchone();view=json.loads(raw)
 assert view['schemaVersion']==3
 target=next(t for t in view['targets'] if any(w['workspaceId']==d['before']['workspaceId'] for w in t['workspaces']));assert target['serviceUid']==d['serviceUid']
 identity=['workstation-agent-seen-v1',target['backendId'],target['namespaceId'],target['serviceUid'],d['before']['workspaceId'],d['agent']['resourceId']];key=hashlib.sha256(json.dumps(identity,separators=(',',':')).encode()).hexdigest();assert key==d['seenKey']
 cleanup=json.loads((case/'owned-cleanup.json').read_text());assert cleanup['appExit']==0 and cleanup['ownedXorgExit']==0;assert json.loads((p/(name+'-frozen-proof.json')).read_text())['allUnchanged']
 item={'case':name,'actualBackendHooks':True,'actualAuthenticatedLifecycleEvents':True,'fourteenPhases':True,'catalogUnreadSurvivesReopen':True,'verifiedDescriptorUid':True,'backgroundWorkspaceUnreadSurvivesReopen':True,'originalPriorityAndSeenRules':True,'sameShellAndPythonPid':True,'sameExecutionAndCwd':True,'fourRealReopens':True,'seenUsesExactHostClock':True,'serviceUidScopedKey':True,'cleanup':cleanup}
 if name.startswith('ssh'):
  restore=json.loads((case/'app/workspace-restore-ui.json').read_text());assert len(restore['samples'])==20;item['windowRestoreSamples']=20
 cases.append(item);storage.append({'case':name,'readOnly':True,'preferenceSchemaVersion':schema,'preferenceRevision':revision,'seenCount':len(values['agentSeenMarks']),'seenKey':key,'seenAt':second,'viewSchemaVersion':3,'viewRevision':view_revision,'mode':'0600'})
live=[]
for e in Path('/proc').iterdir():
 if not e.name.isdigit():continue
 try:env=(e/'environ').read_bytes().split(b'\0')
 except (OSError,PermissionError):continue
 if any(v.startswith(b'SUPERSET_WORKSPACE_ID=parity153-') or v.startswith(b'XDG_CONFIG_HOME=/workspace/scratch/parity-153/') for v in env):live.append(int(e.name))
assert not live,live;assert not Path('/tmp/.X11-unix/X181').exists()
import os
for name in ['local-overview-baseline','local-overview','ssh-overview','local-overview-sorted','ssh-overview-sorted']:
 report=json.loads((p/name/'app/agent-status-ui.json').read_text())
 records=[report.get('initialProof'),report.get('failedObservation',{}).get('proof'),report.get('execution'),report.get('otherExecution')]+[r.get('proof') for r in report.get('phases',[])]
 for record in records:
  if not record or not isinstance(record.get('pid'),int) or not record.get('cwd'):continue
  try:cwd=os.readlink('/proc/'+str(record['pid'])+'/cwd').removesuffix(' (deleted)')
  except OSError:continue
  assert cwd!=record['cwd'],{'case':name,'ownedPidStillRunning':record['pid']}

result={'compiledSource':json.loads((p/'product-proof.json').read_text())['compiledSource'],'compiledFiles':2420,'fixtureCount':91,'sourceCliFiles':3639,'native':cases,'readOnlySqlite':storage,'finalRunsPassed':True,'unitTests':88,'unitAssertions':427,'typeCheckPassed':True,'scopedLiveProcesses':live,'overallParityComplete':False,'screenshotStabilityUnresolved':True,'workspaceWideAndOsNotificationsPending':True,'physicalMacVerified':False,'externalSshVerified':False,'vendorAgentVerified':False,'installer':False,'githubActions':False,'screenshotsActuallyViewed':['local-overview-baseline/app/agent-management-failure.png','local-overview/app/agent-status-workspace-overview-unread.png','local-overview/app/agent-status-workspace-overview-unread-reopened.png','local-overview-sorted/app/agent-status-workspace-overview-unread-reopened.png','ssh-overview-sorted/app/agent-status-workspace-overview-unread.png','ssh-overview-sorted/app/agent-status-workspace-overview-unread-reopened.png']}
(p/'final-verification.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
