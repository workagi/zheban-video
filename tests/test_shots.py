"""Semantic invariants and failure gates, independent of browser/AI/network."""
import copy, json, sys, tempfile, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from project import load_project

class ShotTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.p=Path(self.tmp.name)
        (self.p/'font.ttf').write_bytes(b'font-fixture-for-path-validation-only')
        (self.p/'facts.md').write_text('fixture-rank: test data only')
        self.sb={'productionMode':'stable','format':'landscape','style':'noir-gold','fontFiles':[{'family':'Noto Serif CJK SC','path':'font.ttf'}],'music':{'bpm':120},'scenes':[{'id':'test','durationSec':6,'visual':{'type':'shot','name':'lag-copy','params':{'headline':'上一轮','opponent':['C','D','D','C']}}}]}
    def tearDown(self): self.tmp.cleanup()
    def load(self):
        (self.p/'storyboard.json').write_text(json.dumps(self.sb));return load_project(self.p)
    def fails(self,pattern):
        with self.assertRaisesRegex(ValueError,pattern):self.load()
    def ranking(self):
        self.sb['scenes'][0]['visual']={'type':'shot','name':'ranking','params':{'headline':'同一尺度','items':[{'id':str(i),'label':str(i),'value':v,'source':'fixture-rank'} for i,v in enumerate([4,9,9,0])]}}
        return self.sb['scenes'][0]['visual']['params']
    def test_copy_uses_previous_round(self):
        v=self.load()['scenes'][0]['visual'];self.assertEqual(v['computed']['own'],['C','C','D','D']);self.assertEqual(v['computed']['links'],[[0,1],[1,2],[2,3]])
    def test_derived_relation_cannot_be_overridden(self):
        self.sb['scenes'][0]['visual']['params']['own']=['D']*4;self.fails('unknown fields')
    def test_unknown_shot_fails(self):
        self.sb['scenes'][0]['visual']['name']='imaginary';self.fails('unknown registered shot')
    def test_unknown_visual_field_fails(self):
        self.sb['scenes'][0]['visual']['computed']={};self.fails('unknown shot fields')
    def test_unknown_state_fails(self):
        self.sb['scenes'][0]['visual']['params']['opponent'][1]='X';self.fails('choose one')
    def test_incomplete_relation_and_reading_hold_fail(self):
        self.sb['scenes'][0]['durationSec']=2;self.fails('needs completion')
    def test_final_fade_cannot_consume_reading_hold(self):
        self.sb['fadeOut']=3.5;self.fails('needs completion')
    def test_missing_event_fails(self):
        self.sb['scenes'][0]['visual']['params']['event']='not-real';self.fails('missing event')
    def test_event_duration_cannot_cross_cut(self):
        self.sb['scenes'][0]['events']=[{'id':'x','at':5.8,'duration':.5}];self.fails('extends outside')
    def test_ranking_sorts_and_preserves_ties_and_values(self):
        self.ranking();d=self.load()['scenes'][0]['visual']['computed'];self.assertEqual([i['id'] for i in d['items']],['1','2','0','3']);self.assertEqual([i['value'] for i in d['items']],[9,9,4,0]);self.assertEqual(d['winners'],['1','2']);self.assertEqual(d['maximum'],9)
    def test_missing_source_record_fails(self):
        params=self.ranking();params['items'][0]['source']='unknown-source';self.fails('source ids')
    def test_duplicate_id_fails(self):
        params=self.ranking();params['items'][1]['id']='0';self.fails('unique')
    def test_negative_and_nan_scores_fail(self):
        params=self.ranking()
        for invalid in [-1,float('nan'),float('inf'),True]:
            with self.subTest(invalid=invalid):params['items'][0]['value']=invalid;self.fails('finite number')
    def test_empty_scale_fails(self):
        params=self.ranking()
        for i in params['items']:i['value']=0
        self.fails('positive')
    def test_missing_font_and_custom_code_fail(self):
        (self.p/'font.ttf').unlink();self.fails('fontFiles')
        (self.p/'font.ttf').write_bytes(b'x');(self.p/'custom.js').write_text('// fixture');self.fails('custom.js')
    def test_unsupported_style_format_and_override_fail(self):
        for key,value in [('style','ink-wash'),('format','portrait'),('styleOverrides',{'overlay':{}})]:
            with self.subTest(key=key):
                before=copy.deepcopy(self.sb);self.sb[key]=value;self.fails('verified|styleOverrides');self.sb=before
    def test_scene_ownership(self):
        for key,value in [('camera','push'),('bg','bokeh'),('lines',[{'role':'title','text':'外部标题'}])]:
            with self.subTest(key=key):
                before=copy.deepcopy(self.sb);self.sb['scenes'][0][key]=value;self.fails('owns');self.sb=before
    def test_missing_voice_asset_fails_before_browser(self):
        self.sb['narration']={'clips':[{'id':'voice','file':'missing.mp3','at':0}]};self.fails('Required narration asset')
    def test_staging_has_one_profile_for_light_and_sound(self):
        self.sb['scenes'][0]['staging']='reveal';sc=self.load()['scenes'][0]
        self.assertEqual(sc['energy'],.85);self.assertEqual(sc['_staging']['flash'],.18)
        self.assertAlmostEqual(sc['visual']['computed']['complete'],2.55)
    def test_unknown_staging_fails(self):
        self.sb['scenes'][0]['staging']='invented';self.fails('unknown staging')
    def test_energy_out_of_range_fails(self):
        self.sb['scenes'][0]['energy']=1.5;self.fails('energy')
    def test_legacy_mode_defaults_to_custom(self):
        self.sb.pop('productionMode');self.sb.pop('fontFiles');self.sb['scenes'][0]['visual']={'type':'none'};self.assertEqual(self.load()['duration'],6)
if __name__=='__main__':unittest.main()
