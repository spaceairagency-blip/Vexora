import os, sys, json, tempfile
os.environ["QT_QPA_PLATFORM"]="offscreen"
os.environ["QTWEBENGINE_CHROMIUM_FLAGS"]="--no-sandbox --disable-gpu --disable-software-rasterizer"
sys.path.insert(0,os.path.join(os.path.dirname(os.path.abspath(__file__)),".."))
SHOTS=os.path.join(tempfile.gettempdir(),"vexora-shots"); os.makedirs(SHOTS,exist_ok=True)
from PySide6.QtCore import QStandardPaths, QTimer
from PySide6.QtWidgets import QApplication
QStandardPaths.setTestModeEnabled(True)
import scheme; scheme.register()
app=QApplication(sys.argv); app.setStyle("Fusion"); app.setApplicationName("VexoraTest")
import main as M, theme
from store import Store, data_dir
from settings import Settings
fails=[]
def check(name, cond):
    print(("PASS " if cond else "FAIL ")+name)
    if not cond: fails.append(name)

# --- 1. migration + hostile import
for f in data_dir().glob("data.json"): f.unlink()
(data_dir()/"data.json").write_text(json.dumps({"settings":{"theme":"Black","accent":"#e8833a","engine":"Bing"},"bookmarks":[],"history":[]}))
s=Store()
check("legacy Black -> Monochrome", s.settings["theme"]=="Monochrome")
check("legacy non-default accent kept as override", s.settings["overrides"]=={"accent":"#E8833A"})
check("other legacy settings kept", s.settings["engine"]=="Bing")
s.import_data({"settings":{"theme":"Nope","overrides":{"accent":"javascript:1","bg":"#abc"},"intensity":"x","appearance":"purple",
   "custom_themes":{"Ocean":{}, "ok":{k:"#123456" for k in theme.TOKENS}, "bad":{"accent":"#fff"}}}},save=False)
check("unknown theme falls back", s.settings["theme"]==theme.DEFAULT)
check("invalid override colour dropped, valid kept", s.settings["overrides"]=={"bg":"#AABBCC"})
check("bad appearance/intensity ignored", s.settings["appearance"]=="dark" and s.settings["intensity"]==1.0)
check("custom themes validated (builtin name + incomplete rejected)", list(s.settings["custom_themes"])==["ok"])
from store import DEFAULTS
check("DEFAULTS not mutated by store", DEFAULTS["overrides"]=={} and DEFAULTS["custom_themes"]=={})
for f in data_dir().glob("data.json"): f.unlink()

# --- 2. live window
store=Store(); b=M.Blocker(); ua="x"
win=M.Browser(M.make_profile(app,"VexoraT1",ua,b),M.make_profile(app,None,ua,b),b,M.Updater(),store)
win.resize(1100,700); win.show()
def run():
    for n in theme.BUILTIN:
        store.settings["theme"]=n; store.settings["appearance"]="light" if n=="Light" else "dark"
        win.apply_theme(); app.processEvents()
        check(f"apply {n}: stylesheet bg = token", theme.resolve(store.settings)["bg"].lower() in app.styleSheet().lower())
        win.grab().save(os.path.join(SHOTS,n.replace(" ","_")+".png"))
    store.settings.update(theme=theme.DEFAULT, appearance="dark")
    win.apply_theme()
    check("new tab is the internal vexora:// page", win.newtab_url().startswith("vexora://app/newtab"))
    # --- 3. settings dialog lifecycle
    d=Settings(win); d.nav.setCurrentRow(1); d.show(); app.processEvents()
    d.change(theme="Ocean", overrides={}); 
    check("preview applied without saving", store.settings["theme"]==theme.DEFAULT and win.t["bg"].lower()=="#0f1a24")
    check("Apply enabled when dirty", d.btn_apply.isEnabled())
    d.revert_draft(); check("Revert restores", win.t["bg"].lower()=="#15151b" and not d.btn_apply.isEnabled())
    d.change(theme="Emerald"); d.change(overrides={"accent":"#FF00AA"}); d.apply_draft()
    check("Apply persists theme+override", store.settings["theme"]=="Emerald" and store.settings["overrides"]=={"accent":"#FF00AA"})
    d.change(intensity=.5, rebuild=False); d.apply_draft()
    check("intensity persisted & applied", store.settings["intensity"]==.5)
    import settings as S
    S.QInputDialog.getText=staticmethod(lambda *a,**k:("My Theme",True))
    d.save_theme()
    check("save custom theme", "My Theme" in store.settings["custom_themes"] and store.settings["theme"]=="My Theme" and store.settings["overrides"]=={})
    saved=store.settings["custom_themes"]["My Theme"]
    check("saved tokens are the full set of 6 valid colours", set(saved)==set(theme.TOKENS))
    S.QInputDialog.getText=staticmethod(lambda *a,**k:("Renamed",True))
    d.rename_theme()
    check("rename custom theme (active theme follows)", list(store.settings["custom_themes"])==["Renamed"] and store.settings["theme"]=="Renamed")
    S.QInputDialog.getText=staticmethod(lambda *a,**k:("Ocean",True))
    S.QMessageBox.warning=staticmethod(lambda *a,**k:None)
    calls=[0]
    def txt(*a,**k):
        calls[0]+=1; return ("Ocean",True) if calls[0]==1 else ("",False)
    S.QInputDialog.getText=staticmethod(txt); d.save_theme()
    check("cannot reuse built-in name", "Ocean" not in store.settings["custom_themes"])
    S.QMessageBox.question=staticmethod(lambda *a,**k:S.QMessageBox.StandardButton.Yes)
    d.delete_theme()
    check("delete custom theme -> falls back to Aurora", store.settings["custom_themes"]=={} and store.settings["theme"]==theme.DEFAULT)
    d.change(theme="Crimson"); d.apply_draft(); d.reset_theme()
    check("reset to default", store.settings["theme"]==theme.DEFAULT and store.settings["overrides"]=={} and store.settings["intensity"]==1.0)
    d.nav.setCurrentRow(1); d.grab().save(os.path.join(SHOTS,"settings_appearance.png"))
    # revert-on-close
    d.change(theme="Crimson"); d.done(0); app.processEvents()
    check("closing dialog without Apply reverts preview", win.t["bg"].lower()=="#15151b" and store.settings["theme"]==theme.DEFAULT)
    # system mode
    store.settings["appearance"]="system"; win.system_dark=lambda:False; win.apply_theme()
    check("follow system (light) swaps to Light theme", win.t["bg"].lower()=="#eef0f4")
    # persistence round-trip
    store.settings.update(theme="Ocean", appearance="dark"); store.flush()
    check("persisted across sessions", Store().settings["theme"]=="Ocean")
    print("FAILS:", fails); app.quit()
QTimer.singleShot(1200,run)
app.exec()
sys.exit(1 if fails else 0)
