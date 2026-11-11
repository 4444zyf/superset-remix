from pathlib import Path
import json,sqlite3
out=Path('/workspace/scratch/parity-145');proof=[]
for name in ['local-width-ready','ssh-width-ready']:
 case=out/name;viewPath=list((case/'config').glob('superset-remix-dev-*/direct-workstation/workspace-views.db'));prefPath=list((case/'config').glob('superset-remix-dev-*/direct-workstation/preferences.db'));assert len(viewPath)==len(prefPath)==1
 with sqlite3.connect(viewPath[0].as_uri()+'?mode=ro',uri=True) as db:
  revision,raw=db.execute('SELECT revision,snapshot FROM workspace_view WHERE id=1').fetchone();view=json.loads(raw);workspaces=[w for t in view['targets'] for w in t['workspaces']];assert view['schemaVersion']==3 and all('rightPaneLayout' in w for w in workspaces)
 with sqlite3.connect(prefPath[0].as_uri()+'?mode=ro',uri=True) as db:
  schema,prefRevision,raw=db.execute('SELECT schemaVersion,revision,data FROM workstation_preferences WHERE id=1').fetchone();prefs=json.loads(raw)
 report=json.loads((case/'app/pane-areas-ui.json').read_text());assert report['widthPreference']['completed'];assert schema==1 and prefs['rightPaneAreaWidth']==report['widthPreference']['reset']['values']['rightPaneAreaWidth']
 proof.append({'case':name,'readOnly':True,'viewSchemaVersion':view['schemaVersion'],'viewRevision':revision,'workspaces':len(workspaces),'workspacesWithRightLayout':sum('rightPaneLayout' in w for w in workspaces),'preferenceSchemaVersion':schema,'preferenceRevision':prefRevision,'rightPaneAreaWidth':prefs['rightPaneAreaWidth']})
(out/'persisted-width-proof.json').write_text(json.dumps(proof,indent=2)+'\n')
live=[]
for p in Path('/proc').iterdir():
 if not p.name.isdigit():continue
 try: env=(p/'environ').read_bytes().split(b'\0')
 except (OSError,PermissionError):continue
 if any(e.startswith(b'SUPERSET_WORKSPACE_ID=parity145-') or e.startswith(b'XDG_CONFIG_HOME=/workspace/scratch/parity-145/') for e in env):live.append(int(p.name))
assert not live,live
assert not Path('/tmp/.X11-unix/X173').exists()
(out/'scoped-process-cleanup.json').write_text(json.dumps({'scopedLiveProcesses':live,'x173Released':True},indent=2)+'\n')
print(json.dumps(proof))
